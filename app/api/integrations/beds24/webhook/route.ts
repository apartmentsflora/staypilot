export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { loadBeds24Map, getRoomColor } from "@/lib/rooms";
import { detectBookingSource, extractBookingPrice } from "@/lib/beds24";
import { notify as notifyPush } from "@/lib/notify";

// ═══════════════════════════════════════════════════════════════════════════
// Beds24 → StayPilot inbound webhook handler
// ═══════════════════════════════════════════════════════════════════════════
//
// This endpoint receives TWO types of Beds24 webhooks:
//
//   1. INVENTORY WEBHOOK (SYNC_ROOM)
//      Source: Settings > Marketplace > Webhooks
//      Payload: {"roomId":"671001","propId":"322955","ownerId":"…","action":"SYNC_ROOM"}
//      Note: roomId and propId arrive as STRINGS.
//      Triggered by: bookings, date changes, cancellations, inventory/price changes.
//      NOT triggered by: restriction changes.
//      Strategy: fetch bookings from Beds24 API for the specific property+room,
//      then upsert into our Reservation table.
//
//   2. BOOKING WEBHOOK (API V2)
//      Source: Settings > Properties > Access > Booking webhooks
//      Payload: full booking object — id, propertyId, roomId, arrival, departure,
//               firstName, lastName, status, numAdult, numChild, guests[], etc.
//      Strategy: upsert directly from payload (no API call needed — fast path).
//
// Platform constraints:
//   - Netlify serverless: function is KILLED after response is sent.
//     Fire-and-forget does NOT work. Everything must be synchronous.
//   - Netlify timeout: 10s default, up to 26s on Pro.
//     SYNC_ROOM fetches only the triggering property (~3s).
//   - Beds24 expects HTTP 200–299; retries over 30 minutes otherwise.
//   - Beds24 webhooks are async: average delay ~1 minute (not instant).
//
// Authentication:
//   Optional shared secret in x-beds24-secret header, checked against
//   IntegrationCredential.values.webhookSecret.
//
// Idempotency:
//   All inserts use upsert with onConflict: "externalRef" (UNIQUE constraint).
//   Duplicate webhooks for the same booking are safe.
//
// ═══════════════════════════════════════════════════════════════════════════

const BEDS24_BASE = "https://beds24.com/api/v2";

// Beds24 status values that mean "cancelled / blocked"
const CANCELLED_STATUSES = new Set(["cancelled", "black"]);

// ─── Main entry point ────────────────────────────────────────────────────

