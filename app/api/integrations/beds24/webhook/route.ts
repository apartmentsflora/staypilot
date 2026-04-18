export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { loadBeds24Map, getRoomColor } from "@/lib/rooms";
import { fetchBeds24Bookings } from "@/lib/beds24";

// Beds24 → StayPilot webhook.
//
// Beds24 sends TWO types of webhook payload:
//
// 1. **Inventory webhook** (SYNC_ROOM) — fired on new bookings, modifications,
//    cancellations, and availability/price changes. Payload is minimal:
//      {"roomId":"671001","propId":"322955","ownerId":"...","action":"SYNC_ROOM"}
//    We respond by fetching the latest bookings for that room from the Beds24 API
//    and upserting them into our database.
//
// 2. **Legacy full-payload webhook** (for backward compat) — contains full booking
//    details: bookingId, arrival, departure, firstName, lastName, etc.
//    Processed inline without an API call.
//
// Public endpoint (no session) because Beds24 servers call it directly.
// Optionally authenticated with a shared secret.

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
  // Beds24 inventory webhooks send: {roomId, propId, ownerId, action}
  // The field names differ from the booking API: "propId" not "propertyId".
  if (payload?.action === "SYNC_ROOM") {
    return handleSyncRoom(payload);
  }

  // ── Legacy full-payload webhook (backward compat) ───────────────────────
  return handleFullPayload(payload);
}

// ── SYNC_ROOM handler ─────────────────────────────────────────────────────
// Receives minimal notification, fetches bookings from Beds24 API, upserts.
async function handleSyncRoom(payload: any) {
  const propId = Number(payload.propId || payload.propertyId);
  const roomId = Number(payload.roomId);

  if (!propId || !roomId) {
    return NextResponse.json({ ok: true, action: "SYNC_ROOM", applied: false, reason: "missing propId/roomId" });
  }

  // Map to internal room code
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
    return NextResponse.json({ ok: true, action: "SYNC_ROOM", mapped: false, roomCode });
  }

  // Fetch current bookings for this property from Beds24 API.
  // Use a wide window: today → 12 months out, to capture any changes.
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10);

  let bookings: any[] | null;
  try {
    bookings = await fetchBeds24Bookings(today, future);
  } catch (e: any) {
    console.error("[beds24 webhook] SYNC_ROOM fetch failed", e);
    await logSync("ERROR", { action: "SYNC_ROOM", roomCode, error: e.message });
    return NextResponse.json({ ok: false, error: "fetch failed" }, { status: 502 });
  }

  if (!bookings) {
    await logSync("ERROR", { action: "SYNC_ROOM", roomCode, error: "null response" });
    return NextResponse.json({ ok: false, error: "fetch returned null" }, { status: 502 });
  }

  // Filter to only bookings for this specific room
  const roomBookings = bookings.filter(
    (b: any) => Number(b.roomId ?? b.room_id) === roomId &&
                Number(b.propertyId ?? b.property_id) === propId
  );

  let inserted = 0, updated = 0, cancelled = 0;

  for (const b of roomBookings) {
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

    if (existing) {
      await supabaseAdmin.from("Reservation").update({
        guestName,
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
      }).eq("id", existing.id);
      updated++;
    } else {
      await supabaseAdmin.from("Reservation").insert({
        guestName,
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
        guests: numAdult,
        children: numChild,
      });
      await supabaseAdmin.from("Notification").insert({
        type: "NEW", title: `Beds24 · Нова резервация · ${roomCode}`,
        detail: `${guestName} · ${arrival} – ${departure}`,
      });
      inserted++;
    }
  }

  await logSync("PROCESSED", {
    action: "SYNC_ROOM", roomCode, key,
    found: roomBookings.length, inserted, updated, cancelled,
  });

  return NextResponse.json({
    ok: true, action: "SYNC_ROOM", roomCode,
    found: roomBookings.length, inserted, updated, cancelled,
  });
}

// ── Legacy full-payload handler ───────────────────────────────────────────
// Handles webhooks that include full booking details directly in the payload.
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
      await supabaseAdmin.from("Reservation").insert({
        guestName, phone: gPhone, email: gEmail,
        roomCode, roomId: room.id,
        startDate: start.toISOString(), endDate: end.toISOString(),
        source: "Beds24", notes: payload.notes || null,
        status: "CONFIRMED", color: getRoomColor(roomCode), externalRef,
      });
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
