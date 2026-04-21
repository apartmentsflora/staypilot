export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getRoomColor } from "@/lib/rooms";
import { createBeds24Booking } from "@/lib/beds24";
import { notify } from "@/lib/notify";

const WebsiteInput = z.object({
  // Room identification — either roomCode OR beds24RoomId (website sends beds24RoomId)
  roomCode: z.string().trim().min(1).optional(),
  beds24RoomId: z.union([z.string(), z.number()]).optional(),
  // Guest info
  guestName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().email().nullable().optional()
  ),
  // Dates
  startDate: z.string().min(8),
  endDate: z.string().min(8),
  // Optional fields the website can now send
  guests: z.union([z.string(), z.number()]).optional(),
  children: z.union([z.string(), z.number()]).optional(),
  cots: z.union([z.string(), z.number()]).optional(),
  pricePerNight: z.union([z.string(), z.number()]).optional(),
  arrivalTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
}).refine(
  (d) => d.roomCode || d.beds24RoomId,
  { message: "Either roomCode or beds24RoomId is required" }
);

export async function POST(req: Request) {
  // Require API key if configured
  const apiKey = req.headers.get("x-staypilot-key");
  const { data: cred } = await supabaseAdmin
    .from("IntegrationCredential").select("values").eq("provider", "website").maybeSingle();
  const expectedKey = (cred?.values as any)?.apiKey;
  if (expectedKey && apiKey !== expectedKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => ({} as any));
  try {
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "website", direction: "INBOUND_WEBHOOK", status: "RECEIVED", payload,
    });
  } catch (e) { console.error("[website webhook] log received failed", e); }

  const parsed = WebsiteInput.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing required fields", issues: parsed.error.issues }, { status: 400 });
  }
  const { guestName, phone, email, notes } = parsed.data;

  // ── Resolve room ──────────────────────────────────────────────────────
  // The website sends beds24RoomId (the Beds24 room ID used in its booking form).
  // We look it up in the Room table to find the StayPilot roomCode.
  // If roomCode is provided directly, use that instead.
  let roomCode = parsed.data.roomCode || "";
  if (!roomCode && parsed.data.beds24RoomId) {
    const rid = String(parsed.data.beds24RoomId);
    const { data: roomRow } = await supabaseAdmin
      .from("Room").select("code").eq("beds24RoomId", Number(rid)).maybeSingle();
    if (!roomRow) {
      return NextResponse.json({ error: `No room found for beds24RoomId ${rid}` }, { status: 404 });
    }
    roomCode = roomRow.code;
  }

  const start = new Date(parsed.data.startDate);
  const end = new Date(parsed.data.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }

  const { data: room } = await supabaseAdmin.from("Room").select("id").eq("code", roomCode).maybeSingle();
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  // Conflict check
  const { data: conflicts } = await supabaseAdmin.from("Reservation")
    .select("id").eq("roomId", room.id).eq("status", "CONFIRMED")
    .lt("startDate", end.toISOString()).gt("endDate", start.toISOString());
  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: "Room unavailable for these dates" }, { status: 409 });
  }

  // ── Parse optional fields ─────────────────────────────────────────────
  const guestCount = Number(parsed.data.guests) || 1;
  const childrenCount = Number(parsed.data.children) || 0;
  const cotsCount = Number(parsed.data.cots) || 0;
  const pricePerNight = parsed.data.pricePerNight != null && Number(parsed.data.pricePerNight) > 0
    ? Number(parsed.data.pricePerNight) : null;
  const arrivalTime = parsed.data.arrivalTime || "14:00";

  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const detailDates = `${startIso.slice(0, 10)} – ${endIso.slice(0, 10)}`;

  const { data, error } = await supabaseAdmin.from("Reservation").insert({
    guestName,
    phone: phone || "",
    email: email || null,
    roomCode,
    roomId: room.id,
    startDate: startIso,
    endDate: endIso,
    source: "Уебсайт",
    notes: notes || null,
    status: "CONFIRMED",
    color: getRoomColor(roomCode),
    externalRef: `website-${Date.now()}`,
    guests: guestCount,
    children: childrenCount,
    cots: cotsCount,
    pricePerNight,
    arrivalTime,
    departTime: "11:00",
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Notifications ─────────────────────────────────────────────────────
  // Always create the standard NEW notification.
  // Additionally create ALERT notifications for special requests:
  //   - Guest requested cot(s) (кошара)
  //   - Guest arriving late (≥ 18:00 — requires self check-in coordination)
  try {
    // Standard "new reservation" notification + push
    await notify({
      type: "NEW",
      title: `Уебсайт · Нова резервация · ${roomCode}`,
      detail: `${guestName} · ${detailDates}`,
      reservationId: data.id,
    });

    // ALERT: Cot requested
    if (cotsCount > 0) {
      await notify({
        type: "ALERT",
        title: `⚠ Кошара · ${roomCode}`,
        detail: `${guestName} · ${cotsCount} кошар${cotsCount === 1 ? "а" : "и"} · ${detailDates}`,
        reservationId: data.id,
      });
    }

    // ALERT: Late check-in (arrivalTime >= 18:00)
    if (arrivalTime >= "18:00") {
      await notify({
        type: "ALERT",
        title: `⚠ Късно пристигане · ${roomCode}`,
        detail: `${guestName} · пристига ${arrivalTime} · ${detailDates}`,
        reservationId: data.id,
      });
    }
  } catch (e) { console.error("[website webhook] notify failed", e); }

  // ── Outbound Beds24 push ──────────────────────────────────────────────
  // A website booking must close the dates across every OTA managed by
  // Beds24. Best-effort; failures are logged inside the client and never
  // block the website response.
  try {
    const push = await createBeds24Booking({
      reservationId: data.id,
      roomCode,
      guestName,
      phone: phone || "",
      email: email || null,
      startDate: startIso,
      endDate: endIso,
      notes: notes || null,
      externalRef: null,
    });
    if (push.ok && push.bookingId) {
      await supabaseAdmin
        .from("Reservation")
        .update({ externalRef: `beds24-${push.bookingId}` })
        .eq("id", data.id);
    }
  } catch (e) {
    console.error("[website webhook] beds24 push threw", e);
  }

  return NextResponse.json({ ok: true, reservationId: data.id }, { status: 201 });
}
