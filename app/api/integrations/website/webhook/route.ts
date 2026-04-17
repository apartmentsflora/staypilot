export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getRoomColor } from "@/lib/rooms";
import { createBeds24Booking } from "@/lib/beds24";

const WebsiteInput = z.object({
  roomCode: z.string().trim().min(1),
  guestName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().email().optional().nullable(),
  startDate: z.string().min(8),
  endDate: z.string().min(8),
  notes: z.string().trim().max(2000).optional().nullable(),
});

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
  const { roomCode, guestName, phone, email, notes } = parsed.data;

  const start = new Date(parsed.data.startDate);
  const end = new Date(parsed.data.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: "Invalid dates" }, { status: 400 });
  }

  const { data: room } = await supabaseAdmin.from("Room").select("id").eq("code", roomCode).maybeSingle();
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const { data: conflicts } = await supabaseAdmin.from("Reservation")
    .select("id").eq("roomId", room.id).eq("status", "CONFIRMED")
    .lt("startDate", end.toISOString()).gt("endDate", start.toISOString());
  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: "Room unavailable for these dates" }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin.from("Reservation").insert({
    guestName, phone: phone || "", email: email || null,
    roomCode, roomId: room.id,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    source: "Уебсайт",
    notes: notes || null,
    status: "CONFIRMED",
    color: getRoomColor(roomCode),
    externalRef: `website-${Date.now()}`,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await supabaseAdmin.from("Notification").insert({
      type: "NEW", title: `Уебсайт · Нова резервация · ${roomCode}`,
      detail: `${guestName} · ${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}`,
    });
  } catch (e) { console.error("[website webhook] notify failed", e); }

  // Outbound Beds24 push — a website booking must close the dates across
  // every OTA managed by Beds24. Best-effort; failures are logged inside
  // the client and never block the website response.
  try {
    const push = await createBeds24Booking({
      reservationId: data.id,
      roomCode,
      guestName,
      phone: phone || "",
      email: email || null,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      notes: notes || null,
      externalRef: null,
    });
    if (push.ok) {
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
