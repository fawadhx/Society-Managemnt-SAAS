# Society / Plaza Manager — mini SaaS

A multi-tenant B2B SaaS for housing societies and commercial plazas: maintenance /
rent billing, payment recording, resident/tenant management and WhatsApp reminders,
on a 3-tier subscription (PKR 1,500 / 3,000 / 5,000 per month).

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 + plain CSS design tokens
- Supabase (Postgres + Auth + RLS) — the real backend
- lucide-react icons

## How it works

| Piece | Where |
|---|---|
| **Login** | `/login` — Supabase email/password. No self-serve signup; the Super Admin provisions every client. |
| **Client workspace** | `/<slug>` — the approved dashboard (`components/workspace-app.tsx`). Data is RLS-scoped to that society. |
| **Super Admin console** | `/admin` — list/create/manage every client, tiers, seats, lifecycle, branding, plan-change requests, metrics. |
| **Tier 3** | Same workspace at `/<slug>` with per-client branding (logo, colour, name, society/plaza mode). Optionally reachable at `acme.example.com` by setting `NEXT_PUBLIC_MULTI_DOMAIN=1` (see `proxy.ts`). The Super Admin opens it via **"Open workspace"**. |

### Subscription model

- **One subscription per workspace.** `lib/plans.ts` is the single source of truth; `lib/subscription-context.tsx` enforces it.
- The **tier** sets features + caps. **Users are seats**: T1 includes 1, T2 = 3, T3 = 10; extra admin users are +PKR 500/user/mo.
- MRR per client = `plan price + extra_seats × 500`.
- Lifecycle: `trialing → active → past_due → canceled / expired`. Expired / canceled / suspended → the workspace goes **read-only**.
- Clients can't change their own plan — the "Upgrade" buttons file a `plan_change_requests` row the Super Admin works.

## Setup

1. **Database** — run `lib/schema.sql` in the Supabase SQL editor (it resets the tenant tables; safe on a fresh project).
2. **Env** — `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...        # server-only, required for the admin console
   NEXT_PUBLIC_MULTI_DOMAIN=0           # 1 to enable Tier-3 subdomains
   ```
3. **First Super Admin** — Supabase dashboard → Authentication → Add user (with a password), then:
   ```sql
   update app_users set role = 'SUPER_ADMIN' where email = 'you@company.com';
   ```
4. `npm install && npm run dev` → sign in at `/login` → you land on `/admin`.
5. **Create a client** from the console (name, kind, tier, seats, trial, first admin). Log in as that admin to see the workspace.

## Provisioning from the company's marketplace

The company's site handles product selection + payment, then a Super Admin creates the
client in `/admin`. A signed `POST /api/provision` endpoint for a fully automated
handshake is a documented follow-up (not built yet).

## Key files

```
lib/schema.sql              full DB schema + RLS
lib/plans.ts                plan catalog (tiers, seats, features, limits)
lib/auth-context.tsx        Supabase auth, roles, impersonation
lib/subscription-context.tsx  tier / features / seats / read-only gate
lib/society-context.tsx     one workspace's operational data (Supabase + LS cache)
lib/admin.ts                Super Admin data + API client
components/workspace-app.tsx the client dashboard
app/[slug]/                  tenant workspace route + branding
app/admin/                   Super Admin console
app/api/admin/               service-role route handlers (super-admin only)
proxy.ts                     optional Tier-3 subdomain resolution
```
