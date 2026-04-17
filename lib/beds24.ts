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
export const CODE_TO_BEDS24_ROOM: Record<string, { propertyId: number; roomId: number }> = {
  "39.0.1": { propertyId: 320506, roomId: 666862 },
  "1.3":    { propertyId: 320506, roomId: 666858 },
  "1.3A":   { propertyId: 320506, roomId: 666864 },
  "1.5":    { propertyId: 320506, roomId: 666865 },
  "2.4.1":  { propertyId: 320506, roomId: 666857 },
  "2.4.2":  { propertyId: 320506, roomId: 666863 },
  "2.4.3":  { propertyId: 320506, roomId: 666859 },
  "2.5":    { propertyId: 320506, roomId: 666860 },
  "5.5":    { propertyId: 320506, roomId: 666861 },
  "41.0.1": { propertyId: 320505, roomId: 666856 },
  "41.0.2": { propertyId: 320505, roomId: 666854 },
  "1.1":    { propertyId: 320505, roomId: 666853 },
  "1.2":    { propertyId: 320505, roomId: 666855 },
  "2.2":    { propertyId: 320505, roomId: 666849 },
  "41-2":   { propertyId: 320505, roomId: 666850 },
  "3.1":    { propertyId: 320505, roomId: 666848 },
  "4.1":    { propertyId: 320505, roomId: 666852 },
  "4.2":    { propertyId: 320505, roomId: 666851 },
};

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
    const body = (await r.json()) as { token?: string; expiresIn?: number };
    if (!body.token) {
      await logSync("ERROR", { step: "token-exchange", body });
      return null;
    }
    const expiresIn = typeof body.expiresIn === "number" ? body.expiresIn : 82800; // ~23h
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    await saveCred({ accessToken: body.token, accessTokenExpiresAt: expiresAt });
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
  const map = CODE_TO_BEDS24_ROOM[input.roomCode];
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

  const patch: any = { id };
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
 * Cancel a Beds24 booking. Convenience wrapper.
 */
export async function cancelBeds24Booking(externalRef?: string | null): Promise<PushResult> {
  return updateBeds24Booking({ externalRef, status: "CANCELLED" });
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
 * Pull bookings from Beds24 for both Flora properties across a date
 * window. Returns the raw array (possibly paginated) or null on failure.
 * The caller is responsible for mapping each booking → Reservation upsert
 * via BEDS24_MAP in lib/rooms.ts.
 */
export async function fetchBeds24Bookings(from: string, to: string): Promise<any[] | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const propertyIds = [320505, 320506];
  const all: any[] = [];
  try {
    for (const pid of propertyIds) {
      const url = new URL(`${BEDS24_BASE}/bookings`);
      url.searchParams.set("propertyId", String(pid));
      url.searchParams.set("arrivalFrom", from);
      url.searchParams.set("arrivalTo", to);
      url.searchParams.set("includeInvoiceItems", "false");
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
