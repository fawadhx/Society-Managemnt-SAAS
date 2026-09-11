-- ============================================================
-- Incremental migrations — run these if you already ran an
-- earlier version of schema.sql. Safe to run more than once.
-- (A fresh schema.sql already includes all of this.)
-- ============================================================

-- Move-out: did the resident give proper notice?
alter table residents add column if not exists left_with_notice boolean;

-- Payments: pending (received, not cleared) vs confirmed.
alter table payments add column if not exists status text not null default 'Confirmed'
  check (status in ('Pending', 'Confirmed'));

-- Per-user access level within a workspace.
alter table society_members add column if not exists access text not null default 'editor'
  check (access in ('owner', 'editor', 'viewer'));

-- Link every audit entry to the user who made the change.
alter table audit_logs add column if not exists user_id uuid references app_users(id) on delete set null;

-- Force a password change on next login (set by an admin "Reset password" action).
alter table app_users add column if not exists must_change_password boolean not null default false;

-- Promote each client's first admin to 'owner'.
update society_members sm set access = 'owner'
where access <> 'owner'
  and sm.user_id = (
    select m.user_id from society_members m
    where m.society_id = sm.society_id
    order by m.created_at asc
    limit 1
  );

-- ============================================================
-- TIER_3 add-ons: CRM (leads) + CMS (public website)
-- ============================================================
do $$ begin
  create type lead_status as enum ('new', 'contacted', 'viewing', 'negotiating', 'won', 'lost');
exception when duplicate_object then null; end $$;

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
  assigned_to           uuid references app_users(id) on delete set null,
  notes                 text not null default '',
  converted_resident_id uuid references residents(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_leads_society on leads (society_id, created_at desc);

create table if not exists society_sites (
  society_id  uuid primary key references societies(id) on delete cascade,
  published   boolean not null default false,
  content     jsonb not null default '{}',
  updated_by  uuid references app_users(id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table leads         enable row level security;
alter table society_sites enable row level security;

drop policy if exists "leads all" on leads;
create policy "leads all" on leads
  for all using (public.can_access_society(society_id)) with check (public.can_access_society(society_id));

drop policy if exists "sites all" on society_sites;
create policy "sites all" on society_sites
  for all using (public.can_access_society(society_id)) with check (public.can_access_society(society_id));

drop policy if exists "sites public read" on society_sites;
create policy "sites public read" on society_sites
  for select using (published = true);
