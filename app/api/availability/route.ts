import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// Public GET. Used by the hotel website to display free rooms for a date range.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const startParam = searchParams.get("start");
  const endParam = searchParams.get("end");
  if (!startParam || !endParam) {
    return NextResponse.json({ error: "start and end required (YYYY-MM-DD)" }, { status: 400 });
  }

  const start = new Date(startParam.length <= 10 ? startParam + "T00:00:00Z" : startParam);
  const end = new Date(endParam.length <= 10 ? endParam + "T00:00:00Z" : endParam);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const { data: rooms, error: rErr } = await supabaseAdmin
    .from("Room").select("id, code, label, capacity, entrance");
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const { data: reservations, error: bErr } = await supabaseAdmin.from("Reservation")
    .select("roomId").eq("status", "CONFIRMED")
    .lt("startDate", end.toISOString()).gt("endDate", start.toISOString());
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

  const bookedRoomIds = new Set((reservations || []).map((r: any) => r.roomId));
  const available = (rooms || []).filter((r: any) => !bookedRoomIds.has(r.id));
  return NextResponse.json(available);
}
