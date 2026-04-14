import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("start");
  const endDate = searchParams.get("end");

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "start and end required" }, { status: 400 });
  }

  const { data: rooms } = await supabaseAdmin.from("Room").select("id, code, label, capacity, entrance");
  const { data: reservations } = await supabaseAdmin.from("Reservation")
    .select("roomId").eq("status", "CONFIRMED")
    .lt("startDate", endDate).gt("endDate", startDate);

  const bookedRoomIds = new Set((reservations || []).map((r: any) => r.roomId));
  const available = (rooms || []).filter((r: any) => !bookedRoomIds.has(r.id));

  return NextResponse.json(available);
}
