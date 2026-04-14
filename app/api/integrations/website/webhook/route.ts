import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getRoomColor } from "@/lib/rooms";

export async function POST(req: Request) {
  // Verify API key from website
  const apiKey = req.headers.get("x-staypilot-key");
  const { data: cred } = await supabaseAdmin
    .from("IntegrationCredential").select("values").eq("provider", "website").single();
  const expectedKey = (cred?.values as any)?.apiKey;
  if (expectedKey && apiKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({}));
  await supabaseAdmin.from("SyncEvent").insert({
    provider: "website", direction: "INBOUND_WEBHOOK", status: "RECEIVED", payload,
  });

  const { roomCode, guestName, phone, email, startDate, endDate, notes } = payload;
  if (!roomCode || !guestName || !startDate || !endDate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data: room } = await supabaseAdmin.from("Room").select("id").eq("code", roomCode).single();
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  // Conflict check
  const { data: conflicts } = await supabaseAdmin.from("Reservation")
    .select("id").eq("roomId", room.id).eq("status", "CONFIRMED")
    .lt("startDate", endDate).gt("endDate", startDate);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: "Room unavailable for these dates" }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin.from("Reservation").insert({
    guestName, phone: phone || "", email: email || null,
    roomCode, roomId: room.id,
    startDate: new Date(startDate).toISOString(),
    endDate: new Date(endDate).toISOString(),
    source: "Уебсайт", notes: notes || null,
    status: "CONFIRMED", color: getRoomColor(roomCode),
    externalRef: `website-${Date.now()}`,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabaseAdmin.from("Notification").insert({
    type: "NEW", title: `Уебсайт · Нова резервация · ${roomCode}`,
    detail: `${guestName} · ${startDate} – ${endDate}`,
  });

  return NextResponse.json({ ok: true, reservationId: data.id }, { status: 201 });
}
