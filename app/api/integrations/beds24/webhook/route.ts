export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { loadBeds24Map, getRoomColor } from "@/lib/rooms";

// Beds24 → StayPilot webhook.
//
// Beds24 has TWO separate webhook systems. We handle both:
//
// ┌─────────────────────────────────────────────────────────────────────┐
// │ 1. INVENTORY WEBHOOK (SYNC_ROOM)                                   │
// │    Config: Settings > Marketplace > Webhooks                       │
// │    Payload: {"roomId","propId","ownerId","action":"SYNC_ROOM"}     │
// │    Minimal — requires API call to fetch booking details.           │
// │    Triggered by: bookings, date changes, cancellations, inventory  │
// │    changes, price changes. NOT by restriction changes.             │
// │    Our strategy: return 200 immediately, process in background.    │
// ├─────────────────────────────────────────────────────────────────────┤
// │ 2. BOOKING WEBHOOK (API V2)                                        │
// │    Config: Settings > Properties > Access > Booking webhooks       │
// │    Payload: full booking object (id, propertyId, roomId, arrival,  │
// │             departure, firstName, lastName, status, numAdult, ...) │
// │    No API call needed — process inline from payload.               │
// │    This is the FAST path — preferred over inventory webhooks.      │
// └─────────────────────────────────────────────────────────────────────┘
//
// Beds24 webhook behavior (from docs):
//   - Expects HTTP 200-299; retries over 30 minutes if not received
//   - Webhooks are async: average delay of ~1 minute (NOT instant)
//   - Inventory webhooks are NOT triggered by restriction changes
//
// Public endpoint (no session) because Beds24 servers call it directly.
// Optionally authenticated with a shared secret.

const BEDS24_BASE = "https://beds24.com/api/v2";

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

  // ── Route 1: SYNC_ROOM inventory webhook ───────────────────────────────
  // Process synchronously — fire-and-forget does NOT work on Netlify
  // serverless (function is killed after response). Single-property fetch
  // keeps total time ~3s, well within Beds24's retry window.
  if (payload?.action === "SYNC_ROOM") {
    return processSyncRoom(payload);
  }

  // ── Route 2: Booking webhook (v2 full payload) ─────────────────────────
  // Full booking data — process inline (fast, no API call needed).
  return handleBookingWebhook(payload);
}

