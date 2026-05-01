// Beds24 v2 API outbound client.
//
// Flow:
//   1. Operator pastes a long-life *refresh token* into the Settings UI
//      (stored as IntegrationCredential.values.refreshToken). Backward
//      compat: if only .apiKey is set, we treat it as a refreshToken.
//   2. At call time we exchange it for a short-lived access token (cached
//      in the same row with .accessToken + .accessTokenExpiresAt).
//   3. We POST /bookings to create, update, or cancel.
//
// All exported functions are **best-effort**: they return {ok, ...} and
// never throw. A Beds24 outage, misconfiguration, or missing credential
// must not fail a StayPilot user's request. Failures are logged as
// SyncEvent rows with direction='OUTBOUND', status='ERROR'.

import { supabaseAdmin } from "@/lib/supabase";

const BEDS24_BASE = "https://beds24.com/api/v2";

// Forward map: internal room code → Beds24 roomId.
// Derived from lib/rooms.ts BEDS24_MAP (propertyId:roomId → code).
// Kept here to avoid a circular import.
// Built dynamically at runtime from the Room table. The static fallback
// below uses property IDs only (room IDs are placeholders until the room
// discovery endpoint populates the Room table with real Beds24 IDs).
// At runtime, prefer loadBeds24RoomMap() which reads the DB.
export const CODE_TO_BEDS24_ROOM: Record<string, { propertyId: number; roomId: number }> = {};

/** Load the roomCode → {propertyId, roomId} map from the Room table. */
export async function loadBeds24RoomMap(): Promise<Record<string, { propertyId: number; roomId: number }>> {
  try {
    const { data: rooms } = await supabaseAdmin
      .from("Room").select("code, beds24PropertyId, beds24RoomId");
    const map: Record<string, { propertyId: number; roomId: number }> = {};
    for (const r of (rooms || [])) {
      if (r.beds24PropertyId && r.beds24RoomId) {
        map[r.code] = { propertyId: r.beds24PropertyId, roomId: r.beds24RoomId };
      }
    }
    return map;
  } catch {
    return {};
  }
}

type CredValues = {
  refreshToken?: string;
  apiKey?: string;           // legacy alias for refreshToken
  accessToken?: string;
  accessTokenExpiresAt?: string;
  webhookSecret?: string;
};

async function loadCred(): Promise<CredValues | null> {
  try {
    const { data } = await supabaseAdmin
      .from("IntegrationCredential")
      .select("values")
      .eq("provider", "beds24")
      .maybeSingle();
    return (data?.values as CredValues) || null;
  } catch {
    return null;
  }
}

async function saveCred(patch: Partial<CredValues>) {
  try {
    const cur = (await loadCred()) || {};
    const merged = { ...cur, ...patch };
    await supabaseAdmin
      .from("IntegrationCredential")
      .upsert(
        { provider: "beds24", values: merged, updatedAt: new Date().toISOString() },
        { onConflict: "provider" }
      );
  } catch (e) {
    console.warn("[beds24] saveCred failed", e);
  }
}

async function logSync(status: "PROCESSED" | "ERROR", payload: any) {
  try {
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "beds24",
      direction: "OUTBOUND",
      status,
      payload,
    });
  } catch {
    /* logging failure must not cascade */
  }
}

/**
 * Exchange refresh token for a fresh access token. Caches result for 23h.
 * Returns null if credentials are not configured or the exchange fails.
 */
async function getAccessToken(): Promise<string | null> {
  const cred = await loadCred();
  if (!cred) return null;

  const refresh = cred.refreshToken || cred.apiKey;
  if (!refresh) return null;

  // Reuse cached token if still valid (with 5-minute safety margin).
  if (cred.accessToken && cred.accessTokenExpiresAt) {
    const exp = new Date(cred.accessTokenExpiresAt).getTime();
    if (exp - Date.now() > 5 * 60_000) return cred.accessToken;
  }

  try {
    const r = await fetch(`${BEDS24_BASE}/authentication/token`, {
      method: "GET",
      headers: { refreshToken: refresh, accept: "application/json" },
    });
    if (!r.ok) {
      await logSync("ERROR", {
        step: "token-exchange",
        httpStatus: r.status,
        body: await r.text().catch(() => null),
      });
      return null;
    }
    const body = (await r.json()) as { token?: string; expiresIn?: number; refreshToken?: string };
    if (!body.token) {
      await logSync("ERROR", { step: "token-exchange", body });
      return null;
    }
    const expiresIn = typeof body.expiresIn === "number" ? body.expiresIn : 82800; // ~23h
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    // Beds24 v2 rotates the refresh token on every exchange. Persisting the
    // new one is what makes the chain self-healing forever — without this,
    // the original refresh token eventually gets invalidated and every
    // Beds24 call dies silently (Problem 0 of the plan).
    const rotatedRefresh = typeof body.refreshToken === "string" && body.refreshToken.length > 0
      ? body.refreshToken
      : null;
    await saveCred({
      accessToken: body.token,
      accessTokenExpiresAt: expiresAt,
      ...(rotatedRefresh ? { refreshToken: rotatedRefresh } : {}),
    });
    return body.token;
  } catch (e: any) {
    await logSync("ERROR", { step: "token-exchange", error: String(e?.message || e) });
    return null;
  }
}

