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

-- Promote each client's first admin to 'owner'.
update society_members sm set access = 'owner'
where access <> 'owner'
  and sm.user_id = (
    select m.user_id from society_members m
    where m.society_id = sm.society_id
    order by m.created_at asc
    limit 1
  );
