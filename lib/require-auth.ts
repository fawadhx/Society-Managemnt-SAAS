/**
 * Server-only auth guards for the new self-hosted auth (lib/auth.ts).
 *
 * Not imported by any existing route yet — built standalone so it can be
 * verified in isolation (Phase 2) before a later phase swaps it in for
 * `requireSuperAdmin()` in lib/supabase-server.ts. Deliberately mirrors that
 * function's shape so the eventual swap is mechanical.
 */

import { cookies } from "next/headers";
import { getSessionUser, type AppUser } from "./auth";

/** Resolve the calling user from the `session_id` cookie, or null if not signed in. */
export async function getCurrentUser(): Promise<AppUser | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session_id")?.value;
  if (!sessionId) return null;
  return getSessionUser(sessionId);
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user || user.status !== "Active") {
    return { ok: false as const, user: null };
  }
  return { ok: true as const, user };
}

export async function requireSuperAdminNew() {
  const user = await getCurrentUser();
  if (!user || user.role !== "SUPER_ADMIN" || user.status !== "Active") {
    return { ok: false as const, user: null };
  }
  return { ok: true as const, user };
}
