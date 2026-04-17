import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

const Body = z.object({
  provider: z.enum(["beds24", "booking", "website"]),
  values: z.record(z.string(), z.any()),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("IntegrationCredential").select("provider, values");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const result: Record<string, any> = {};
  // Do not leak the access token cache to the browser.
  (data || []).forEach((row: any) => {
    const v = { ...(row.values || {}) };
    delete v.accessToken;
    delete v.accessTokenExpiresAt;
    result[row.provider] = v;
  });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const { provider, values } = parsed.data;

  // Merge with existing row so we preserve refreshToken/webhookSecret etc.
  // when the UI only submits one field, and wipe the cached access token
  // whenever the refresh token changes (so the next call re-exchanges).
  const { data: existing } = await supabaseAdmin
    .from("IntegrationCredential").select("values").eq("provider", provider).maybeSingle();
  const merged: Record<string, any> = { ...(existing?.values || {}), ...values };

  if (provider === "beds24") {
    // The Settings UI still uses the "apiKey" label for the single input
    // (design unchanged). Internally we treat that value as refreshToken.
    if (typeof merged.apiKey === "string" && merged.apiKey.length > 0) {
      if (merged.refreshToken !== merged.apiKey) {
        merged.refreshToken = merged.apiKey;
        delete merged.accessToken;
        delete merged.accessTokenExpiresAt;
      }
    }
  }

  const { error } = await supabaseAdmin
    .from("IntegrationCredential")
    .upsert(
      { provider, values: merged, updatedAt: new Date().toISOString() },
      { onConflict: "provider" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
