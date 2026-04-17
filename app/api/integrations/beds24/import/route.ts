export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { BEDS24_MAP, loadBeds24Map, getRoomColor } from "@/lib/rooms";
import { fetchBeds24Bookings } from "@/lib/beds24";

// Bootstrap / reconcile endpoint.
//
// Pulls every booking from Beds24 for the requested date window across
// both Flora properties (320505 & 320506) and upserts them locally by
// externalRef="beds24-<bookingId>". Existing local rows are updated
// (dates, guest, status). New rows are inserted. Cancelled rows have
// their status flipped to CANCELLED.
//
// This is the missing "bootstrap" step that lets the StayPilot
// calendar match the Beds24 state on day one, rather than waiting for
// each future webhook to bring it up to date.
//
// Usage:  POST /api/integrations/beds24/import?from=2026-04-01&to=2026-12-31
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from")
    || new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get("to")
    || new Date(Date.now() + 180 * 86400_000).toISOString().slice(0, 10);

  const bookings = await fetchBeds24Bookings(from, to);
  if (!bookings) {
    return NextResponse.json(
      { ok: false, error: "Beds24 fetch failed — see SyncEvent log" },
      { status: 502 }
    );
  }

  let inserted = 0, updated = 0, cancelled = 0, skipped = 0;
  const unmappedKeys: string[] = [];
  const dynamicMap = await loadBeds24Map();

  for (const b of bookings) {
    const propertyId = Number(b.propertyId ?? b.property_id);
    const roomId = Number(b.roomId ?? b.room_id);
    const key = propertyId && roomId ? `${propertyId}:${roomId}` : null;
    const roomCode = key ? (dynamicMap[key] || BEDS24_MAP[key]) : null;
    if (!roomCode) {
      skipped++;
      if (key && !unmappedKeys.includes(key)) unmappedKeys.push(key);
      console.warn(`[beds24 import] no room mapping for key=${key} (booking ${b.id})`);
      continue;
    }

    const { data: room } = await supabaseAdmin
      .from("Room").select("id").eq("code", roomCode).maybeSingle();
    if (!room) { skipped++; continue; }

    const arrival = b.arrival ?? b.checkin;
    const departure = b.departure ?? b.checkout;
    if (!b.id || !arrival || !departure) { skipped++; continue; }

    const start = new Date(arrival);
    const end = new Date(departure);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      skipped++; continue;
    }

    const externalRef = `beds24-${b.id}`;
    // Guest info may be top-level OR nested inside guests[] when includeGuests=true
    const guest = Array.isArray(b.guests) && b.guests.length > 0 ? b.guests[0] : {};
    const firstName = guest.firstName || b.firstName || b.guestFirstName || "";
    const lastName = guest.lastName || b.lastName || b.guestLastName || "";
    const guestName = (firstName + (lastName ? ` ${lastName}` : ""));
    const phone = guest.phone || b.phone || "";
    const email = guest.email || b.email || null;
    const isCancelled = b.status === "cancelled" || b.status === "black";

    const { data: existing } = await supabaseAdmin
      .from("Reservation").select("id, status").eq("externalRef", externalRef).maybeSingle();

    if (isCancelled) {
      if (existing && existing.status !== "CANCELLED") {
        await supabaseAdmin.from("Reservation")
          .update({ status: "CANCELLED" }).eq("id", existing.id);
        cancelled++;
      } else {
        skipped++;
      }
      continue;
    }

    if (existing) {
      await supabaseAdmin.from("Reservation").update({
        guestName: guestName.trim() || "Beds24 гост",
        phone: phone || "",
        email: email || null,
        roomCode, roomId: room.id,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        status: "CONFIRMED",
        color: getRoomColor(roomCode),
        notes: b.notes || null,
      }).eq("id", existing.id);
      updated++;
    } else {
      await supabaseAdmin.from("Reservation").insert({
        guestName: guestName.trim() || "Beds24 гост",
        phone: phone || "",
        email: email || null,
        roomCode, roomId: room.id,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        source: "Beds24",
        notes: b.notes || null,
        status: "CONFIRMED",
        color: getRoomColor(roomCode),
        externalRef,
      });
      inserted++;
    }
  }

  try {
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "beds24", direction: "BOOTSTRAP", status: "PROCESSED",
      payload: { from, to, inserted, updated, cancelled, skipped, total: bookings.length },
    });
    await supabaseAdmin.from("Notification").insert({
      type: "IMPORT",
      title: `Beds24 · Масов импорт`,
      detail: `Нови: ${inserted} · Обновени: ${updated} · Анулирани: ${cancelled} · Пропуснати: ${skipped}`,
    });
  } catch { /* never cascade logging failures */ }

  return NextResponse.json({
    ok: true, inserted, updated, cancelled, skipped, total: bookings.length,
    ...(unmappedKeys.length > 0 ? { unmappedKeys } : {}),
  });
}
