export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Returns the public VAPID key so the browser can subscribe to push
export async function GET() {
  const { data } = await supabaseAdmin
    .from("IntegrationCredential")
    .select("values")
    .eq("provider", "webpush")
    .maybeSingle();

  const publicKey = (data?.values as any)?.publicKey;
  if (!publicKey) {
    return NextResponse.json({ error: "Web Push not configured" }, { status: 500 });
  }

  return NextResponse.json({ publicKey });
}