export async function POST(req: Request) {
  const startMs = Date.now();

  // 1. Optional shared-secret authentication
  try {
    const { data: cred } = await supabaseAdmin
      .from("IntegrationCredential")
      .select("values")
      .eq("provider", "beds24")
      .maybeSingle();
    const expected = (cred?.values as any)?.webhookSecret;
    if (expected) {
      const got = req.headers.get("x-beds24-secret");
      if (got !== expected) {
        await logSync("ERROR", { step: "auth", reason: "secret mismatch" });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
  } catch (e: any) {
    // If credential lookup fails, allow the request through (fail-open for
    // webhooks, since Beds24 would retry for 30 min and we'd lose data).
    console.warn("[beds24-wh] credential lookup failed:", e);
    await logSync("ERROR", { step: "auth", error: String(e?.message || e) });
  }

  // 2. Parse payload
  let payload: any;
  try {
    payload = await req.json();
  } catch (e: any) {
    await logSync("ERROR", { step: "parse", error: "invalid JSON body", detail: String(e?.message || e) });
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // 3. Log raw inbound event
  await logSync("RECEIVED", payload);

  // 4. Route to the correct handler
  if (payload?.action === "SYNC_ROOM") {
    return handleSyncRoom(payload, startMs);
  }
  // Handle PING / test webhooks — always return 200 so Beds24 doesn't
  // mark our endpoint as unhealthy and stop sending real webhooks.
  // Accept a handful of shapes Beds24 uses for test calls.
  if (
    payload?.action === "PING" ||
    payload?.action === "TEST" ||
    payload?.test === true ||
    payload?.test === "true"
  ) {
    return NextResponse.json({ ok: true, test: true, received: true });
  }
  return handleBookingWebhook(payload, startMs);
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER 1: Booking Webhook (v2 full payload)
// ═══════════════════════════════════════════════════════════════════════════
// Beds24 v2 booking webhooks POST the full booking object. No API call
// needed — we extract fields and upsert directly.
//
// Field compatibility notes (from Beds24 docs + real payloads):
//   - Booking ID:   "id" (v2) or "bookingId" (legacy)
//   - Property:     "propertyId" (v2) or "propId" (inventory)
//   - Room:         "roomId"
//   - Dates:        "arrival"/"departure" (v2) — YYYY-MM-DD format
//   - Guest count:  "numAdult", "numChild" (top-level integers)
//   - Guest name:   "firstName"/"lastName" (top-level) OR guests[0].firstName etc
//   - Status:       "confirmed", "new", "request", "cancelled", "black", "inquiry"

async function handleBookingWebhook(payload: any, startMs: number): Promise<NextResponse> {
  // ── Beds24 v2 booking webhooks wrap the booking data in a `booking` key.
  //    If present, unwrap it; otherwise fall back to top-level fields
  //    for backwards compatibility with older payload formats. ──
  const b = payload?.booking ?? payload;

  // ── Extract and validate booking ID ──
  const bookingId = b?.id ?? b?.bookingId;
  if (!bookingId) {
    await logSync("ERROR", {
      step: "booking-webhook", reason: "no booking id",
      payloadKeys: Object.keys(payload || {}),
      bookingKeys: payload?.booking ? Object.keys(payload.booking) : "no-booking-key",
    });
    return NextResponse.json({
      ok: true, applied: false, reason: "no booking id in payload",
    });
  }

  // ── Map Beds24 property:room → internal room code ──
  const propertyId = b?.propertyId ?? b?.propId;
  const payloadRoomId = b?.roomId;

  const roomCode = await mapToRoomCode(propertyId, payloadRoomId);
  if (!roomCode) {
    await logSync("ERROR", {
      step: "booking-webhook", reason: "unmapped room",
      bookingId, propertyId, roomId: payloadRoomId,
      key: propertyId && payloadRoomId ? `${propertyId}:${payloadRoomId}` : null,
    });
    return NextResponse.json({ ok: true, mapped: false, bookingId });
  }

  const room = await lookupRoom(roomCode);
  if (!room) {
    await logSync("ERROR", {
      step: "booking-webhook", reason: "room code not in Room table",
      bookingId, roomCode,
    });
    return NextResponse.json({ ok: true, mapped: false, roomCode, bookingId });
  }

  // ── Extract and validate dates ──
  const arrival = b.arrival ?? b.checkin;
  const departure = b.departure ?? b.checkout;
  const dates = parseDates(arrival, departure);
  if (!dates) {
    await logSync("ERROR", {
      step: "booking-webhook", reason: "invalid dates",
      bookingId, roomCode, arrival, departure,
    });
    return NextResponse.json({
      ok: true, mapped: true, applied: false, bookingId,
      reason: "missing or invalid arrival/departure",
    });
  }

  // ── Extract guest info ──
  // Pass payload.infoItems as fallback — in v2 booking webhooks, guest
  // personal data (firstName, lastName, phone, email) may be in infoItems[]
  // at the payload level rather than directly on the booking object.
  const guest = extractGuest(b, payload?.infoItems);
  const isCancelled = CANCELLED_STATUSES.has(b.status);

  // ── Extract source & price from Beds24 v2 fields ──
  // The webhook payload includes channel, apiSource, referer, price,
  // commission, and invoiceItems (at payload level, not inside booking).
  const bookingWithInvoice = {
    ...b,
    invoiceItems: payload?.invoiceItems ?? b?.invoiceItems,
  };
  const detectedSource = detectBookingSource(b);
  const totalPrice = extractBookingPrice(bookingWithInvoice);
  const nights = Math.max(1, Math.round((dates.end.getTime() - dates.start.getTime()) / 86_400_000));
  const pricePerNight = totalPrice ? Math.round(totalPrice / nights * 100) / 100 : null;

  // ── Upsert reservation ──
  try {
    const externalRef = `beds24-${bookingId}`;
    const result = await upsertReservation({
      externalRef,
      roomCode,
      roomId: room.id,
      startDate: dates.start,
      endDate: dates.end,
      guestName: guest.name,
      phone: guest.phone,
      email: guest.email,
      numAdult: guest.numAdult,
      numChild: guest.numChild,
      notes: b.notes || null,
      isCancelled,
      arrivalRaw: arrival,
      departureRaw: departure,
      via: "booking-webhook",
      source: detectedSource,
      pricePerNight,
    });
    await logSync("PROCESSED", {
      via: "booking-webhook", bookingId, roomCode,
      guest: guest.name, phone: guest.phone, email: guest.email,
      status: b.status, numAdult: guest.numAdult, numChild: guest.numChild,
      source: detectedSource, channel: b.channel || null,
      totalPrice, pricePerNight, commission: b.commission || null,
      hasGuests: Array.isArray(b.guests) && b.guests.length > 0,
      hasInfoItems: Array.isArray(payload?.infoItems) && payload.infoItems.length > 0,
      bookingKeys: Object.keys(b || {}).sort().join(","),
      payloadTopKeys: Object.keys(payload || {}).sort().join(","),
      ...result, durationMs: Date.now() - startMs,
    });
    return NextResponse.json({ ok: true, bookingId, roomCode, ...result });
  } catch (e: any) {
    console.error("[beds24-wh] booking-webhook apply failed:", e);
    await logSync("ERROR", {
      step: "booking-webhook", reason: "upsert failed",
      bookingId, roomCode, guest: guest.name, source: detectedSource,
      error: String(e?.message || e),
      stack: String(e?.stack || "").slice(0, 500),
    });
    // Return 200 so Beds24 does not mark the endpoint unhealthy. The error
    // is captured in SyncEvent above; the user can audit it in Supabase.
    return NextResponse.json({ ok: false, error: "apply failed" });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HANDLER 2: Inventory Webhook (SYNC_ROOM)
// ═══════════════════════════════════════════════════════════════════════════
// Minimal payload — only tells us WHICH room changed, not WHAT changed.
// We must call the Beds24 API to fetch current bookings for that room.
//
// Performance: fetches only the ONE property that triggered the webhook
// (not both). Typical response time: ~2–3s, well under Netlify's timeout.
//
// Payload format (from Beds24 docs):
//   {"roomId":"671001","propId":"322955","ownerId":"…","action":"SYNC_ROOM"}
//   Note: roomId and propId are STRINGS (not numbers).

async function handleSyncRoom(payload: any, startMs: number): Promise<NextResponse> {
  // ── Parse IDs (arrive as strings from Beds24) ──
  const propId = Number(payload.propId ?? payload.propertyId);
  const webhookRoomId = Number(payload.roomId);

  if (!propId || !webhookRoomId || !Number.isFinite(propId) || !Number.isFinite(webhookRoomId)) {
    await logSync("PROCESSED", {
      action: "SYNC_ROOM", applied: false, reason: "missing or invalid propId/roomId",
    });
    return NextResponse.json({
      ok: true, action: "SYNC_ROOM", applied: false, reason: "missing propId/roomId",
    });
  }

  // ── Map to internal room ──
  const key = `${propId}:${webhookRoomId}`;
  const roomCode = await mapToRoomCode(propId, webhookRoomId);
  if (!roomCode) {
    await logSync("PROCESSED", { action: "SYNC_ROOM", key, mapped: false });
    return NextResponse.json({ ok: true, action: "SYNC_ROOM", mapped: false, key });
  }

  const room = await lookupRoom(roomCode);
  if (!room) {
    await logSync("PROCESSED", { action: "SYNC_ROOM", roomCode, mapped: false });
    return NextResponse.json({ ok: true, action: "SYNC_ROOM", mapped: false, roomCode });
  }

  // ── Fetch bookings from Beds24 API ──
  const today = new Date().toISOString().slice(0, 10);
  const futureDate = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

  let bookings: any[];
  try {
    bookings = await fetchPropertyBookings(propId, today, futureDate);
  } catch (e: any) {
    console.error("[beds24-wh] SYNC_ROOM fetch failed:", e);
    await logSync("ERROR", { action: "SYNC_ROOM", roomCode, error: String(e?.message || e) });
    // Return 200 so Beds24 keeps delivering future webhooks. The fetch
    // failure is already logged to SyncEvent (step='SYNC_ROOM').
    return NextResponse.json({ ok: false, action: "SYNC_ROOM", error: "fetch failed" });
  }

  // ── Filter to bookings for THIS specific room ──
  const roomBookings = bookings.filter((b: any) => {
    const bRoomId = Number(b.roomId ?? b.room_id);
    const bPropId = Number(b.propertyId ?? b.property_id);
    return bRoomId === webhookRoomId && bPropId === propId;
  });

  // ── Process each booking ──
  let inserted = 0, updated = 0, cancelled = 0, skipped = 0, errors = 0;
  const errorDetails: any[] = [];

  for (const b of roomBookings) {
    try {
      // Validate booking has required fields
      if (!b.id) { skipped++; continue; }

      const arrival = b.arrival ?? b.checkin;
      const departure = b.departure ?? b.checkout;
      const dates = parseDates(arrival, departure);
      if (!dates) {
        skipped++;
        errorDetails.push({ bookingId: b.id, reason: "invalid dates", arrival, departure });
        continue;
      }

      const guest = extractGuest(b);
      const isCancelled = CANCELLED_STATUSES.has(b.status);
      const externalRef = `beds24-${b.id}`;

      // Extract source & price from Beds24 v2 API response fields
      const detectedSource = detectBookingSource(b);
      const totalPrice = extractBookingPrice(b);
      const bNights = Math.max(1, Math.round((dates.end.getTime() - dates.start.getTime()) / 86_400_000));
      const bPricePerNight = totalPrice ? Math.round(totalPrice / bNights * 100) / 100 : null;

      const result = await upsertReservation({
        externalRef,
        roomCode,
        roomId: room.id,
        startDate: dates.start,
        endDate: dates.end,
        guestName: guest.name,
        phone: guest.phone,
        email: guest.email,
        numAdult: guest.numAdult,
        numChild: guest.numChild,
        notes: b.notes || null,
        isCancelled,
        arrivalRaw: arrival,
        departureRaw: departure,
        via: "inventory-webhook",
        source: detectedSource,
        pricePerNight: bPricePerNight,
      });

      if (result.action === "inserted") inserted++;
      else if (result.action === "updated") updated++;
      else if (result.action === "cancelled") cancelled++;
      else skipped++;
    } catch (e: any) {
      console.error(`[beds24-wh] booking ${b.id} failed:`, e);
      errors++;
      errorDetails.push({
        bookingId: b.id, reason: "exception",
        error: String(e?.message || e),
        stack: String(e?.stack || "").slice(0, 300),
      });
    }
  }

  const durationMs = Date.now() - startMs;
  await logSync("PROCESSED", {
    action: "SYNC_ROOM", roomCode, key, via: "inventory-webhook",
    found: roomBookings.length, totalFromApi: bookings.length,
    inserted, updated, cancelled, skipped, errors, durationMs,
    ...(errorDetails.length > 0 ? { errorDetails } : {}),
  });

  return NextResponse.json({
    ok: true, action: "SYNC_ROOM", roomCode,
    found: roomBookings.length, inserted, updated, cancelled, skipped, errors,
    durationMs,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SHARED HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Room mapping ────────────────────────────────────────────────────────

let cachedMap: Record<string, string> | null = null;
let cachedMapAt = 0;
const MAP_TTL = 60_000; // 1 minute cache

async function getMap(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedMap && now - cachedMapAt < MAP_TTL) return cachedMap;
  cachedMap = await loadBeds24Map();
  cachedMapAt = now;
  return cachedMap;
}

async function mapToRoomCode(
  propertyId: string | number | undefined,
  roomId: string | number | undefined,
): Promise<string | null> {
  if (!propertyId || !roomId) return null;
  const map = await getMap();
  return map[`${propertyId}:${roomId}`] || null;
}

async function lookupRoom(roomCode: string): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin
    .from("Room")
    .select("id")
    .eq("code", roomCode)
    .maybeSingle();
  return data;
}

// ─── Date parsing ────────────────────────────────────────────────────────
// Beds24 v2 sends dates as "YYYY-MM-DD" strings.

function parseDates(
  arrival: string | undefined,
  departure: string | undefined,
): { start: Date; end: Date } | null {
  if (!arrival || !departure) return null;

  // Beds24 dates are "YYYY-MM-DD" — treat as UTC midnight
  const start = new Date(
    arrival.length <= 10 ? arrival + "T00:00:00Z" : arrival,
  );
  const end = new Date(
    departure.length <= 10 ? departure + "T00:00:00Z" : departure,
  );

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  if (end <= start) return null;

  return { start, end };
}

// ─── Guest extraction ────────────────────────────────────────────────────
// Guest info may come from THREE sources (checked in priority order):
//   1. guests[] array (when includeGuests=true on API fetch, or in webhook)
//   2. Top-level booking fields: firstName, lastName, phone, email
//   3. infoItems[] — key-value pairs at the webhook payload level
//      (Beds24 v2 Swagger: code="firstname"|"lastname"|"phone"|"email",
//       text="<value>"). This is the canonical source for guest personal
//       data in booking webhooks per the v2 schema.

function extractGuest(b: any, infoItems?: any[]): {
  name: string;
  phone: string;
  email: string | null;
  numAdult: number;
  numChild: number;
} {
  const g0 = Array.isArray(b.guests) && b.guests.length > 0 ? b.guests[0] : {};

  // Build a lookup from infoItems (code → text) for fallback.
  // Beds24 uses lowercase codes: "firstname", "lastname", "phone", "email".
  // infoItems can come from: payload.infoItems (webhook) OR b.infoItems (API fetch with includeInfoItems=true)
  const rawInfoItems = infoItems || b.infoItems;
  const info: Record<string, string> = {};
  if (Array.isArray(rawInfoItems)) {
    for (const item of rawInfoItems) {
      if (item?.code && item?.text) info[String(item.code).toLowerCase()] = String(item.text);
    }
  }

  const firstName = g0.firstName || b.firstName || b.guestFirstName
    || info["firstname"] || info["first_name"] || "";
  const lastName = g0.lastName || b.lastName || b.guestLastName
    || info["lastname"] || info["last_name"] || "";
  const name = (firstName + (lastName ? ` ${lastName}` : "")).trim() || "Beds24 гост";

  // Beds24 v2 has both `phone` and `mobile` fields at top level and in guests[]
  const phone = g0.phone || g0.mobile || b.phone || b.mobile
    || info["phone"] || info["mobile"] || "";
  const email = g0.email || b.email || info["email"] || null;

  return {
    name,
    phone,
    email,
    numAdult: Math.max(1, Number(b.numAdult || g0.numAdult) || 1),
    numChild: Math.max(0, Number(b.numChild || g0.numChild) || 0),
  };
}

// ─── Reservation upsert ─────────────────────────────────────────────────
// Central function for upserting a reservation. Handles all three cases:
//   - New booking → insert
//   - Existing booking → update
//   - Cancelled booking → set status to CANCELLED
//
// Uses externalRef UNIQUE constraint for idempotency.

async function upsertReservation(input: {
  externalRef: string;
  roomCode: string;
  roomId: string;
  startDate: Date;
  endDate: Date;
  guestName: string;
  phone: string;
  email: string | null;
  numAdult: number;
  numChild: number;
  notes: string | null;
  isCancelled: boolean;
  arrivalRaw: string;
  departureRaw: string;
  via: string;
  source?: string;
  pricePerNight?: number | null;
}): Promise<{ action: "inserted" | "updated" | "cancelled" | "skipped" }> {
  const { data: existing } = await supabaseAdmin
    .from("Reservation")
    .select("id, status")
    .eq("externalRef", input.externalRef)
    .maybeSingle();

  const color = getRoomColor(input.roomCode);

  // ── Case 1: Cancellation ──
  if (input.isCancelled) {
    if (existing && existing.status !== "CANCELLED") {
      const { error: cancelErr } = await supabaseAdmin
        .from("Reservation")
        .update({ status: "CANCELLED", cancelledAt: new Date().toISOString() })
        .eq("id", existing.id);
      if (cancelErr) console.error("[beds24-wh] cancel update failed:", cancelErr.message);
      await notify("CANCEL",
        `Beds24 · Анулиране · ${input.roomCode}`,
        `Резервация ${input.externalRef.replace("beds24-", "#")} анулирана`,
        existing.id,
      );
      return { action: "cancelled" };
    }
    return { action: "skipped" };
  }

  // ── Shared row data for insert/update ──
  const row = {
    guestName: input.guestName,
    phone: input.phone,
    email: input.email,
    roomCode: input.roomCode,
    roomId: input.roomId,
    startDate: input.startDate.toISOString(),
    endDate: input.endDate.toISOString(),
    status: "CONFIRMED" as const,
    color,
    notes: input.notes,
    guests: input.numAdult,
    children: input.numChild,
    source: input.source || "Beds24",
    ...(input.pricePerNight != null ? { pricePerNight: input.pricePerNight } : {}),
  };

  // ── Case 2: Update existing ──
  if (existing) {
    const { error: updateErr } = await supabaseAdmin
      .from("Reservation")
      .update(row)
      .eq("id", existing.id);
    if (updateErr) console.error("[beds24-wh] update failed:", updateErr.message);
    await notify("SYSTEM",
      `Beds24 · Промяна · ${input.roomCode}`,
      `${input.guestName} · ${input.arrivalRaw} – ${input.departureRaw}`,
      existing.id,
    );
    return { action: "updated" };
  }

  // ── Case 3: New reservation ──
  const { data: inserted, error: upsertErr } = await supabaseAdmin
    .from("Reservation")
    .upsert(
      { ...row, externalRef: input.externalRef },
      { onConflict: "externalRef" },
    )
    .select("id")
    .single();
  if (upsertErr) {
    console.error("[beds24-wh] upsert failed:", upsertErr.message);
    throw new Error(`upsert failed: ${upsertErr.message}`);
  }
  await notify("NEW",
    `Beds24 · Нова резервация · ${input.roomCode}`,
    `${input.guestName} · ${input.arrivalRaw} – ${input.departureRaw}`,
    inserted?.id,
  );
  return { action: "inserted" };
}

// ─── Notification helper (wraps global notify with positional args) ──────

async function notify(type: string, title: string, detail: string, reservationId?: string) {
  try {
    await notifyPush({ type, title, detail, reservationId });
  } catch (e) { console.warn("[beds24-wh] notify failed:", e); }
}

// ─── SyncEvent logger ────────────────────────────────────────────────────

async function logSync(status: "RECEIVED" | "PROCESSED" | "ERROR", payload: any) {
  try {
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "beds24",
      direction: "INBOUND_WEBHOOK",
      status,
      payload,
    });
  } catch { /* logging failures must never cascade */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// BEDS24 API CLIENT (for SYNC_ROOM only)
// ═══════════════════════════════════════════════════════════════════════════
// Fetches bookings for a SINGLE property from the Beds24 v2 API.
// Only used by handleSyncRoom — booking webhooks don't need API calls.
//
// Authentication flow (from Beds24 docs):
//   1. Exchange long-lived refreshToken → short-lived accessToken (24h)
//      GET /authentication/token  { header: refreshToken }
//      → { token, expiresIn, refreshToken }
//   2. Use accessToken in subsequent requests
//      GET /bookings  { header: token }

async function fetchPropertyBookings(
  propertyId: number,
  from: string,
  to: string,
): Promise<any[]> {
  // ── Load credentials ──
  const { data: cred } = await supabaseAdmin
    .from("IntegrationCredential")
    .select("values")
    .eq("provider", "beds24")
    .maybeSingle();

  const vals = cred?.values as any;
  const refreshToken = vals?.refreshToken || vals?.apiKey;
  if (!refreshToken) {
    await logSync("ERROR", {
      step: "api-credentials", reason: "no refreshToken or apiKey configured",
      hasCredRow: !!cred, valKeys: Object.keys(vals || {}),
    });
    throw new Error("no Beds24 credential configured");
  }

  // ── Get access token (use cached if still valid) ──
  let token = vals?.accessToken as string | null;
  let tokenSource = "cached";
  if (token && vals?.accessTokenExpiresAt) {
    const expiresAt = new Date(vals.accessTokenExpiresAt).getTime();
    const ttlMinutes = Math.round((expiresAt - Date.now()) / 60_000);
    if (expiresAt - Date.now() < 5 * 60_000) {
      token = null; // expired or about to expire
      tokenSource = `expired (ttl=${ttlMinutes}min)`;
    }
  } else {
    token = null;
    tokenSource = "no-cached-token";
  }

  if (!token) {
    const res = await fetch(`${BEDS24_BASE}/authentication/token`, {
      method: "GET",
      headers: { refreshToken, accept: "application/json" },
    });
    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      await logSync("ERROR", {
        step: "api-token-exchange", httpStatus: res.status,
        reason: tokenSource, body: errorBody.slice(0, 500),
      });
      throw new Error(`Beds24 token exchange failed: HTTP ${res.status}`);
    }
    const body = await res.json();
    token = body.token;
    if (!token) {
      await logSync("ERROR", {
        step: "api-token-exchange", reason: "no token in response",
        responseKeys: Object.keys(body || {}),
      });
      throw new Error("Beds24 token exchange returned no token");
    }
    tokenSource = "fresh";

    // Cache the new token (24h default, with safety margin)
    const expiresIn = typeof body.expiresIn === "number" ? body.expiresIn : 82800;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    // Beds24 v2 rotates the refresh token on every exchange — persisting
    // the new one keeps the chain alive forever (Problem 0 of the plan).
    const rotatedRefresh = typeof body.refreshToken === "string" && body.refreshToken.length > 0
      ? body.refreshToken
      : null;
    try {
      await supabaseAdmin
        .from("IntegrationCredential")
        .upsert(
          {
            provider: "beds24",
            values: {
              ...vals,
              accessToken: token,
              accessTokenExpiresAt: expiresAt,
              ...(rotatedRefresh ? { refreshToken: rotatedRefresh } : {}),
            },
            updatedAt: new Date().toISOString(),
          },
          { onConflict: "provider" },
        );
    } catch (e: any) {
      // Non-fatal but log it — next call will re-exchange
      await logSync("ERROR", {
        step: "api-token-cache", reason: "failed to cache token",
        error: String(e?.message || e),
      });
    }
  }

  // ── Fetch bookings ──
  const url = new URL(`${BEDS24_BASE}/bookings`);
  url.searchParams.set("propertyId", String(propertyId));
  url.searchParams.set("departureFrom", from);    // catches guests still in-house
  url.searchParams.set("arrivalTo", to);           // caps the future window
  url.searchParams.set("includeInvoiceItems", "true");
  url.searchParams.set("includeInfoItems", "true");
  url.searchParams.set("includeGuests", "true");

  const fetchStartMs = Date.now();
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { token: token!, accept: "application/json" },
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    await logSync("ERROR", {
      step: "api-fetch-bookings", httpStatus: res.status,
      propertyId, from, to, tokenSource,
      fetchDurationMs: Date.now() - fetchStartMs,
      body: errorBody.slice(0, 500),
    });
    throw new Error(`Beds24 bookings fetch failed: HTTP ${res.status}`);
  }

  const body = await res.json().catch(() => null);
  const fetchDurationMs = Date.now() - fetchStartMs;

  // Beds24 v2 returns a plain array. Some versions wrap in {data: [...]}.
  const result = Array.isArray(body) ? body
    : Array.isArray(body?.data) ? body.data
    : [];

  // Log the successful fetch for diagnostics
  if (result.length === 0 && body !== null) {
    await logSync("ERROR", {
      step: "api-fetch-bookings", reason: "unexpected response format",
      propertyId, tokenSource, fetchDurationMs,
      bodyType: typeof body, bodyKeys: Object.keys(body || {}),
    });
  }

  return result;
}
