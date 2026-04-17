import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { BOOKING_MAP, getRoomColor } from "@/lib/rooms";

export async function POST(req: Request) {
  try {
    const { data: cred } = await supabaseAdmin
      .from("IntegrationCredential").select("values").eq("provider", "booking").maybeSingle();
    const expected = (cred?.values as any)?.webhookSecret;
    if (expected) {
      const got = req.headers.get("x-booking-secret");
      if (got !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch (e) {
    console.warn("[booking webhook] credential lookup failed", e);
  }

  const payload = await req.json().catch(() => ({} as any));
  try {
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "booking", direction: "INBOUND_WEBHOOK", status: "RECEIVED", payload,
    });
  } catch (e) { console.error("[booking webhook] log received failed", e); }

  const key = payload?.hotel_id && payload?.room_id
    ? `${payload.hotel_id}:${payload.room_id}` : null;
  const roomCode = key ? BOOKING_MAP[key] : null;
  if (!roomCode) return NextResponse.json({ ok: true, mapped: false });

  const { data: room } = await supabaseAdmin.from("Room").select("id").eq("code", roomCode).maybeSingle();
  if (!room) return NextResponse.json({ ok: true, mapped: false });

  if (!payload.reservation_id || !payload.checkin || !payload.checkout) {
    return NextResponse.json({ ok: true, mapped: true, applied: false, reason: "missing reservation_id/checkin/checkout" });
  }

  const start = new Date(payload.checkin);
  const end = new Date(payload.checkout);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ ok: true, mapped: true, applied: false, reason: "invalid dates" });
  }

  const externalRef = `booking-${payload.reservation_id}`;
  const { data: existing } = await supabaseAdmin
    .from("Reservation").select("id, status").eq("externalRef", externalRef).maybeSingle();

  try {
    if ((payload.status === "cancel" || payload.status === "no_show") && existing) {
      await supabaseAdmin.from("Reservation").update({ status: "CANCELLED" }).eq("id", existing.id);
      await supabaseAdmin.from("Notification").insert({
        type: "CANCEL", title: `Booking.com · Анулиране · ${roomCode}`,
        detail: `Резервация #${payload.reservation_id}`,
      });
    } else if (existing && payload.status !== "cancel" && payload.status !== "no_show") {
      // MODIFY — apply all changes Booking.com reports (dates, guest, room).
      await supabaseAdmin.from("Reservation").update({
        guestName: payload.guest_name || "Booking.com гост",
        phone: payload.phone || "",
        email: payload.email || null,
        roomCode, roomId: room.id,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        notes: payload.remarks || null,
        status: "CONFIRMED",
        color: getRoomColor(roomCode),
      }).eq("id", existing.id);
      await supabaseAdmin.from("Notification").insert({
        type: "SYSTEM", title: `Booking.com · Промяна · ${roomCode}`,
        detail: `${payload.guest_name || "Гост"} · ${payload.checkin} – ${payload.checkout}`,
      });
    } else if (!existing && payload.status !== "cancel" && payload.status !== "no_show") {
      await supabaseAdmin.from("Reservation").insert({
        guestName: payload.guest_name || "Booking.com гост",
        phone: payload.phone || "",
        email: payload.email || null,
        roomCode, roomId: room.id,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        source: "Booking",
        notes: payload.remarks || null,
        status: "CONFIRMED",
        color: getRoomColor(roomCode),
        externalRef,
      });
      await supabaseAdmin.from("Notification").insert({
        type: "NEW", title: `Booking.com · Нова резервация · ${roomCode}`,
        detail: `${payload.guest_name || "Гост"} · ${payload.checkin} – ${payload.checkout}`,
      });
    }
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "booking", direction: "INBOUND_WEBHOOK", status: "PROCESSED",
      payload: { roomCode, reservationId: payload.reservation_id },
    });
  } catch (e: any) {
    console.error("[booking webhook] apply failed", e);
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "booking", direction: "INBOUND_WEBHOOK", status: "ERROR",
      payload: { error: String(e?.message || e), reservationId: payload.reservation_id },
    }).then(() => {}, () => {});
    return NextResponse.json({ ok: false, error: "apply failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mappedRoomCode: roomCode });
}
