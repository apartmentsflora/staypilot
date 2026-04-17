import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { createSession } from "@/lib/auth";
import bcrypt from "bcryptjs";

const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = LoginInput.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  const { email, password } = parsed.data;

  const { data: user, error } = await supabaseAdmin
    .from("User")
    .select("id, passwordHash, role, name")
    .eq("email", email)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
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
