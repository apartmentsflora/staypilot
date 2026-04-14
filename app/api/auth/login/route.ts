import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { createSession } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const { data: user } = await supabaseAdmin
    .from("User")
    .select("id, passwordHash, role, name")
    .eq("email", email)
    .single();

  if (!user) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  const token = await createSession(user.id, user.role);
  const res = NextResponse.json({ ok: true, name: user.name, role: user.role });
  res.cookies.set("sp_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return res;
}