type PushResult = { ok: true; bookingId: number } | { ok: false; reason: string };

function isoDate(v: string | Date): string {
  const d = typeof v === "string" ? new Date(v) : v;
  return d.toISOString().slice(0, 10);
}

function splitName(full: string): { firstName: string; lastName: string } {
  const t = (full || "").trim();
  if (!t) return { firstName: "", lastName: "" };
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function postBookings(bookings: any[]): Promise<any[] | null> {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const r = await fetch(`${BEDS24_BASE}/bookings`, {
      method: "POST",
      headers: {
        token,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(bookings),
    });
    const text = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* non-JSON response */ }

    if (!r.ok) {
      await logSync("ERROR", { step: "bookings", httpStatus: r.status, body: parsed ?? text });
      return null;
    }
    return Array.isArray(parsed) ? parsed : null;
  } catch (e: any) {
    await logSync("ERROR", { step: "bookings", error: String(e?.message || e) });
    return null;
  }
}

/**
 * Create a booking in Beds24 for an internal reservation.
 * Idempotent by design: if the reservation's externalRef already starts
 * with "beds24-" (i.e. it originated from Beds24 inbound webhook), we skip.
 */
export async function createBeds24Booking(input: {
  reservationId: string;
  roomCode: string;
  guestName: string;
  phone?: string | null;
  email?: string | null;
  startDate: string;  // ISO
  endDate: string;    // ISO
  notes?: string | null;
  externalRef?: string | null;
}): Promise<PushResult> {
  if (input.externalRef && input.externalRef.startsWith("beds24-")) {
    return { ok: false, reason: "skipped — reservation originated from Beds24" };
  }
  const dynamicMap = await loadBeds24RoomMap();
  const map = dynamicMap[input.roomCode] || CODE_TO_BEDS24_ROOM[input.roomCode];
  if (!map) return { ok: false, reason: `no Beds24 mapping for room ${input.roomCode}` };

  const { firstName, lastName } = splitName(input.guestName);
  const booking = {
    roomId: map.roomId,
    status: "confirmed",
    arrival: isoDate(input.startDate),
    departure: isoDate(input.endDate),
    firstName,
    lastName,
    phone: input.phone || "",
    email: input.email || "",
    notes: input.notes || "",
    // reference fields help identify the booking when it bounces back via webhook
    referer: "StayPilot",
    apiReference: `staypilot-${input.reservationId}`,
    // Beds24: API-created bookings don't trigger webhooks by default.
    // Must explicitly opt in so our webhook handler stays in sync.
    allowWebhooks: true,
  };

  const out = await postBookings([booking]);
  if (!out) return { ok: false, reason: "Beds24 push failed (see SyncEvent)" };
  const first = out[0];
  const newId = first?.new?.id ?? first?.modified?.id ?? first?.id;
  if (first?.success === false || !newId) {
    await logSync("ERROR", { step: "create", beds24Response: first });
    return { ok: false, reason: "Beds24 rejected booking" };
  }
  await logSync("PROCESSED", { step: "create", bookingId: newId, roomCode: input.roomCode });
  return { ok: true, bookingId: Number(newId) };
}

/**
 * Update an existing Beds24 booking identified by the reservation's
 * externalRef (expects format "beds24-<id>"). No-op if no Beds24 id.
 */