// ── Booking Webhook handler (v2 full payload) ────────────────────────────
// Beds24 v2 booking webhooks send the full booking object with fields:
//   id, propertyId, roomId, status, arrival, departure, firstName, lastName,
//   numAdult, numChild, email, phone, notes, etc.
// No API call needed — we can upsert directly from the payload.
async function handleBookingWebhook(payload: any) {
  const dynamicMap = await loadBeds24Map();

  // Beds24 v2 uses "id", legacy uses "bookingId" — accept both
  const bookingId = payload?.id || payload?.bookingId;
  // Beds24 v2 uses "propertyId", legacy inventory uses "propId" — accept both
  const propertyId = payload?.propertyId || payload?.propId;
  const payloadRoomId = payload?.roomId;

  const key = propertyId && payloadRoomId
    ? `${propertyId}:${payloadRoomId}` : null;
  const roomCode = key ? (dynamicMap[key] || null) : null;
  if (!roomCode) return NextResponse.json({ ok: true, mapped: false });

  const { data: room } = await supabaseAdmin
    .from("Room").select("id").eq("code", roomCode).maybeSingle();
  if (!room) return NextResponse.json({ ok: true, mapped: false });

  const arrival = payload.arrival ?? payload.checkin;
  const departure = payload.departure ?? payload.checkout;
  if (!bookingId || !arrival || !departure) {
    return NextResponse.json({
      ok: true, mapped: true, applied: false,
      reason: "missing id/arrival/departure",
    });
  }

  const start = new Date(arrival.length <= 10 ? arrival + "T00:00:00Z" : arrival);
  const end = new Date(departure.length <= 10 ? departure + "T00:00:00Z" : departure);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ ok: true, mapped: true, applied: false, reason: "invalid dates" });
  }

  const externalRef = `beds24-${bookingId}`;
  const { data: existing } = await supabaseAdmin
    .from("Reservation").select("id, status").eq("externalRef", externalRef).maybeSingle();

  // Guest info: may be in guests[] array (when includeGuests=true) or top-level
  const guest0 = Array.isArray(payload.guests) && payload.guests.length > 0
    ? payload.guests[0] : {};
  const gFirstName = guest0.firstName || payload.firstName || "";
  const gLastName = guest0.lastName || payload.lastName || "";
  const guestName = gFirstName
    ? `${gFirstName} ${gLastName}`.trim()
    : (payload.guestName || "Beds24 гост");
  const gPhone = guest0.phone || payload.phone || "";
  const gEmail = guest0.email || payload.email || null;
  const numAdult = Number(payload.numAdult || guest0.numAdult) || 1;
  const numChild = Number(payload.numChild || guest0.numChild) || 0;
  const isCancelled = payload.status === "cancelled" || payload.status === "black";

  try {
    if (isCancelled && existing) {
      await supabaseAdmin.from("Reservation")
        .update({ status: "CANCELLED" }).eq("id", existing.id);
      await supabaseAdmin.from("Notification").insert({
        type: "CANCEL", title: `Beds24 · Анулиране · ${roomCode}`,
        detail: `Резервация #${bookingId} анулирана`,
      });
    } else if (existing && !isCancelled) {
      await supabaseAdmin.from("Reservation").update({
        guestName, phone: gPhone, email: gEmail,
        startDate: start.toISOString(), endDate: end.toISOString(),
        notes: payload.notes || null, status: "CONFIRMED",
        roomCode, roomId: room.id, color: getRoomColor(roomCode),
        guests: numAdult, children: numChild,
      }).eq("id", existing.id);
      await supabaseAdmin.from("Notification").insert({
        type: "SYSTEM", title: `Beds24 · Промяна · ${roomCode}`,
        detail: `${guestName} · ${arrival} – ${departure}`,
      });
    } else if (!existing && !isCancelled) {
      await supabaseAdmin.from("Reservation").upsert({
        guestName, phone: gPhone, email: gEmail,
        roomCode, roomId: room.id,
        startDate: start.toISOString(), endDate: end.toISOString(),
        source: "Beds24", notes: payload.notes || null,
        status: "CONFIRMED", color: getRoomColor(roomCode), externalRef,
        guests: numAdult, children: numChild,
      }, { onConflict: "externalRef" });
      await supabaseAdmin.from("Notification").insert({
        type: "NEW", title: `Beds24 · Нова резервация · ${roomCode}`,
        detail: `${guestName} · ${arrival} – ${departure}`,
      });
    }
    await logSync("PROCESSED", { roomCode, bookingId, via: "booking-webhook" });
  } catch (e: any) {
    console.error("[beds24 webhook] booking-webhook apply failed", e);
    await logSync("ERROR", { error: String(e?.message || e), bookingId });
    return NextResponse.json({ ok: false, error: "apply failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mappedRoomCode: roomCode, bookingId });
}

// ── SYNC_ROOM processor ──────────────────────────────────────────────────
// Fetches bookings from the Beds24 API for ONLY the specific property that
// triggered the webhook (not both), then upserts matching bookings.
// Runs synchronously — Netlify kills serverless functions after response.
async function processSyncRoom(payload: any) {
  const propId = Number(payload.propId || payload.propertyId);
  const roomId = Number(payload.roomId);

  if (!propId || !roomId) {
    await logSync("PROCESSED", { action: "SYNC_ROOM", applied: false, reason: "missing propId/roomId" });
    return NextResponse.json({ ok: true, action: "SYNC_ROOM", applied: false, reason: "missing propId/roomId" });
  }

  const dynamicMap = await loadBeds24Map();
  const key = `${propId}:${roomId}`;
  const roomCode = dynamicMap[key] || null;
  if (!roomCode) {
    await logSync("PROCESSED", { action: "SYNC_ROOM", key, mapped: false });
    return NextResponse.json({ ok: true, action: "SYNC_ROOM", mapped: false, key });
  }

  const { data: room } = await supabaseAdmin
    .from("Room").select("id").eq("code", roomCode).maybeSingle();
  if (!room) {
    await logSync("PROCESSED", { action: "SYNC_ROOM", mapped: false, roomCode });
    return NextResponse.json({ ok: true, action: "SYNC_ROOM", mapped: false, roomCode });
  }

  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);

  let bookings: any[];
  try {
    bookings = await fetchPropertyBookings(propId, today, future);
  } catch (e: any) {
    console.error("[beds24 webhook] SYNC_ROOM fetch failed", e);
    await logSync("ERROR", { action: "SYNC_ROOM", roomCode, error: e.message });
    return NextResponse.json({ ok: false, action: "SYNC_ROOM", error: "fetch failed" }, { status: 502 });
  }

  // Filter to only bookings for this specific room
  const roomBookings = bookings.filter(
    (b: any) => Number(b.roomId ?? b.room_id) === roomId &&
                Number(b.propertyId ?? b.property_id) === propId
  );

  let inserted = 0, updated = 0, cancelled = 0, errors = 0;

  for (const b of roomBookings) {
    try {
      const arrival = b.arrival ?? b.checkin;
      const departure = b.departure ?? b.checkout;
      if (!b.id || !arrival || !departure) continue;

      const start = new Date(arrival.length <= 10 ? arrival + "T00:00:00Z" : arrival);
      const end = new Date(departure.length <= 10 ? departure + "T00:00:00Z" : departure);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) continue;

      const externalRef = `beds24-${b.id}`;
      const guest = Array.isArray(b.guests) && b.guests.length > 0 ? b.guests[0] : {};
      const firstName = guest.firstName || b.firstName || b.guestFirstName || "";
      const lastName = guest.lastName || b.lastName || b.guestLastName || "";
      const guestName = (firstName + (lastName ? ` ${lastName}` : "")).trim() || "Beds24 гост";
      const phone = guest.phone || b.phone || "";
      const email = guest.email || b.email || null;
      const isCancelled = b.status === "cancelled" || b.status === "black";
      const numAdult = Number(b.numAdult) || 1;
      const numChild = Number(b.numChild) || 0;

      const { data: existing } = await supabaseAdmin
        .from("Reservation").select("id, status").eq("externalRef", externalRef).maybeSingle();

      if (isCancelled) {
        if (existing && existing.status !== "CANCELLED") {
          await supabaseAdmin.from("Reservation").update({ status: "CANCELLED" }).eq("id", existing.id);
          await supabaseAdmin.from("Notification").insert({
            type: "CANCEL", title: `Beds24 · Анулиране · ${roomCode}`,
            detail: `Резервация #${b.id} анулирана`,
          });
          cancelled++;
        }
        continue;
      }

      const row = {
        guestName,
        phone: phone || "",
        email: email || null,
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
        await supabaseAdmin.from("Reservation").upsert(
          { ...row, source: "Beds24", externalRef },
          { onConflict: "externalRef" }
        );
        await supabaseAdmin.from("Notification").insert({
          type: "NEW", title: `Beds24 · Нова резервация · ${roomCode}`,
          detail: `${guestName} · ${arrival} – ${departure}`,
        });
        inserted++;
      }
    } catch (e: any) {
      console.error(`[beds24 webhook] booking ${b.id} failed`, e);
      errors++;
    }
  }

  await logSync("PROCESSED", {
    action: "SYNC_ROOM", roomCode, key, via: "inventory-webhook",
    found: roomBookings.length, inserted, updated, cancelled, errors,
  });

  return NextResponse.json({
    ok: true, action: "SYNC_ROOM", roomCode,
    found: roomBookings.length, inserted, updated, cancelled, errors,
  });
}

