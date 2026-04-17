export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/integrations/beds24/setup
 * Body: { "inviteCode": "<code from Beds24 dashboard>" }
 *
 * Exchanges a Beds24 v2 invite code for a refresh token via
 * POST https://beds24.com/api/v2/authentication/setup
 * then stores the refresh token in IntegrationCredential.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const inviteCode = body?.inviteCode;
  if (!inviteCode || typeof inviteCode !== "string") {
    return NextResponse.json({ error: "Missing inviteCode" }, { status: 400 });
  }

  // Step 1: exchange invite code → refresh token
  let setupResp: any;
  try {
    const r = await fetch("https://beds24.com/api/v2/authentication/setup", {
      method: "POST",
      headers: { code: inviteCode, accept: "application/json" },
    });
    const text = await r.text();
    try { setupResp = JSON.parse(text); } catch { setupResp = { raw: text }; }

    if (!r.ok) {
      return NextResponse.json({
        ok: false,
        error: `Beds24 setup failed (${r.status})`,
        detail: setupResp,
      }, { status: 502 });
    }
  } catch (e: any) {
    return NextResponse.json({
      ok: false,
      error: "Cannot reach Beds24 API",
      detail: e?.message,
    }, { status: 502 });
  }

  const refreshToken = setupResp?.token;
  if (!refreshToken) {
    return NextResponse.json({
      ok: false,
      error: "Beds24 did not return a refresh token",
      detail: setupResp,
    }, { status: 502 });
  }

  // Step 2: verify the refresh token by exchanging it for an access token
  let accessToken: string | null = null;
  let expiresAt: string | null = null;
  try {
    const r2 = await fetch("https://beds24.com/api/v2/authentication/token", {
      method: "GET",
      headers: { refreshToken, accept: "application/json" },
    });
    if (r2.ok) {
      const tok = await r2.json();
      accessToken = tok?.token ?? null;
      const expiresIn = typeof tok?.expiresIn === "number" ? tok.expiresIn : 82800;
      expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    }
  } catch { /* access token exchange is best-effort here */ }

  // Step 3: store in DB
  const values: any = { refreshToken, apiKey: refreshToken };
  if (accessToken) {
    values.accessToken = accessToken;
    values.accessTokenExpiresAt = expiresAt;
  }

  const { error } = await supabaseAdmin
    .from("IntegrationCredential")
    .upsert(
      { provider: "beds24", values, updatedAt: new Date().toISOString() },
      { onConflict: "provider" }
    );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    hasAccessToken: !!accessToken,
    message: "Beds24 свързан успешно! Може да импортираш резервации.",
  });
}
