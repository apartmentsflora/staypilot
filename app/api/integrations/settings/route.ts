import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabaseAdmin.from("IntegrationCredential").select("provider, values");
  const result: Record<string, any> = {};
  (data || []).forEach((row: any) => { result[row.provider] = row.values; });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { provider, values } = body;
  const { error } = await supabaseAdmin
    .from("IntegrationCredential")
    .upsert({ provider, values, updatedAt: new Date().toISOString() }, { onConflict: "provider" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
