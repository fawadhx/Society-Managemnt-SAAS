-- ============================================================
-- Society / Plaza Manager — PostgreSQL schema (self-hosted)
-- Phase 1 of the Supabase → self-hosted Postgres migration.
-- Full desired state. Safe to run on a fresh database.
-- Running on an existing database drops the old tenant tables.
--
-- Diverges from lib/schema.sql as follows (see MIGRATION-NOTES.md
-- at the repo root for the full rationale):
--   - No dependency on Supabase's auth.users / auth.uid().
--   - `users` replaces both auth.users and app_users in one table,
--     and now owns its own password_hash for custom auth.
--   - New `sessions` table backs custom session-token auth.
--   - Row-Level Security is removed entirely (see the notice below).
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
-- pgcrypto is NOT required here: PostgreSQL 13+ ships gen_random_uuid()
-- natively, which is what users.id / sessions.id use below.
-- uuid-ossp IS kept because every other table below still defaults its
-- id via uuid_generate_v4() and those tables are intentionally left
-- unchanged in this phase.
create extension if not exists "uuid-ossp";

-- ── Enums ───────────────────────────────────────────────────
do $$ begin
  create type subscription_tier as enum ('TIER_1', 'TIER_2', 'TIER_3');
exception when duplicate_object then null; end $$;

do $$ begin
  create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type app_role as enum ('SUPER_ADMIN', 'SOCIETY_ADMIN');
exception when duplicate_object then null; end $$;

do $$ begin
  create type society_kind as enum ('society', 'plaza');
exception when duplicate_object then null; end $$;

-- ── Drop old tenant tables (idempotent reset) ───────────────
drop table if exists payments        cascade;
drop table if exists invoices        cascade;
drop table if exists residents       cascade;
drop table if exists units           cascade;
drop table if exists receipt_counters cascade;
drop table if exists plan_change_requests cascade;
drop table if exists subscriptions   cascade;
drop table if exists society_members cascade;
drop table if exists audit_logs      cascade;
drop table if exists societies       cascade;
drop table if exists sessions        cascade;
drop table if exists users           cascade;

-- ============================================================
-- users — replaces BOTH Supabase's auth.users and the old
-- app_users table. Single source of truth for identity, the
-- password hash, and the platform role.
-- ============================================================
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text not null,
  name          text not null default '',
  role          app_role not null default 'SOCIETY_ADMIN',
  status        text not null default 'Active' check (status in ('Active', 'Suspended')),
  -- Set by an admin "Reset password" action; forces a new-password screen at next login.
  must_change_password boolean not null default false,
  created_at    timestamptz not null default now()
);
comment on table users is 'Every authenticated user (self-hosted auth). role = SUPER_ADMIN grants platform-wide access.';

-- ============================================================
-- sessions — server-side session tokens for custom auth
-- ============================================================
create table sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index idx_sessions_user on sessions (user_id);

-- ============================================================
-- societies — the tenant
-- ============================================================
create table societies (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  slug          text not null unique,
  kind          society_kind not null default 'society',
  address       text not null default '',
  logo_url      text,
  primary_color text,
  default_fee   numeric(12,2) not null default 0,
  due_day       int not null default 10 check (due_day between 1 and 28),
  late_fee_pct  numeric(5,2) not null default 0,
  status        text not null default 'active' check (status in ('active', 'suspended')),
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now()
);
comment on table societies is 'Top-level tenant (a housing society or a commercial plaza).';