export async function updateBeds24Booking(input: {
  externalRef?: string | null;
  guestName?: string;
  phone?: string | null;
  email?: string | null;
  startDate?: string;
  endDate?: string;
  notes?: string | null;
  status?: "CONFIRMED" | "CANCELLED" | "HOLD";
}): Promise<PushResult> {
  if (!input.externalRef || !input.externalRef.startsWith("beds24-")) {
    return { ok: false, reason: "no Beds24 booking id to update" };
  }
  const id = Number(input.externalRef.slice("beds24-".length));
  if (!Number.isFinite(id)) return { ok: false, reason: "invalid Beds24 booking id" };

  const patch: any = { id, allowWebhooks: true };
  if (input.status === "CANCELLED") patch.status = "cancelled";
  else if (input.status === "HOLD") patch.status = "request";
  else if (input.status === "CONFIRMED") patch.status = "confirmed";

  if (input.startDate) patch.arrival = isoDate(input.startDate);
  if (input.endDate)   patch.departure = isoDate(input.endDate);
  if (input.guestName !== undefined) {
    const { firstName, lastName } = splitName(input.guestName);
    patch.firstName = firstName;
    patch.lastName = lastName;
  }
  if (input.phone !== undefined) patch.phone = input.phone || "";
  if (input.email !== undefined) patch.email = input.email || "";
  if (input.notes !== undefined) patch.notes = input.notes || "";

  const out = await postBookings([patch]);
  if (!out) return { ok: false, reason: "Beds24 push failed (see SyncEvent)" };
  const first = out[0];
  if (first?.success === false) {
    await logSync("ERROR", { step: "update", beds24Response: first });
    return { ok: false, reason: "Beds24 rejected update" };
  }
  await logSync("PROCESSED", { step: "update", bookingId: id });
  return { ok: true, bookingId: id };
}

/**
 * Cancel a Beds24 booking by hard-deleting it.
 *
 * v2 API supports DELETE /bookings?id=N which removes the booking entirely
 * (no gray bar / cancelled record left on the calendar). We prefer this over
 * status=cancelled because cancelled bookings clutter the Beds24 UI even
 * though they don't hold inventory.
 *
 * externalRef must be of the form "beds24-<id>" (set when the inbound webhook
 * imported the booking, or when createBeds24Booking returned the new id).
 */
export async function cancelBeds24Booking(externalRef?: string | null): Promise<PushResult> {
  const id = externalRef?.startsWith("beds24-") ? Number(externalRef.slice(7)) : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, reason: "no Beds24 id on externalRef" };
  }
  const token = await getAccessToken();
  if (!token) return { ok: false, reason: "no Beds24 access token" };

  try {
    const r = await fetch(`${BEDS24_BASE}/bookings?id=${id}`, {
      method: "DELETE",
      headers: { token, accept: "application/json" },
    });
    const text = await r.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* non-JSON */ }
    if (!r.ok) {
      await logSync("ERROR", { step: "delete", httpStatus: r.status, body: parsed ?? text });
      return { ok: false, reason: `Beds24 delete failed (HTTP ${r.status})` };
    }
    const first = Array.isArray(parsed) ? parsed[0] : parsed;
    if (first?.success === false) {
      // Beds24 returns 200 with success:false (+ errors[]) for "booking
      // not found" — treat that as idempotent success (we wanted it gone,
      // it's already gone). Any other error message is a real failure.
      const errMsg = String(first?.errors?.[0]?.message || "").toLowerCase();
      if (errMsg.includes("not found") || errMsg.includes("does not exist")) {
        await logSync("PROCESSED", { step: "delete", bookingId: id, note: "already-gone" });
        return { ok: true, bookingId: id };
      }
      await logSync("ERROR", { step: "delete", beds24Response: first });
      return { ok: false, reason: "Beds24 rejected delete" };
    }
    await logSync("PROCESSED", { step: "delete", bookingId: id });
    return { ok: true, bookingId: id };
  } catch (e: any) {
    await logSync("ERROR", { step: "delete", error: String(e?.message || e) });
    return { ok: false, reason: String(e?.message || e) };
  }
}

/**
 * Lightweight connectivity probe used by /api/integrations/beds24/test and
 * /api/health. Returns true if token exchange succeeds.
 */
export async function beds24Ping(): Promise<{ ok: boolean; reason?: string }> {
  const cred = await loadCred();
  if (!cred || !(cred.refreshToken || cred.apiKey)) {
    return { ok: false, reason: "no credential configured" };
  }
  const t = await getAccessToken();
  return t ? { ok: true } : { ok: false, reason: "token exchange failed" };
}

/**
 * Detect the original booking source/channel from a Beds24 v2 booking object.
 *
 * Priority:
 *  1. `channel` — structured enum set by Beds24: "booking", "airbnb",
 *     "agoda", "expedia", "vrbo", "direct", "bookingpage", etc.
 *  2. `apiSource` — free-text string often set by OTA integrations,
 *     e.g. "Airbnb.com", "Booking.com".
 *  3. `referer` — (single 'r') free-text referrer field on the booking.
 *
 * Returns our internal source label (title-cased OTA name or "Директна").
 */
