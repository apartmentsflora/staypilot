export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { BEDS24_MAP, getRoomColor } from "@/lib/rooms";

// Beds24 → StayPilot webhook. Public (no session) because Beds24 servers
// call it, but optionally authenticated with a shared secret stored in
// IntegrationCredential(provider='beds24').values.webhookSecret.
export async function POST(req: Request) {
  // Optional shared secret check
  try {
    const { data: cred } = await supabaseAdmin
      .from("IntegrationCredential").select("values").eq("provider", "beds24").maybeSingle();
    const expected = (cred?.values as any)?.webhookSecret;
    if (expected) {
      const got = req.headers.get("x-beds24-secret");
      if (got !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch (e) {
    console.warn("[beds24 webhook] credential lookup failed", e);
  }

  const payload = await req.json().catch(() => ({} as any));
  try {
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "beds24", direction: "INBOUND_WEBHOOK", status: "RECEIVED", payload,
    });
  } catch (e) { console.error("[beds24 webhook] log received failed", e); }

  const key = payload?.propertyId && payload?.roomId
    ? `${payload.propertyId}:${payload.roomId}` : null;
  const roomCode = key ? BEDS24_MAP[key] : null;
  if (!roomCode) return NextResponse.json({ ok: true, mapped: false });

  const { data: room } = await supabaseAdmin.from("Room").select("id").eq("code", roomCode).maybeSingle();
  if (!room) return NextResponse.json({ ok: true, mapped: false });

  if (!payload.bookingId || !payload.arrival || !payload.departure) {
    return NextResponse.json({ ok: true, mapped: true, applied: false, reason: "missing bookingId/arrival/departure" });
  }

  // Normalize dates; bail cleanly on invalid input
  const start = new Date(payload.arrival);
  const end = new Date(payload.departure);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ ok: true, mapped: true, applied: false, reason: "invalid dates" });
  }

  const externalRef = `beds24-${payload.bookingId}`;
  const { data: existing } = await supabaseAdmin
    .from("Reservation").select("id, status").eq("externalRef", externalRef).maybeSingle();

  const guestName = payload.firstName
    ? `${payload.firstName} ${payload.lastName || ""}`.trim()
    : (payload.guestName || "Beds24 гост");

  try {
    if (payload.status === "cancelled" && existing) {
      await supabaseAdmin.from("Reservation").update({ status: "CANCELLED" }).eq("id", existing.id);
      await supabaseAdmin.from("Notification").insert({
        type: "CANCEL", title: `Beds24 · Анулиране · ${roomCode}`,
        detail: `Резервация #${payload.bookingId} анулирана`,
      });
    } else if (existing && payload.status !== "cancelled") {
      // MODIFY — dates, guest name, phone, email, notes, room can all change.
      // Treat the Beds24 payload as authoritative for anything it provides.
      const patch: Record<string, any> = {
        guestName,
        phone: payload.phone || "",
        email: payload.email || null,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        notes: payload.notes || null,
        status: "CONFIRMED",
        roomCode,
        roomId: room.id,
        color: getRoomColor(roomCode),
      };
      await supabaseAdmin.from("Reservation").update(patch).eq("id", existing.id);
      await supabaseAdmin.from("Notification").insert({
        type: "SYSTEM", title: `Beds24 · Промяна · ${roomCode}`,
        detail: `${guestName} · ${payload.arrival} – ${payload.departure}`,
      });
    } else if (!existing && payload.status !== "cancelled") {
      await supabaseAdmin.from("Reservation").insert({
        guestName,
        phone: payload.phone || "",
        email: payload.email || null,
        roomCode, roomId: room.id,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        source: "Beds24",
        notes: payload.notes || null,
        status: "CONFIRMED",
        color: getRoomColor(roomCode),
        externalRef,
      });
      await supabaseAdmin.from("Notification").insert({
        type: "NEW", title: `Beds24 · Нова резервация · ${roomCode}`,
        detail: `${guestName} · ${payload.arrival} – ${payload.departure}`,
      });
    }
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "beds24", direction: "INBOUND_WEBHOOK", status: "PROCESSED",
      payload: { roomCode, bookingId: payload.bookingId },
    });
  } catch (e: any) {
    console.error("[beds24 webhook] apply failed", e);
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "beds24", direction: "INBOUND_WEBHOOK", status: "ERROR",
      payload: { error: String(e?.message || e), bookingId: payload.bookingId },
    }).then(() => {}, () => {});
    return NextResponse.json({ ok: false, error: "apply failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mappedRoomCode: roomCode });
}
