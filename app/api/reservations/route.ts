import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getRoomColor } from "@/lib/rooms";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("Reservation")
    .select("*, room:Room(code, label, entrance, capacity)")
    .neq("status", "CANCELLED")
    .order("startDate");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { guestName, phone, email, roomCode, startDate, endDate, source, notes } = body;

  if (!guestName || !roomCode || !startDate || !endDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Get room ID
  const { data: room } = await supabaseAdmin.from("Room").select("id").eq("code", roomCode).single();
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  // Check for conflicts
  const { data: conflicts } = await supabaseAdmin
    .from("Reservation")
    .select("id")
    .eq("roomId", room.id)
    .eq("status", "CONFIRMED")
    .lt("startDate", endDate)
    .gt("endDate", startDate);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: "Room is already booked for these dates" }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin.from("Reservation").insert({
    guestName,
    phone: phone || "",
    email: email || null,
    roomCode,
    roomId: room.id,
    startDate,
    endDate,
    source: source || "Direct",
    notes: notes || null,
    status: "CONFIRMED",
    color: getRoomColor(roomCode),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Create notification
  await supabaseAdmin.from("Notification").insert({
    type: "NEW",
    title: `Нова резервация · ${roomCode}`,
    detail: `${guestName} · ${source || "Direct"} · ${startDate.slice(0,10)} – ${endDate.slice(0,10)}`,
  });

  // Log sync event
  await supabaseAdmin.from("SyncEvent").insert({
    provider: (source || "direct").toLowerCase(),
    direction: "INBOUND",
    status: "SUCCESS",
    payload: { reservationId: data.id, roomCode, guestName },
  });

  return NextResponse.json(data, { status: 201 });
}