export function detectBookingSource(b: any): string {
  // Beds24 v2 GET /bookings response fields used:
  //   channel          — enum: "booking", "airbnb", "direct", "bookingpage", etc.
  //   apiSource        — free text: "Airbnb.com", "Booking.com", etc.
  //   referer          — free text: set when booking was created via API
  //   refererEditable  — free text: editable version of referer
  //
  // IMPORTANT: channel "direct" means "created via API" — this includes
  // BOTH our website (referer="Direct website booking") and StayPilot
  // (referer="StayPilot"). We must check referer BEFORE returning
  // "Директна" for channel=direct, otherwise website bookings get
  // misclassified.

  const ch  = String(b.channel || "").toLowerCase().trim();
  const api = String(b.apiSource || "").toLowerCase();
  const ref = String(b.referer || b.refererEditable || "").toLowerCase();

  // ── 1. OTA channels (highest priority — unambiguous) ──
  if (ch === "booking") return "Booking";
  if (ch === "airbnb" || ch === "airbnbical") return "Airbnb";
  if (ch === "expedia") return "Expedia";
  if (ch === "vrbo" || ch === "vrboical") return "VRBO";
  if (ch === "agoda") return "Agoda";
  if (ch === "hostelworld") return "Hostelworld";
  if (ch === "trip") return "Trip.com";
  if (ch === "googleads") return "Google Ads";

  // ── 2. OTA patterns in apiSource ──
  if (/booking\.?com/i.test(api)) return "Booking";
  if (/airbnb/i.test(api)) return "Airbnb";
  if (/expedia/i.test(api)) return "Expedia";
  if (/vrbo|homeaway/i.test(api)) return "VRBO";
  if (/agoda/i.test(api)) return "Agoda";

  // ── 3. OTA patterns in referer ──
  if (/booking\.?com/i.test(ref)) return "Booking";
  if (/airbnb/i.test(ref)) return "Airbnb";
  if (/expedia/i.test(ref)) return "Expedia";
  if (/hotels\.?com/i.test(ref)) return "Hotels.com";
  if (/trivago/i.test(ref)) return "Trivago";
  if (/vrbo|homeaway/i.test(ref)) return "VRBO";
  if (/agoda/i.test(ref)) return "Agoda";
  if (/hostelworld/i.test(ref)) return "Hostelworld";

  // ── 4. Website detection — MUST come before "direct" channel catch-all ──
  // The website's create-booking.mjs sends referer: "Direct website booking".
  // Beds24 sets channel="direct" for API-created bookings, so if we checked
  // channel first, website bookings would be mislabeled as "Директна".
  if (/website|flora/i.test(ref)) return "Уебсайт";

  // ── 5. StayPilot-created bookings ──
  if (/staypilot/i.test(ref)) return "Директна";

  // ── 6. channel "direct" / "bookingpage" — generic direct booking ──
  if (ch === "direct" || ch === "bookingpage") return "Директна";

  // ── 7. Any other referer with "direct" in it ──
  if (/direct/i.test(ref)) return "Директна";

  // ── 8. If channel was set to anything non-empty, surface it ──
  if (ch) return ch.charAt(0).toUpperCase() + ch.slice(1);

  // Default: came through Beds24 but channel unknown
  return "Beds24";
}

/**
 * v1.4 — Source-preservation guard for Beds24 ingestion.
 *
 * Why: Beds24 stores referer="API" for every booking we push from Flora's
 * website (it discards our "Direct website booking" string), so when its
 * inbound webhook / poll / import re-syncs the same booking, detectBookingSource
 * falls through to "Директна". If we blindly write that on update, we
 * downgrade authoritative external sources ("Уебсайт", "Booking", "Airbnb"…)
 * back to "Директна" — which is what the user reported.
 *
 * Use: when updating an existing Reservation, fetch its current source and
 * pass it through this helper. The result tells you whether to include the
 * `source` field in the update payload.
 *
 *   const newSource = sourceForUpdate(existing.source, detectBookingSource(b));
 *   if (newSource != null) row.source = newSource;
 *
 * Returns:
 *   • null  → keep the existing source (don't write source at all)
 *   • string → safe to write this source
 */