-- ============================================================
-- society_members — which users may access which tenant
-- ============================================================
create table society_members (
  society_id  uuid not null references societies(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  role        app_role not null default 'SOCIETY_ADMIN',
  -- owner  = bought the plan, full access + manages the team
  -- editor = can create / edit / delete workspace data
  -- viewer = read-only
  access      text not null default 'editor' check (access in ('owner', 'editor', 'viewer')),
  created_at  timestamptz not null default now(),
  primary key (society_id, user_id)
);

-- ============================================================
-- subscriptions — one row per society; the ONLY place tier + seats live
-- ============================================================
create table subscriptions (
  society_id        uuid primary key references societies(id) on delete cascade,
  tier              subscription_tier not null default 'TIER_1',
  status            subscription_status not null default 'trialing',
  trial_ends_at     timestamptz,
  current_period_end timestamptz,
  included_seats    int not null default 1,
  extra_seats       int not null default 0,
  extra_seat_price  numeric(12,2) not null default 500,
  updated_by        uuid references users(id) on delete set null,
  updated_at        timestamptz not null default now()
);
comment on table subscriptions is 'Tier sets features/caps; users are seats. MRR = plan price + extra_seats * extra_seat_price.';

-- ============================================================
-- plan_change_requests — society-admin requests the super admin works
-- ============================================================
create table plan_change_requests (
  id           uuid primary key default uuid_generate_v4(),
  society_id   uuid not null references societies(id) on delete cascade,
  requested_by uuid references users(id) on delete set null,
  kind         text not null check (kind in ('tier', 'seats')),
  detail       text not null default '',
  status       text not null default 'open' check (status in ('open', 'done', 'declined')),
  created_at   timestamptz not null default now()
);

-- ============================================================
-- units
-- ============================================================
create table units (
  id             uuid primary key default uuid_generate_v4(),
  society_id     uuid not null references societies(id) on delete cascade,
  unit_number    text not null,
  block          text not null default '',
  type           text not null default 'Apartment',
  monthly_charge numeric(12,2) not null default 0,
  status         text not null default 'Vacant' check (status in ('Occupied', 'Vacant')),
  created_at     timestamptz not null default now(),
  unique (society_id, unit_number)
);

-- ============================================================
-- residents — real table (deposits, approvals, move-out history)
-- ============================================================
create table residents (
  id               uuid primary key default uuid_generate_v4(),
  society_id       uuid not null references societies(id) on delete cascade,
  unit_id          uuid not null references units(id) on delete cascade,
  name             text not null,
  phone            text not null default '',
  email            text,
  security_deposit numeric(12,2) not null default 0,
  advance_rent     numeric(12,2) not null default 0,
  account_status   text not null default 'Pending' check (account_status in ('Pending', 'Active', 'Inactive')),
  moved_out_at     timestamptz,
  left_with_notice boolean,
  created_at       timestamptz not null default now()
);
create index idx_residents_unit on residents (unit_id);
create index idx_residents_society on residents (society_id);

-- ============================================================
-- invoices
-- ============================================================
create table invoices (
  id            uuid primary key default uuid_generate_v4(),
  society_id    uuid not null references societies(id) on delete cascade,
  unit_id       uuid not null references units(id) on delete cascade,
  resident_name text not null default '',
  period        text not null,
  amount        numeric(12,2) not null,
  outstanding   numeric(12,2) not null,
  status        text not null default 'Pending' check (status in ('Pending', 'Paid', 'Partial', 'Overdue')),
  due_date      date not null,
  created_at    timestamptz not null default now()
);
create index idx_invoices_unit on invoices (unit_id);
create index idx_invoices_society on invoices (society_id);

-- ============================================================
-- payments
-- ============================================================
create table payments (
  id             uuid primary key default uuid_generate_v4(),
  society_id     uuid not null references societies(id) on delete cascade,
  invoice_id     uuid not null references invoices(id) on delete cascade,
  amount_paid    numeric(12,2) not null,
  method         text not null default 'Bank Transfer'
                   check (method in ('Bank Transfer', 'JazzCash', 'EasyPaisa', 'Cash', 'Security Deposit', 'Adjustment')),
  status         text not null default 'Confirmed' check (status in ('Pending', 'Confirmed')),
  receipt_number text not null,
  paid_on        date not null default current_date,
  created_at     timestamptz not null default now()
);
create index idx_payments_invoice on payments (invoice_id);
create index idx_payments_society on payments (society_id);

-- ============================================================
-- receipt_counters — atomic per-society receipt numbering
-- ============================================================
create table receipt_counters (
  society_id  uuid primary key references societies(id) on delete cascade,
  next_number int not null default 1000
);

create or replace function public.next_receipt(p_society uuid)
returns text language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into receipt_counters (society_id, next_number) values (p_society, 1000)
    on conflict (society_id) do nothing;
  update receipt_counters set next_number = next_number + 1
    where society_id = p_society returning next_number - 1 into n;
  return 'REC-' || n::text;
end $$;

-- ============================================================
-- audit_logs — written for all tiers; surfaced in UI on TIER_3 only
-- ============================================================
create table audit_logs (
  id            uuid primary key default uuid_generate_v4(),
  society_id    uuid not null references societies(id) on delete cascade,
  user_id       uuid references users(id) on delete set null,
  action        text not null,
  performed_by  text not null default 'system',
  metadata      jsonb not null default '{}',
  timestamp     timestamptz not null default now()
);
create index idx_audit_logs_society on audit_logs (society_id, timestamp desc);

-- ============================================================
-- TIER_3 add-ons: CRM (leads) + CMS (public website)
-- FK to societies(id) on delete cascade → dropped automatically when the
-- `drop table if exists societies cascade` above runs on a reset.
-- ============================================================

do $$ begin
  create type lead_status as enum ('new', 'contacted', 'viewing', 'negotiating', 'won', 'lost');
exception when duplicate_object then null; end $$;

-- leads — prospective residents/tenants (website inquiry form or manual entry)
create table if not exists leads (
  id                    uuid primary key default uuid_generate_v4(),
  society_id            uuid not null references societies(id) on delete cascade,
  name                  text not null,
  phone                 text not null default '',
  email                 text,
  status                lead_status not null default 'new',
  source                text not null default 'website'
                          check (source in ('website', 'manual', 'referral', 'walk-in')),
  budget                numeric(12,2),
  unit_id               uuid references units(id) on delete set null,
  unit_pref             text not null default '',
  message               text not null default '',
  assigned_to           uuid references users(id) on delete set null,
  notes                 text not null default '',
  converted_resident_id uuid references residents(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_leads_society on leads (society_id, created_at desc);
comment on table leads is 'CRM pipeline of prospective residents/tenants (T3). source=website rows come from the public site form.';

-- society_sites — one editable public-website document per society (T3 CMS)
create table if not exists society_sites (
  society_id  uuid primary key references societies(id) on delete cascade,
  published   boolean not null default false,
  content     jsonb not null default '{}',
  updated_by  uuid references users(id) on delete set null,
  updated_at  timestamptz not null default now()
);
comment on table society_sites is 'Public marketing site for a T3 society, rendered at /site/<slug>.';

-- ============================================================
-- NOTICE — Tenant isolation is enforced in the APPLICATION LAYER
--
-- This schema runs on plain self-hosted Postgres, not Supabase, so
-- there is no auth.uid() / auth.jwt() for Row-Level Security policies
-- to key off. RLS, and the is_super_admin() / is_society_member() /
-- can_access_society() helper functions that backed it, have been
-- removed entirely from this file on purpose.
--
-- This means Postgres will NOT stop a query from reading or writing
-- another society's data. Every query that touches a tenant-scoped
-- table (societies, society_members, subscriptions,
-- plan_change_requests, units, residents, invoices, payments,
-- receipt_counters, audit_logs, leads, society_sites) MUST filter by
-- society_id itself, and every API route MUST re-derive society_id
-- from the authenticated session — never trust a society_id supplied
-- by the client — before running that query.
-- ============================================================

-- ============================================================
-- Seed: promote a super admin (run AFTER the first user is created)
--   update users set role = 'SUPER_ADMIN' where email = 'you@company.com';
-- ============================================================
