export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/integrations/beds24/setup
 * Body: { "inviteCode": "<code from Beds24 SETTINGS → MARKETPLACE → API>" }
 *
 * Beds24 v2 setup flow:
 *   1. GET /authentication/setup  (header: code) → { token, refreshToken, expiresIn }
 *   2. Store refreshToken + token (access) in IntegrationCredential
 *
 * The setup endpoint is GET (not POST) per Beds24 API docs.
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

  // Step 1: exchange invite code → token + refreshToken
  // Beds24 v2 docs: GET /authentication/setup with header "code"
  let setupResp: any;
  try {
    const r = await fetch("https://beds24.com/api/v2/authentication/setup", {
      method: "GET",
      headers: { code: inviteCode.trim(), accept: "application/json" },
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

  // The setup response returns both an access token and a refresh token
  const accessToken = setupResp?.token ?? null;
  const refreshToken = setupResp?.refreshToken ?? null;
  const expiresIn = typeof setupResp?.expiresIn === "number" ? setupResp.expiresIn : 82800;

  if (!refreshToken) {
    return NextResponse.json({
      ok: false,
      error: "Beds24 did not return a refresh token",
      detail: setupResp,
    }, { status: 502 });
  }

  // Step 2: store in DB
  const values: any = {
    refreshToken,
    apiKey: refreshToken, // legacy alias used by beds24.ts
  };
  if (accessToken) {
    values.accessToken = accessToken;
    values.accessTokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
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
