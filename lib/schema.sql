-- ============================================================
-- Society Manager — PostgreSQL Schema
-- Run against your Supabase SQL editor or migration tool.
-- ============================================================

-- ── Extension ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Custom type for subscription tiers ──────────────────────
create type subscription_tier as enum ('TIER_1', 'TIER_2', 'TIER_3');

-- ── Societies ───────────────────────────────────────────────
create table societies (
  id            uuid primary key default uuid_generate_v4(),
  name          text        not null,
  address       text        not null default '',
  tier          subscription_tier not null default 'TIER_1',
  default_fee   numeric(12,2) not null default 0,
  created_at    timestamptz not null default now()
);

comment on table  societies is 'Top-level tenant. Every other table scopes to a society.';
comment on column societies.tier is 'Current subscription tier controlling feature access.';

-- ── Units ───────────────────────────────────────────────────
create table units (
  id            uuid primary key default uuid_generate_v4(),
  society_id    uuid        not null references societies(id) on delete cascade,
  unit_number   text        not null,
  owner_name    text        not null default '',
  phone         text        not null default '',
  status        text        not null default 'Vacant'
                  check (status in ('Occupied', 'Vacant')),

  unique (society_id, unit_number)
);

comment on table units is 'Individual properties/units belonging to a society.';

-- ── Invoices ────────────────────────────────────────────────
create table invoices (
  id            uuid primary key default uuid_generate_v4(),
  unit_id       uuid        not null references units(id) on delete cascade,
  period        text        not null,
  amount        numeric(12,2) not null,
  outstanding   numeric(12,2) not null,
  status        text        not null default 'Pending'
                  check (status in ('Pending', 'Paid', 'Partial', 'Overdue')),
  due_date      date        not null,
  created_at    timestamptz not null default now()
);

comment on table invoices is 'Monthly maintenance invoices generated per unit.';

-- ── Payments ────────────────────────────────────────────────
create table payments (
  id            uuid primary key default uuid_generate_v4(),
  invoice_id    uuid        not null references invoices(id) on delete cascade,
  amount_paid   numeric(12,2) not null,
  method        text        not null default 'Bank Transfer'
                  check (method in ('Bank Transfer', 'JazzCash', 'EasyPaisa', 'Cash')),
  receipt_number text       not null,
  created_at    timestamptz not null default now()
);

comment on table payments is 'Individual payment records against invoices.';

-- ── Audit Logs ──────────────────────────────────────────────
-- Restricted to TIER_3 (Enterprise) only.  The application
-- layer gates writes behind canAccessAuditLogs, but we also
-- enforce at the database level via an INSERT policy.
create table audit_logs (
  id            uuid primary key default uuid_generate_v4(),
  society_id    uuid        not null references societies(id) on delete cascade,
  action        text        not null,
  performed_by  text        not null default 'system',
  metadata      jsonb       not null default '{}',
  timestamp     timestamptz not null default now()
);

comment on table audit_logs is 'Append-only audit trail. Only TIER_3 societies may write.';

-- ============================================================
-- Indexes
-- ============================================================
create index idx_units_society        on units (society_id);
create index idx_invoices_unit        on invoices (unit_id);
create index idx_invoices_status      on invoices (status);
create index idx_payments_invoice     on payments (invoice_id);
create index idx_audit_logs_society   on audit_logs (society_id);
create index idx_audit_logs_timestamp on audit_logs (timestamp desc);

-- ============================================================
-- Row-Level Security (RLS)
-- ============================================================
-- Supabase sets request.jwt.claims() -> jsonb.
-- We store society_id in a custom claim so the DB can enforce
-- tenant isolation without relying on application logic.

alter table societies   enable row level security;
alter table units       enable row level security;
alter table invoices    enable row level security;
alter table payments    enable row level security;
alter table audit_logs  enable row level security;

-- ── Helper: extract the caller's society_id from JWT claims ─
create or replace function auth.society_id()
returns uuid
language sql
stable
security definer
as $$
  select (current_setting('request.jwt.claims', true)::jsonb ->> 'society_id')::uuid;
$$;

comment on function auth.society_id() is
  'Returns the society_id from the JWT claims used by RLS policies.';

-- ── Societies: members can read their own row ───────────────
create policy "Societies: read own"
  on societies for select
  using (id = auth.society_id());

create policy "Societies: update own"
  on societies for update
  using (id = auth.society_id())
  with check (id = auth.society_id());

-- ── Units: scoped to society ────────────────────────────────
create policy "Units: read own society"
  on units for select
  using (society_id = auth.society_id());

create policy "Units: insert own society"
  on units for insert
  with check (society_id = auth.society_id());

create policy "Units: update own society"
  on units for update
  using (society_id = auth.society_id())
  with check (society_id = auth.society_id());

create policy "Units: delete own society"
  on units for delete
  using (society_id = auth.society_id());

-- ── Invoices: accessed via unit ownership ───────────────────
-- Join through units to verify society membership.
create policy "Invoices: read own society"
  on invoices for select
  using (unit_id in (select id from units where society_id = auth.society_id()));

create policy "Invoices: insert own society"
  on invoices for insert
  with check (unit_id in (select id from units where society_id = auth.society_id()));

create policy "Invoices: update own society"
  on invoices for update
  using (unit_id in (select id from units where society_id = auth.society_id()))
  with check (unit_id in (select id from units where society_id = auth.society_id()));

create policy "Invoices: delete own society"
  on invoices for delete
  using (unit_id in (select id from units where society_id = auth.society_id()));

-- ── Payments: accessed via invoice → unit → society ─────────
create policy "Payments: read own society"
  on payments for select
  using (invoice_id in (
    select i.id from invoices i
    join units u on u.id = i.unit_id
    where u.society_id = auth.society_id()
  ));

create policy "Payments: insert own society"
  on payments for insert
  with check (invoice_id in (
    select i.id from invoices i
    join units u on u.id = i.unit_id
    where u.society_id = auth.society_id()
  ));

-- ── Audit Logs: TIER_3 only ────────────────────────────────
create policy "Audit logs: read own society"
  on audit_logs for select
  using (society_id = auth.society_id());

-- Only TIER_3 societies may insert audit log rows.
-- The application layer also enforces this via canAccessAuditLogs.
create policy "Audit logs: insert TIER_3 only"
  on audit_logs for insert
  with check (
    society_id = auth.society_id()
    and exists (
      select 1 from societies
      where id = auth.society_id()
        and tier = 'TIER_3'
    )
  );

-- Prevent updates and deletes on audit logs (append-only).
create policy "Audit logs: no update"
  on audit_logs for update
  using (false);

create policy "Audit logs: no delete"
  on audit_logs for delete
  using (false);
