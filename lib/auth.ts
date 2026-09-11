/**
 * Server-only: talks to `lib/db.ts` (a `pg.Pool`) and handles password
 * hashes. Never import this from a Client Component.
 */
import bcrypt from "bcryptjs";
import { query } from "./db";

const BCRYPT_COST = 12;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type UserRole = "SUPER_ADMIN" | "SOCIETY_ADMIN";
export type UserStatus = "Active" | "Suspended";

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  must_change_password: boolean;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const rows = await query<{ id: string; expires_at: Date }>(
    `insert into sessions (user_id, expires_at) values ($1, $2) returning id, expires_at`,
    [userId, expiresAt],
  );
  const session = rows[0];
  return { id: session.id, expiresAt: session.expires_at };
}

export async function getSessionUser(sessionId: string): Promise<AppUser | null> {
  const rows = await query<UserRow>(
    `select u.id, u.email, u.name, u.role, u.status, u.must_change_password
       from sessions s
       join users u on u.id = s.user_id
      where s.id = $1 and s.expires_at > now()`,
    [sessionId],
  );
  const row = rows[0];
  if (!row) {
    // Missing or expired — clean up the row if it exists but has lapsed.
    await query(`delete from sessions where id = $1`, [sessionId]);
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    mustChangePassword: row.must_change_password,
  };
}

export async function destroySession(sessionId: string): Promise<void> {
  await query(`delete from sessions where id = $1`, [sessionId]);
}