// ── Fetch bookings for a SINGLE property ─────────────────────────────────
// Unlike fetchBeds24Bookings() in lib/beds24.ts (which fetches both properties),
// this only queries the one property that triggered the webhook — ~2x faster.
async function fetchPropertyBookings(propertyId: number, from: string, to: string): Promise<any[]> {
  const { data: cred } = await supabaseAdmin
    .from("IntegrationCredential").select("values").eq("provider", "beds24").maybeSingle();
  const vals = cred?.values as any;
  const refresh = vals?.refreshToken || vals?.apiKey;
  if (!refresh) throw new Error("no Beds24 credential");

  let token = vals?.accessToken;
  if (token && vals?.accessTokenExpiresAt) {
    const exp = new Date(vals.accessTokenExpiresAt).getTime();
    if (exp - Date.now() < 5 * 60_000) token = null;
  }
  if (!token) {
    const r = await fetch(`${BEDS24_BASE}/authentication/token`, {
      method: "GET",
      headers: { refreshToken: refresh, accept: "application/json" },
    });
    if (!r.ok) throw new Error(`token exchange failed: ${r.status}`);
    const body = await r.json();
    token = body.token;
    if (!token) throw new Error("no token in response");
    const expiresIn = typeof body.expiresIn === "number" ? body.expiresIn : 82800;
    try {
      await supabaseAdmin.from("IntegrationCredential").upsert({
        provider: "beds24",
        values: { ...vals, accessToken: token, accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() },
        updatedAt: new Date().toISOString(),
      }, { onConflict: "provider" });
    } catch { /* non-fatal */ }
  }

  const url = new URL(`${BEDS24_BASE}/bookings`);
  url.searchParams.set("propertyId", String(propertyId));
  url.searchParams.set("departureFrom", from);
  url.searchParams.set("arrivalTo", to);
  url.searchParams.set("includeInvoiceItems", "false");
  url.searchParams.set("includeGuests", "true");

  const r = await fetch(url.toString(), {
    method: "GET",
    headers: { token, accept: "application/json" },
  });
  if (!r.ok) throw new Error(`bookings fetch failed: ${r.status}`);
  const body = await r.json().catch(() => null);
  return Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
}

// ── Helpers ───────────────────────────────────────────────────────────────
async function logSync(status: "PROCESSED" | "ERROR", payload: any) {
  try {
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "beds24", direction: "INBOUND_WEBHOOK", status, payload,
    });
  } catch { /* never cascade logging failures */ }
}
