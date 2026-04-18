export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { loadBeds24Map, getRoomColor } from "@/lib/rooms";

// Beds24 → StayPilot webhook.
//
// CRITICAL: Beds24 inventory webhooks have a short timeout (~5s). Our handler
// MUST return 200 OK immediately and process the sync in the background.
// If we block on the Beds24 API fetch + DB upserts, Beds24 considers the
// webhook failed and stops sending subsequent notifications.
//
// Beds24 sends TWO types of webhook payload:
//
// 1. **Inventory webhook** (SYNC_ROOM) — fired on new bookings, modifications,
//    cancellations, and availability/price changes. Payload is minimal:
//      {"roomId":"671001","propId":"322955","ownerId":"...","action":"SYNC_ROOM"}
//    We respond immediately with 200, then fetch the latest bookings for that
//    room from the Beds24 API and upsert them into our database in the background.
//
// 2. **Legacy full-payload webhook** (for backward compat) — contains full booking
//    details: bookingId, arrival, departure, firstName, lastName, etc.
//    Processed inline without an API call (fast enough to respond in time).
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

  // ── Detect SYNC_ROOM inventory webhook ──────────────────────────────────
  if (payload?.action === "SYNC_ROOM") {
    // Fire background processing — DO NOT await.
    // Return 200 immediately so Beds24 doesn't time out.
    processSyncRoom(payload).catch((e) =>
      console.error("[beds24 webhook] background SYNC_ROOM failed", e)
    );
    return NextResponse.json({ ok: true, action: "SYNC_ROOM", accepted: true });
  }

  // ── Legacy full-payload webhook (backward compat) ───────────────────────
  return handleFullPayload(payload);
}

// ── Background SYNC_ROOM processor ───────────────────────────────────────
// Runs AFTER the 200 response is sent. Fetches bookings from Beds24 API for
// ONLY the specific property that triggered the webhook (not both), then
// upserts matching bookings into the database.
async function processSyncRoom(payload: any) {
  const propId = Number(payload.propId || payload.propertyId);
  const roomId = Number(payload.roomId);

  if (!propId || !roomId) {
    await logSync("PROCESSED", { action: "SYNC_ROOM", applied: false, reason: "missing propId/roomId" });
    return;
  }

  // Map to internal room code
  const dynamicMap = await loadBeds24Map();
  const key = `${propId}:${roomId}`;
  const roomCode = dynamicMap[key] || null;
  if (!roomCode) {
    await logSync("PROCESSED", { action: "SYNC_ROOM", key, mapped: false });
    return;
  }

  const { data: room } = await supabaseAdmin
    .from("Room").select("id").eq("code", roomCode).maybeSingle();
  if (!room) {
    await logSync("PROCESSED", { action: "SYNC_ROOM", mapped: false, roomCode });
    return;
  }

  // Fetch bookings for ONLY this property (not both) — much faster.
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);

  let bookings: any[];
  try {
    bookings = await fetchPropertyBookings(propId, today, future);
  } catch (e: any) {
    console.error("[beds24 webhook] SYNC_ROOM fetch failed", e);
    await logSync("ERROR", { action: "SYNC_ROOM", roomCode, error: e.message });
    return;
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

      const start = new Date(arrival);
      const end = new Date(departure);
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
    action: "SYNC_ROOM", roomCode, key,
    found: roomBookings.length, inserted, updated, cancelled, errors,
  });
}

