import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { count, error } = await supabaseAdmin.from("Room").select("*", { count: "exact", head: true });
  return NextResponse.json({
    status: error ? "error" : "ok",
    db: error ? "unreachable" : "connected",
    rooms: count ?? 0,
    ts: new Date().toISOString(),
  });
}
