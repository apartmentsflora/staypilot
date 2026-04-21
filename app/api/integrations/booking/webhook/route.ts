export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { BOOKING_MAP, getRoomColor } from "@/lib/rooms";
import { notify } from "@/lib/notify";

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
      await supabaseAdmin.from("Reservation").update({ status: "CANCELLED", cancelledAt: new Date().toISOString() }).eq("id", existing.id);
      try { await notify({
        type: "CANCEL", title: `Booking.com · Анулиране · ${roomCode}`,
        detail: `Резервация #${payload.reservation_id}`, reservationId: existing.id,
      }); } catch (ne) { console.error("[booking webhook] notify failed", ne); }
    } else if (existing && payload.status !== "cancel" && payload.status !== "no_show") {
      // MODIFY — apply all changes Booking.com reports (dates, guest, room).
      const numAdult = Math.max(1, Number(payload.guests || payload.num_adults) || 1);
      const numChild = Math.max(0, Number(payload.children || payload.num_children) || 0);
      const totalPrice = Number(payload.price || payload.total_price) || 0;
      const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
      const pricePerNight = totalPrice > 0 ? Math.round(totalPrice / nights * 100) / 100 : null;
      await supabaseAdmin.from("Reservation").update({
        guestName: payload.guest_name || "Booking.com гост",
        phone: payload.phone || "",
        email: payload.email || null,
        roomCode, roomId: room.id,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        notes: payload.remarks || null,
        status: "CONFIRMED",
        cancelledAt: null,
        color: getRoomColor(roomCode),
        guests: numAdult,
        children: numChild,
        ...(pricePerNight != null ? { pricePerNight } : {}),
      }).eq("id", existing.id);
      try { await notify({
        type: "SYSTEM", title: `Booking.com · Промяна · ${roomCode}`,
        detail: `${payload.guest_name || "Гост"} · ${payload.checkin} – ${payload.checkout}`, reservationId: existing.id,
      }); } catch (ne) { console.error("[booking webhook] notify failed", ne); }
    } else if (!existing && payload.status !== "cancel" && payload.status !== "no_show") {
      const numAdultNew = Math.max(1, Number(payload.guests || payload.num_adults) || 1);
      const numChildNew = Math.max(0, Number(payload.children || payload.num_children) || 0);
      const totalPriceNew = Number(payload.price || payload.total_price) || 0;
      const nightsNew = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
      const pricePerNightNew = totalPriceNew > 0 ? Math.round(totalPriceNew / nightsNew * 100) / 100 : null;
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
        guests: numAdultNew,
        children: numChildNew,
        ...(pricePerNightNew != null ? { pricePerNight: pricePerNightNew } : {}),
      });
      try { await notify({
        type: "NEW", title: `Booking.com · Нова резервация · ${roomCode}`,
        detail: `${payload.guest_name || "Гост"} · ${payload.checkin} – ${payload.checkout}`,
      }); } catch (ne) { console.error("[booking webhook] notify failed", ne); }
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
