import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { BOOKING_MAP, getRoomColor } from "@/lib/rooms";

export async function POST(req: Request) {
  const payload = await req.json().catch(() => ({}));

  await supabaseAdmin.from("SyncEvent").insert({
    provider: "booking", direction: "INBOUND_WEBHOOK", status: "RECEIVED", payload,
  });

  const key = payload?.hotel_id && payload?.room_id
    ? `${payload.hotel_id}:${payload.room_id}` : null;
  const roomCode = key ? BOOKING_MAP[key] : null;

  if (!roomCode) return NextResponse.json({ ok: true, mapped: false });

  const { data: room } = await supabaseAdmin.from("Room").select("id").eq("code", roomCode).single();
  if (!room) return NextResponse.json({ ok: true, mapped: false });

  if (payload.reservation_id && payload.checkin && payload.checkout) {
    const existing = await supabaseAdmin
      .from("Reservation").select("id")
      .eq("externalRef", `booking-${payload.reservation_id}`).single();

    if ((payload.status === "cancel" || payload.status === "no_show") && existing.data) {
      await supabaseAdmin.from("Reservation").update({ status: "CANCELLED" }).eq("id", existing.data.id);
      await supabaseAdmin.from("Notification").insert({
        type: "CANCEL", title: `Booking.com · Анулиране · ${roomCode}`,
        detail: `Резервация #${payload.reservation_id}`,
      });
    } else if (!existing.data && payload.status !== "cancel") {
      await supabaseAdmin.from("Reservation").insert({
        guestName: payload.guest_name || "Booking.com гост",
        phone: payload.phone || "",
        email: payload.email || null,
        roomCode, roomId: room.id,
        startDate: new Date(payload.checkin).toISOString(),
        endDate: new Date(payload.checkout).toISOString(),
        source: "Booking",
        notes: payload.remarks || null,
        status: "CONFIRMED",
        color: getRoomColor(roomCode),
        externalRef: `booking-${payload.reservation_id}`,
      });
      await supabaseAdmin.from("Notification").insert({
        type: "NEW", title: `Booking.com · Нова резервация · ${roomCode}`,
        detail: `${payload.guest_name || "Гост"} · ${payload.checkin} – ${payload.checkout}`,
      });
    }
  }

  return NextResponse.json({ ok: true, mappedRoomCode: roomCode });
}