// ── Fetch bookings for a SINGLE property ─────────────────────────────────
// Unlike fetchBeds24Bookings() in lib/beds24.ts (which fetches both properties),
// this only queries the one property that triggered the webhook — ~2x faster.
async function fetchPropertyBookings(propertyId: number, from: string, to: string): Promise<any[]> {
  // Get access token
  const { data: cred } = await supabaseAdmin
    .from("IntegrationCredential").select("values").eq("provider", "beds24").maybeSingle();
  const vals = cred?.values as any;
  const refresh = vals?.refreshToken || vals?.apiKey;
  if (!refresh) throw new Error("no Beds24 credential");

  let token = vals?.accessToken;
  // Check if cached token is still valid (5-min margin)
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
    // Cache the new token
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

// ── Legacy full-payload handler ───────────────────────────────────────────
// Handles webhooks that include full booking details directly in the payload.
// This is fast (no API calls) so it can respond synchronously.
async function handleFullPayload(payload: any) {
  const dynamicMap = await loadBeds24Map();
  const key = payload?.propertyId && payload?.roomId
    ? `${payload.propertyId}:${payload.roomId}` : null;
  const roomCode = key ? (dynamicMap[key] || null) : null;
  if (!roomCode) return NextResponse.json({ ok: true, mapped: false });

  const { data: room } = await supabaseAdmin.from("Room").select("id").eq("code", roomCode).maybeSingle();
  if (!room) return NextResponse.json({ ok: true, mapped: false });

  if (!payload.bookingId || !payload.arrival || !payload.departure) {
    return NextResponse.json({ ok: true, mapped: true, applied: false, reason: "missing bookingId/arrival/departure" });
  }

  const start = new Date(payload.arrival);
  const end = new Date(payload.departure);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ ok: true, mapped: true, applied: false, reason: "invalid dates" });
  }

  const externalRef = `beds24-${payload.bookingId}`;
  const { data: existing } = await supabaseAdmin
    .from("Reservation").select("id, status").eq("externalRef", externalRef).maybeSingle();

  const guest0 = Array.isArray(payload.guests) && payload.guests.length > 0 ? payload.guests[0] : {};
  const gFirstName = guest0.firstName || payload.firstName || "";
  const gLastName = guest0.lastName || payload.lastName || "";
  const guestName = gFirstName
    ? `${gFirstName} ${gLastName}`.trim()
    : (payload.guestName || "Beds24 гост");
  const gPhone = guest0.phone || payload.phone || "";
  const gEmail = guest0.email || payload.email || null;

  try {
    if (payload.status === "cancelled" && existing) {
      await supabaseAdmin.from("Reservation").update({ status: "CANCELLED" }).eq("id", existing.id);
      await supabaseAdmin.from("Notification").insert({
        type: "CANCEL", title: `Beds24 · Анулиране · ${roomCode}`,
        detail: `Резервация #${payload.bookingId} анулирана`,
      });
    } else if (existing && payload.status !== "cancelled") {
      await supabaseAdmin.from("Reservation").update({
        guestName, phone: gPhone, email: gEmail,
        startDate: start.toISOString(), endDate: end.toISOString(),
        notes: payload.notes || null, status: "CONFIRMED",
        roomCode, roomId: room.id, color: getRoomColor(roomCode),
      }).eq("id", existing.id);
      await supabaseAdmin.from("Notification").insert({
        type: "SYSTEM", title: `Beds24 · Промяна · ${roomCode}`,
        detail: `${guestName} · ${payload.arrival} – ${payload.departure}`,
      });
    } else if (!existing && payload.status !== "cancelled") {
      await supabaseAdmin.from("Reservation").upsert({
        guestName, phone: gPhone, email: gEmail,
        roomCode, roomId: room.id,
        startDate: start.toISOString(), endDate: end.toISOString(),
        source: "Beds24", notes: payload.notes || null,
        status: "CONFIRMED", color: getRoomColor(roomCode), externalRef,
      }, { onConflict: "externalRef" });
      await supabaseAdmin.from("Notification").insert({
        type: "NEW", title: `Beds24 · Нова резервация · ${roomCode}`,
        detail: `${guestName} · ${payload.arrival} – ${payload.departure}`,
      });
    }
    await logSync("PROCESSED", { roomCode, bookingId: payload.bookingId });
  } catch (e: any) {
    console.error("[beds24 webhook] apply failed", e);
    await logSync("ERROR", { error: String(e?.message || e), bookingId: payload.bookingId });
    return NextResponse.json({ ok: false, error: "apply failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mappedRoomCode: roomCode });
}

// ── Helpers ───────────────────────────────────────────────────────────────
async function logSync(status: "PROCESSED" | "ERROR", payload: any) {
  try {
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "beds24", direction: "INBOUND_WEBHOOK", status, payload,
    });
  } catch { /* never cascade logging failures */ }
}
