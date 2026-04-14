import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { BEDS24_MAP, getRoomColor } from "@/lib/rooms";

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));

  await supabaseAdmin.from("SyncEvent").insert({
    provider: "beds24",
    direction: "INBOUND_WEBHOOK",
    status: "RECEIVED",
    payload,
  });

  const key = payload?.propertyId && payload?.roomId
    ? `${payload.propertyId}:${payload.roomId}` : null;
  const roomCode = key ? BEDS24_MAP[key] : null;

  if (!roomCode) return NextResponse.json({ ok: true, mapped: false });

  const { data: room } = await supabaseAdmin.from("Room").select("id").eq("code", roomCode).single();
  if (!room) return NextResponse.json({ ok: true, mapped: false });

  if (payload.bookingId && payload.arrival && payload.departure) {
    const existing = await supabaseAdmin
      .from("Reservation")
      .select("id")
      .eq("externalRef", `beds24-${payload.bookingId}`)
      .single();

    if (payload.status === "cancelled" && existing.data) {
      await supabaseAdmin.from("Reservation").update({ status: "CANCELLED" }).eq("id", existing.data.id);
      await supabaseAdmin.from("Notification").insert({
        type: "CANCEL", title: `Beds24 · Анулиране · ${roomCode}`,
        detail: `Резервация #${payload.bookingId} анулирана`,
      });
    } else if (!existing.data) {
      await supabaseAdmin.from("Reservation").insert({
        guestName: payload.firstName ? `${payload.firstName} ${payload.lastName || ""}`.trim() : "Beds24 гост",
        phone: payload.phone || "",
        email: payload.email || null,
        roomCode,
        roomId: room.id,
        startDate: new Date(payload.arrival).toISOString(),
        endDate: new Date(payload.departure).toISOString(),
        source: "Beds24",
        notes: payload.notes || null,
        status: "CONFIRMED",
        color: getRoomColor(roomCode),
        externalRef: `beds24-${payload.bookingId}`,
      });
      await supabaseAdmin.from("Notification").insert({
        type: "NEW", title: `Beds24 · Нова резервация · ${roomCode}`,
        detail: `${payload.firstName || "Гост"} · ${payload.arrival} – ${payload.departure}`,
      });
    }
  }

  await supabaseAdmin.from("SyncEvent").insert({
    provider: "beds24", direction: "INBOUND_WEBHOOK", status: "PROCESSED",
    payload: { roomCode, bookingId: payload.bookingId },
  });

  return NextResponse.json({ ok: true, mappedRoomCode: roomCode });
}
