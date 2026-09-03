-- ============================================================
-- Society / Plaza Manager — PostgreSQL schema (Supabase)
-- Full desired state. Safe to run on a fresh project.
-- Running on an existing project drops the old tenant tables.
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

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
drop table if exists app_users       cascade;

-- ============================================================
-- app_users — mirror of auth.users carrying the platform role
-- ============================================================
create table app_users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  name        text not null default '',
  role        app_role not null default 'SOCIETY_ADMIN',
  status      text not null default 'Active' check (status in ('Active', 'Suspended')),
  created_at  timestamptz not null default now()
);
comment on table app_users is 'Every authenticated user. role = SUPER_ADMIN grants platform-wide access.';

-- Auto-create an app_users row whenever a Supabase auth user is created.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_users (id, email, name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email,''), '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'role')::app_role, 'SOCIETY_ADMIN')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

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
  created_by    uuid references app_users(id) on delete set null,
  created_at    timestamptz not null default now()
);
comment on table societies is 'Top-level tenant (a housing society or a commercial plaza).';

-- ============================================================
-- society_members — which users may access which tenant
-- ============================================================
create table society_members (
  society_id  uuid not null references societies(id) on delete cascade,
  user_id     uuid not null references app_users(id) on delete cascade,
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
  updated_by        uuid references app_users(id) on delete set null,
  updated_at        timestamptz not null default now()
);
comment on table subscriptions is 'Tier sets features/caps; users are seats. MRR = plan price + extra_seats * extra_seat_price.';

-- ============================================================
-- plan_change_requests — society-admin requests the super admin works
-- ============================================================
create table plan_change_requests (
  id           uuid primary key default uuid_generate_v4(),
  society_id   uuid not null references societies(id) on delete cascade,
  requested_by uuid references app_users(id) on delete set null,
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
  user_id       uuid references app_users(id) on delete set null,
  action        text not null,
  performed_by  text not null default 'system',
  metadata      jsonb not null default '{}',
  timestamp     timestamptz not null default now()
);
create index idx_audit_logs_society on audit_logs (society_id, timestamp desc);

-- ============================================================
-- Helper functions for RLS
-- ============================================================
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_users
    where id = auth.uid() and role = 'SUPER_ADMIN' and status = 'Active'
  );
$$;

create or replace function public.is_society_member(p_society uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from society_members
    where society_id = p_society and user_id = auth.uid()
  );
$$;

-- Convenience: societies the caller can see (member OR super admin).
create or replace function public.can_access_society(p_society uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or public.is_society_member(p_society);
$$;

-- ============================================================
-- Row-Level Security
-- ============================================================
alter table app_users            enable row level security;
alter table societies            enable row level security;
alter table society_members      enable row level security;
alter table subscriptions        enable row level security;
alter table plan_change_requests enable row level security;
alter table units                enable row level security;
alter table residents            enable row level security;
alter table invoices             enable row level security;
alter table payments             enable row level security;
alter table audit_logs           enable row level security;
alter table receipt_counters     enable row level security;

-- ── app_users: self-read; super admin full ─────────────────
create policy "app_users self read"   on app_users for select using (id = auth.uid() or public.is_super_admin());
create policy "app_users self update" on app_users for update using (id = auth.uid()) with check (id = auth.uid());
create policy "app_users admin write" on app_users for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ── societies ─────────────────────────────────────────────
create policy "societies read"  on societies for select using (public.can_access_society(id));
create policy "societies write society-admin" on societies for update
  using (public.is_society_member(id)) with check (public.is_society_member(id));
create policy "societies admin all" on societies for all
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ── society_members ───────────────────────────────────────
create policy "members read"  on society_members for select using (user_id = auth.uid() or public.can_access_society(society_id));
create policy "members admin all" on society_members for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ── subscriptions (read for members, writes super-admin only) ──
create policy "subs read"      on subscriptions for select using (public.can_access_society(society_id));
create policy "subs admin all" on subscriptions for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ── plan_change_requests (members create/read own; super admin all) ──
create policy "pcr read"   on plan_change_requests for select using (public.can_access_society(society_id));
create policy "pcr insert" on plan_change_requests for insert with check (public.is_society_member(society_id));
create policy "pcr admin"  on plan_change_requests for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ── tenant data tables: full access for members + super admin ──
create policy "units all"     on units     for all using (public.can_access_society(society_id)) with check (public.can_access_society(society_id));
create policy "residents all" on residents for all using (public.can_access_society(society_id)) with check (public.can_access_society(society_id));
create policy "invoices all"  on invoices  for all using (public.can_access_society(society_id)) with check (public.can_access_society(society_id));
create policy "payments all"  on payments  for all using (public.can_access_society(society_id)) with check (public.can_access_society(society_id));
create policy "counters all"  on receipt_counters for all using (public.can_access_society(society_id)) with check (public.can_access_society(society_id));

-- ── audit_logs: members + super admin read; insert by members; no update/delete ──
create policy "audit read"   on audit_logs for select using (public.can_access_society(society_id));
create policy "audit insert" on audit_logs for insert with check (public.can_access_society(society_id));

-- ============================================================
-- Seed: promote a super admin (run AFTER the user signs up once)
--   update app_users set role = 'SUPER_ADMIN' where email = 'you@company.com';
-- ============================================================
