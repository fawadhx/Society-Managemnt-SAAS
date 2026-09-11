import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";

const GENERIC_ERROR = "Invalid email or password";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: "SUPER_ADMIN" | "SOCIETY_ADMIN";
  status: "Active" | "Suspended";
  must_change_password: boolean;
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const rows = await query<UserRow>(
    `select id, email, password_hash, name, role, status, must_change_password
       from users where lower(email) = $1`,
    [email],
  );
  const user = rows[0];
  if (!user || user.status !== "Active") {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  const session = await createSession(user.id);

  const res = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      must_change_password: user.must_change_password,
    },
  });
  res.cookies.set("session_id", session.id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
  return res;
}
