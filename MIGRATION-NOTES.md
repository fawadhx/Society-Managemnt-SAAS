# Migration notes — Supabase → self-hosted Postgres

Phase 1 of 8: infrastructure and schema only. The app still runs on Supabase
after this phase (`lib/schema.sql` is untouched and still what production
uses); `lib/schema-selfhosted.sql` is the new target schema, developed
alongside it for local/self-hosted use starting in a later phase.

This file documents exactly what differs between `lib/schema-selfhosted.sql`
and `lib/schema.sql`, so it's easy to review as a diff.

## 1. `app_users` + `auth.users` → single `users` table

Supabase's `auth.users` (managed by Supabase Auth) and our own `app_users`
(a 1:1 shadow table keyed off `auth.users.id`, kept in sync via the
`handle_new_auth_user()` trigger) are merged into one table: `users`.

- Dropped entirely: the `"uuid-ossp"`/`"pgcrypto"` extension *as required by
  `auth.users`*, the `handle_new_auth_user()` function, and the
  `on_auth_user_created` trigger on `auth.users`. There is no more
  `auth.users` — self-hosted Postgres doesn't have Supabase Auth's schema.
- `users` now owns `password_hash` directly (`auth.users` used to hold the
  credential; the app never touched it directly). This is what makes custom
  auth possible.
- `users.id` defaults to `gen_random_uuid()`, which is native to Postgres 13+
  and needs no extension. `uuid-ossp` is still declared in
  `schema-selfhosted.sql` because every *other* table (societies, units,
  residents, invoices, payments, plan_change_requests, leads, ...) still
  defaults its id via `uuid_generate_v4()` and those tables are intentionally
  left unchanged in this phase — only `pgcrypto` was dropped as genuinely
  unused.
- Every foreign key that pointed at `app_users(id)` now points at `users(id)`:
  `societies.created_by`, `society_members.user_id`,
  `subscriptions.updated_by`, `plan_change_requests.requested_by`,
  `audit_logs.user_id` — plus two the task list didn't name but that would
  otherwise dangle once `app_users` is gone: `leads.assigned_to` and
  `society_sites.updated_by` (both added in the TIER_3 CRM/CMS block that
  isn't in the original `lib/schema.sql` this task was scoped against, but is
  present in the current working copy).

**Update (Phase 2):** `must_change_password boolean not null default false`
has now been added to `users`, matching the column `app_users` carried for
the admin "reset a client user's password" forced-change gate. This was
intentionally deferred out of Phase 1 (the task's column list for `users`
didn't include it) and is added here now that Phase 2 needs it for
`lib/auth.ts` / the login route to eventually surface it to the client.

## 2. New `sessions` table

Self-hosted auth needs somewhere to keep server-side session tokens (Supabase
Auth used to do this for us). Added:

```sql
create table sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index idx_sessions_user on sessions (user_id);
```

The index on `user_id` isn't in the task spec but follows the same pattern
already used for every other tenant/FK table in this file
(`idx_residents_society`, `idx_invoices_society`, `idx_audit_logs_society`,
...) — session lookups by user will run on every authenticated request.

## 3. Row-Level Security removed

Self-hosted Postgres has no `auth.uid()` / `auth.jwt()`, so RLS as written
here can't work at all. Removed entirely:

- Every `alter table ... enable row level security` statement.
- Every `create policy ...` statement (on `app_users`/`users`, `societies`,
  `society_members`, `subscriptions`, `plan_change_requests`, `units`,
  `residents`, `invoices`, `payments`, `audit_logs`, `receipt_counters`,
  `leads`, `society_sites`).
- The `is_super_admin()`, `is_society_member()`, and `can_access_society()`
  helper functions that backed those policies.

In their place, `schema-selfhosted.sql` has a prominent comment block making
explicit that **tenant isolation is now the application's job**: every query
against a tenant-scoped table must filter by `society_id`, and every API
route must derive `society_id` from the authenticated session rather than
trust a value supplied by the client. This is the single biggest thing later
phases (the ones that actually rewrite the API routes) need to get right —
there is no longer a database-level safety net if an API route forgets the
filter.

## 4. Everything else

`societies`, `subscriptions`, `plan_change_requests`, `units`, `residents`,
`invoices`, `payments`, `receipt_counters`, `audit_logs`, `leads`,
`society_sites`, the `next_receipt()` function, and all four enums
(`subscription_tier`, `subscription_status`, `app_role`, `society_kind`,
`lead_status`) are carried over unchanged except for the `app_users` →
`users` foreign-key rename noted above.

## New infra (not a schema change)

- `docker-compose.yml` — a single `db` (postgres:16) service, seeded on
  first run from `lib/schema-selfhosted.sql` via
  `/docker-entrypoint-initdb.d/`. `POSTGRES_USER` / `POSTGRES_PASSWORD` /
  `POSTGRES_DB` default to `society_manager` and are overridable via `.env`.
- `.env.example` — added `DATABASE_URL`, matching the compose defaults.
- `lib/db.ts` — a singleton `pg.Pool` (guarded against being recreated on
  every dev hot-reload) exporting `query<T>(text, params?)`.
- `pg`, `bcryptjs` (deps) and `@types/pg` (dev dep) installed.
  `@supabase/ssr` / `@supabase/supabase-js` are untouched — still required
  until the app code itself is migrated in a later phase.

## Phase 2 — custom auth primitives (standalone, not wired in)

Adds the actual auth implementation on top of the Phase 1 schema, built so it
can be exercised and verified on its own before Phase 4 wires it into the
live app:

- `lib/auth.ts` — `hashPassword`/`verifyPassword` (bcryptjs, cost 12),
  `createSession`/`destroySession` (backed by the `sessions` table, 30-day
  expiry), and `getSessionUser` (joins `sessions` + `users`; deletes and
  returns `null` for a missing or expired session).
- `app/api/auth/login/route.ts`, `logout/route.ts`, `me/route.ts` — new
  routes under `/api/auth/*`, entirely separate from the existing
  Supabase-backed `/api/admin/*` and `/api/team` routes. They set/read an
  httpOnly, secure, `sameSite=lax` `session_id` cookie. Login only ever
  returns `{ id, email, name, role, must_change_password }` — never
  `password_hash` — and reports "Invalid email or password" for both a
  missing user and a wrong password, so the response can't be used to
  enumerate registered emails.
- `lib/require-auth.ts` — `requireUser()` / `requireSuperAdminNew()`,
  deliberately mirroring the shape of `requireSuperAdmin()` in
  `lib/supabase-server.ts` (same `{ ok, user }` / `{ ok, appUser }`-style
  return) so a later phase can swap the Supabase version out for this one
  with a small, mechanical diff. Not imported by any existing route yet.

## What did NOT change

No existing application code, components, or API routes were touched.
`app/login/page.tsx`, `lib/auth-context.tsx`, `lib/supabase-server.ts`, and
every Supabase-backed API route are untouched — the live app still runs on
Supabase exactly as before. The new `/api/auth/*` routes and `lib/auth.ts` /
`lib/require-auth.ts` exist standalone alongside it, unused by the app until
Phase 4.
