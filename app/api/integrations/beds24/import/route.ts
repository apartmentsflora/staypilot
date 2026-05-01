export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { BEDS24_MAP, loadBeds24Map, getRoomColor } from "@/lib/rooms";
import { fetchBeds24Bookings, detectBookingSource, extractBookingPrice, sourceForUpdate } from "@/lib/beds24";
import { notify } from "@/lib/notify";

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

    // ── Guest info extraction ──
    // Beds24 v2 GET /bookings returns guest data from THREE sources:
    //   1. Top-level fields: firstName, lastName, email, phone, mobile (always present)
    //   2. guests[] array (only with includeGuests=true + bookings-personal scope)
    //   3. infoItems[] (only with includeInfoItems=true) — code/text pairs
    // We check all three in priority order.
    const g0 = Array.isArray(b.guests) && b.guests.length > 0 ? b.guests[0] : {};

    // Build infoItems lookup (code → text)
    const info: Record<string, string> = {};
    if (Array.isArray(b.infoItems)) {
      for (const item of b.infoItems) {
        if (item?.code && item?.text) info[String(item.code).toLowerCase()] = String(item.text);
      }
    }

    const firstName = g0.firstName || b.firstName || b.guestFirstName
      || info["firstname"] || info["first_name"] || "";
    const lastName = g0.lastName || b.lastName || b.guestLastName
      || info["lastname"] || info["last_name"] || "";
    const guestName = (firstName + (lastName ? ` ${lastName}` : ""));
    const phone = g0.phone || g0.mobile || b.phone || b.mobile
      || info["phone"] || info["mobile"] || "";
    const email = g0.email || b.email || info["email"] || null;
    const isCancelled = b.status === "cancelled" || b.status === "black";

    const { data: existing } = await supabaseAdmin
      .from("Reservation").select("id, status, source").eq("externalRef", externalRef).maybeSingle();

    if (isCancelled) {
      if (existing && existing.status !== "CANCELLED") {
        await supabaseAdmin.from("Reservation")
          .update({ status: "CANCELLED", cancelledAt: new Date().toISOString() }).eq("id", existing.id);
        cancelled++;
      } else {
        skipped++;
      }
      continue;
    }

    const numAdult = Number(b.numAdult) || 1;
    const numChild = Number(b.numChild) || 0;
    const detectedSource = detectBookingSource(b);
    const totalPrice = extractBookingPrice(b);
    // Compute pricePerNight from total if available
    const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    const pricePerNight = totalPrice ? Math.round(totalPrice / nights * 100) / 100 : null;

    if (existing) {
      // v1.4 — same source-preservation guard as poll + webhook (see lib/beds24.ts).
      const safeSource = sourceForUpdate((existing as any).source, detectedSource);
      const updateRow: Record<string, any> = {
        guestName: guestName.trim() || "Beds24 гост",
        phone: phone || "",
        email: email || null,
        roomCode, roomId: room.id,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        status: "CONFIRMED",
        color: getRoomColor(roomCode),
        notes: b.notes || null,
        guests: numAdult,
        children: numChild,
        ...(pricePerNight != null ? { pricePerNight } : {}),
      };
      if (safeSource != null) updateRow.source = safeSource;
      const { error: updErr } = await supabaseAdmin.from("Reservation").update(updateRow).eq("id", existing.id);
      if (updErr) { console.error(`[beds24 import] update failed for ${externalRef}:`, updErr.message); skipped++; }
      else updated++;
    } else {
      const { error: upsErr } = await supabaseAdmin.from("Reservation").upsert({
        guestName: guestName.trim() || "Beds24 гост",
        phone: phone || "",
        email: email || null,
        roomCode, roomId: room.id,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        source: detectedSource,
        notes: b.notes || null,
        status: "CONFIRMED",
        color: getRoomColor(roomCode),
        externalRef,
        guests: numAdult,
        children: numChild,
        ...(pricePerNight != null ? { pricePerNight } : {}),
      }, { onConflict: "externalRef" });
      if (upsErr) { console.error(`[beds24 import] upsert failed for ${externalRef}:`, upsErr.message); skipped++; }
      else inserted++;
    }
  }

  try {
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "beds24", direction: "BOOTSTRAP", status: "PROCESSED",
      payload: { from, to, inserted, updated, cancelled, skipped, total: bookings.length },
    });
    // Only create a notification when something actually changed —
    // prevents spam when auto-sync calls this endpoint every 30s
    if (inserted > 0 || cancelled > 0) {
      await notify({
        type: "IMPORT",
        title: `Beds24 · Масов импорт`,
        detail: `Нови: ${inserted} · Обновени: ${updated} · Анулирани: ${cancelled} · Пропуснати: ${skipped}`,
      });
    }
  } catch { /* never cascade logging failures */ }

  return NextResponse.json({
    ok: true, inserted, updated, cancelled, skipped, total: bookings.length,
    ...(unmappedKeys.length > 0 ? { unmappedKeys } : {}),
  });
}