const TRUSTED_EXISTING_SOURCES = new Set([
  // External / OTA labels — Beds24 echo of an OTA booking should NEVER
  // downgrade these (and even if detection is consistent, locking them
  // protects against future regression).
  "Уебсайт", "Booking", "Airbnb", "Expedia", "VRBO", "Agoda", "Hotels.com", "Trivago",
  // Internal labels — when an operator creates a booking in StayPilot with
  // source="Телефон" / "Direct", the Beds24 echo arrives with referer="StayPilot"
  // which detectBookingSource maps to "Директна". Without these guards the
  // operator-set label gets clobbered by the echo. "Директна" itself is
  // included so detectBookingSource's no-op write is suppressed (saves a
  // pointless update that bumps updatedAt for no reason).
  "Телефон", "Direct", "Директна",
]);
export function sourceForUpdate(existingSource: string | null | undefined, detected: string): string | null {
  if (existingSource && TRUSTED_EXISTING_SOURCES.has(existingSource)) {
    // The row already has a stronger source label than anything Beds24 can
    // tell us. Skip writing source to preserve it.
    return null;
  }
  return detected;
}

/**
 * Extract total price from a Beds24 v2 booking object.
 *
 * Beds24 v2 schema fields (from apiV2.yaml):
 *  - `price`  — top-level booking price (int32)
 *  - `invoiceItems` — line-item breakdown (only with includeInvoiceItems=true)
 *      Each item has: type ("charge"|"payment"), amount (unit), qty, lineTotal,
 *      subType (1=room price, 101=channel manager total, 200+=payments)
 *
 * Returns the total price as a number, or null if unavailable.
 */
export function extractBookingPrice(b: any): number | null {
  // 1. Direct price field (most reliable — always present in Beds24 v2)
  if (b.price != null && Number(b.price) > 0) return Number(b.price);

  // 2. Sum invoice items — CHARGE items only (skip payments to avoid double-count)
  //    Use lineTotal (= qty × amount) when available, fall back to amount × qty.
  if (Array.isArray(b.invoiceItems) && b.invoiceItems.length > 0) {
    let chargeSum = 0;
    for (const item of b.invoiceItems) {
      // Skip payment-type items (type "payment" or subType >= 200)
      const itype = String(item.type || "").toLowerCase();
      if (itype === "payment") continue;
      const subType = Number(item.subType) || 0;
      if (subType >= 200) continue;

      const lt = Number(item.lineTotal);
      if (lt && lt > 0) {
        chargeSum += lt;
      } else {
        const amt = Number(item.amount) || 0;
        const qty = Number(item.qty) || 1;
        if (amt > 0) chargeSum += amt * qty;
      }
    }
    if (chargeSum > 0) return chargeSum;
  }

  return null;
}

/**
 * Extract OTA commission from a Beds24 v2 booking.
 * Returns the commission amount or null if not set.
 */
export function extractBookingCommission(b: any): number | null {
  if (b.commission != null && Number(b.commission) > 0) return Number(b.commission);
  return null;
}

/**
 * Pull bookings from Beds24 for both Flora properties across a date
 * window. Returns the raw array (possibly paginated) or null on failure.
 * The caller is responsible for mapping each booking → Reservation upsert
 * via BEDS24_MAP in lib/rooms.ts.
 */
export async function fetchBeds24Bookings(from: string, to: string): Promise<any[] | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const propertyIds = [322955, 322959];
  const all: any[] = [];
  try {
    for (const pid of propertyIds) {
      const url = new URL(`${BEDS24_BASE}/bookings`);
      url.searchParams.set("propertyId", String(pid));
      // Use departureFrom + arrivalTo to capture all bookings overlapping
      // the [from, to] window — not just those arriving within it.
      // This catches guests who arrived before `from` but depart after it.
      url.searchParams.set("departureFrom", from);
      url.searchParams.set("arrivalTo", to);
      // Beds24 v2 /bookings excludes cancelled+black by default. We must
      // explicitly request them (as repeated status params) so the poll
      // can sync cancellations back to StayPilot. Without this, cancelled
      // Beds24 bookings remain CONFIRMED in StayPilot forever.
      url.searchParams.append("status", "confirmed");
      url.searchParams.append("status", "new");
      url.searchParams.append("status", "request");
      url.searchParams.append("status", "cancelled");
      url.searchParams.append("status", "black");
      url.searchParams.set("includeInvoiceItems", "true");
      url.searchParams.set("includeInfoItems", "true");
      url.searchParams.set("includeGuests", "true");
      const r = await fetch(url.toString(), {
        method: "GET",
        headers: { token, accept: "application/json" },
      });
      if (!r.ok) {
        await logSync("ERROR", { step: "fetch", propertyId: pid, httpStatus: r.status });
        continue;
      }
      const body = await r.json().catch(() => null);
      const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
      for (const b of list) all.push(b);
    }
    return all;
  } catch (e: any) {
    await logSync("ERROR", { step: "fetch", error: String(e?.message || e) });
    return null;
  }
}
