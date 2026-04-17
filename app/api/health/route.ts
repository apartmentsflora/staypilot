import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Public health check. Used by deploy scripts to verify the site is alive.
// Returns non-200 when DB is unreachable or service_role key is missing.
export async function GET() {
  const envOk = {
    NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    AUTH_SECRET: !!process.env.AUTH_SECRET && (process.env.AUTH_SECRET?.length ?? 0) >= 24,
  };
  const missing = Object.entries(envOk).filter(([, v]) => !v).map(([k]) => k);

  try {
    const { count, error } = await supabaseAdmin.from("Room").select("*", { count: "exact", head: true });
    const ok = !error && missing.length === 0;
    return NextResponse.json({
      status: ok ? "ok" : "degraded",
      db: error ? "unreachable" : "connected",
      rooms: count ?? 0,
      env: envOk,
      missing,
      ts: new Date().toISOString(),
    }, { status: ok ? 200 : 503 });
  } catch (e: any) {
    return NextResponse.json({
      status: "error",
      db: "unreachable",
      error: String(e?.message || e),
      env: envOk,
      missing,
      ts: new Date().toISOString(),
    }, { status: 503 });
  }
}
