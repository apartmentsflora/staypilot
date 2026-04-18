export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { fetchBeds24Bookings } from "@/lib/beds24";
import { loadBeds24Map, getRoomColor } from "@/lib/rooms";

// ═══════════════════════════════════════════════════════════════════════════
// Beds24 polling endpoint — safety net when webhooks fail
// ═══════════════════════════════════════════════════════════════════════════
//
// Called by the frontend every 2 minutes. Fetches ALL bookings from both
// Flora properties for the next 365 days and upserts them.
//
// For 2 properties / ~15 bookings this is a lightweight call, well within
// Beds24's rate limits (their warning targets booking-engine style
// real-time search across hundreds of properties).
//
// Rate limiting: won't run more than once per 90 seconds to prevent
// multiple browser tabs from hammering the API.
//
// No authentication required — it only READS from Beds24 and WRITES to
// our own DB. No sensitive data is exposed in the response.
// ═══════════════════════════════════════════════════════════════════════════

const MIN_INTERVAL_MS = 90_000; // 90 seconds between polls
const CANCELLED_STATUSES = new Set(["cancelled", "black"]);

export async function GET() {
  // ── Rate limit: skip if last poll was < 90s ago ──
  try {
    const { data: lastSync } = await supabaseAdmin
      .from("SyncEvent")
      .select("createdAt")
      .eq("provider", "beds24")
      .eq("direction", "POLL")
      .eq("status", "PROCESSED")
      .order("createdAt", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSync) {
      const elapsed = Date.now() - new Date(lastSync.createdAt).getTime();
      if (elapsed < MIN_INTERVAL_MS) {
        return NextResponse.json({ ok: true, skipped: true, reason: "too soon", elapsedMs: elapsed });
      }
    }
  } catch { /* proceed if check fails */ }

  const startMs = Date.now();

  // ── Fetch from Beds24 ──
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

  const bookings = await fetchBeds24Bookings(today, future);
  if (!bookings) {
    await logPoll("ERROR", { reason: "Beds24 fetch failed", durationMs: Date.now() - startMs });
    return NextResponse.json({ ok: false, error: "fetch failed" }, { status: 502 });
  }

  // ── Process bookings ──
  const dynamicMap = await loadBeds24Map();
  let inserted = 0, updated = 0, cancelled = 0, skipped = 0, errors = 0;
  const newBookings: string[] = []; // collect for single summary notification

  for (const b of bookings) {
    try {
      const propertyId = Number(b.propertyId ?? b.property_id);
      const roomId = Number(b.roomId ?? b.room_id);
      const key = propertyId && roomId ? `${propertyId}:${roomId}` : null;
      const roomCode = key ? (dynamicMap[key] || null) : null;
      if (!roomCode) { skipped++; continue; }

      const { data: room } = await supabaseAdmin
        .from("Room").select("id").eq("code", roomCode).maybeSingle();
      if (!room) { skipped++; continue; }

      if (!b.id) { skipped++; continue; }
      const arrival = b.arrival ?? b.checkin;
      const departure = b.departure ?? b.checkout;
      if (!arrival || !departure) { skipped++; continue; }

      const start = new Date(arrival.length <= 10 ? arrival + "T00:00:00Z" : arrival);
      const end = new Date(departure.length <= 10 ? departure + "T00:00:00Z" : departure);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) { skipped++; continue; }

      const externalRef = `beds24-${b.id}`;
      const g0 = Array.isArray(b.guests) && b.guests.length > 0 ? b.guests[0] : {};
      const firstName = g0.firstName || b.firstName || b.guestFirstName || "";
      const lastName = g0.lastName || b.lastName || b.guestLastName || "";
      const guestName = (firstName + (lastName ? ` ${lastName}` : "")).trim() || "Beds24 гост";
      const phone = g0.phone || b.phone || "";
      const email = g0.email || b.email || null;
      const isCancelled = CANCELLED_STATUSES.has(b.status);
      const numAdult = Math.max(1, Number(b.numAdult || g0.numAdult) || 1);
      const numChild = Math.max(0, Number(b.numChild || g0.numChild) || 0);

      // ── Check if reservation already exists ──
      // IMPORTANT: check for error too — if SELECT fails, treat as "skip"
      // rather than creating duplicate notifications.
      const { data: existing, error: selectErr } = await supabaseAdmin
        .from("Reservation").select("id, status").eq("externalRef", externalRef).maybeSingle();

      if (selectErr) {
        console.error(`[beds24-poll] SELECT failed for ${externalRef}:`, selectErr.message);
        errors++;
        continue;
      }

      if (isCancelled) {
        if (existing && existing.status !== "CANCELLED") {
          await supabaseAdmin.from("Reservation")
            .update({ status: "CANCELLED", cancelledAt: new Date().toISOString() })
            .eq("id", existing.id);
          cancelled++;
        } else {
          skipped++;
        }
        continue;
      }

      const row = {
        guestName, phone, email,
        roomCode, roomId: room.id,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        status: "CONFIRMED" as const,
        color: getRoomColor(roomCode),
        notes: b.notes || null,
        guests: numAdult,
        children: numChild,
      };

      if (existing) {
        await supabaseAdmin.from("Reservation").update(row).eq("id", existing.id);
        updated++;
      } else {
        // Genuinely new booking — insert it
        const { error: upsertErr } = await supabaseAdmin.from("Reservation").upsert(
          { ...row, source: "Beds24", externalRef },
          { onConflict: "externalRef" },
        );
        if (upsertErr) {
          console.error(`[beds24-poll] upsert failed for ${externalRef}:`, upsertErr.message);
          errors++;
          continue;
        }
        newBookings.push(`${roomCode} · ${guestName} · ${arrival} – ${departure}`);
        inserted++;
      }
    } catch (e: any) {
      console.error(`[beds24-poll] booking ${b.id} failed:`, e);
      errors++;
    }
  }

  // ── Single summary notification for ALL new bookings found in this poll ──
  // No per-booking notifications — prevents spam if poll runs multiple times
  if (newBookings.length > 0) {
    try {
      await supabaseAdmin.from("Notification").insert({
        type: "NEW",
        title: `Beds24 · Poll · ${newBookings.length} нови резервации`,
        detail: newBookings.join(" | "),
      });
    } catch { /* non-fatal */ }
  }

  const durationMs = Date.now() - startMs;
  await logPoll("PROCESSED", {
    total: bookings.length, inserted, updated, cancelled, skipped, errors, durationMs,
  });

  return NextResponse.json({
    ok: true, total: bookings.length,
    inserted, updated, cancelled, skipped, errors, durationMs,
  });
}

async function logPoll(status: "PROCESSED" | "ERROR", payload: any) {
  try {
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "beds24", direction: "POLL", status, payload,
    });
  } catch { /* never cascade */ }
}
