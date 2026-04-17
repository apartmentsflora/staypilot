import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getRoomColor } from "@/lib/rooms";
import { createBeds24Booking } from "@/lib/beds24";

const ReservationInput = z.object({
  guestName: z.string().trim().min(1, "guestName is required").max(120),
  phone: z.string().trim().max(40).optional().default(""),
  email: z.string().trim().email().optional().nullable(),
  roomCode: z.string().trim().min(1, "roomCode is required"),
  startDate: z.string().min(8, "startDate is required"),
  endDate: z.string().min(8, "endDate is required"),
  source: z.string().trim().max(40).optional().default("Direct"),
  notes: z.string().trim().max(2000).optional().nullable(),
  externalRef: z.string().trim().optional().nullable(),
});

function toIsoOrNull(v: string): string | null {
  const d = new Date(v.length <= 10 ? v + "T00:00:00Z" : v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("Reservation")
    .select("*, room:Room(code, label, entrance, capacity)")
    .neq("status", "CANCELLED")
    .order("startDate");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = ReservationInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const { guestName, phone, email, roomCode, source, notes } = parsed.data;
  const startDate = toIsoOrNull(parsed.data.startDate);
  const endDate = toIsoOrNull(parsed.data.endDate);
  if (!startDate || !endDate) return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  if (new Date(endDate) <= new Date(startDate))
    return NextResponse.json({ error: "endDate must be after startDate" }, { status: 400 });

  // Resolve room
  const { data: room, error: roomErr } = await supabaseAdmin
    .from("Room").select("id").eq("code", roomCode).maybeSingle();
  if (roomErr) return NextResponse.json({ error: roomErr.message }, { status: 500 });
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  // Conflict check (half-open interval: [start, end))
  const { data: conflicts, error: confErr } = await supabaseAdmin
    .from("Reservation")
    .select("id")
    .eq("roomId", room.id)
    .eq("status", "CONFIRMED")
    .lt("startDate", endDate)
    .gt("endDate", startDate);
  if (confErr) return NextResponse.json({ error: confErr.message }, { status: 500 });
  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: "Room is already booked for these dates" }, { status: 409 });
  }

  // externalRef: if the client passed one through (e.g. webhook relay), honor it;
  // otherwise leave null so the Beds24 push below can populate it.
  const inboundRef = parsed.data.externalRef || null;

  const { data, error } = await supabaseAdmin.from("Reservation").insert({
    guestName,
    phone: phone || "",
    email: email || null,
    roomCode,
    roomId: room.id,
    startDate,
    endDate,
    source: source || "Direct",
    notes: notes || null,
    status: "CONFIRMED",
    color: getRoomColor(roomCode),
    externalRef: inboundRef,
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Side effects — best-effort; failures are logged but don't fail the request.
  const detailDates = `${startDate.slice(0, 10)} – ${endDate.slice(0, 10)}`;
  try {
    await supabaseAdmin.from("Notification").insert({
      type: "NEW",
      title: `Нова резервация · ${roomCode}`,
      detail: `${guestName} · ${source || "Direct"} · ${detailDates}`,
    });
    await supabaseAdmin.from("SyncEvent").insert({
      provider: (source || "direct").toLowerCase(),
      direction: "INBOUND",
      status: "SUCCESS",
      payload: { reservationId: data.id, roomCode, guestName },
    });
  } catch (e) {
    console.error("[reservations POST] side-effect failure", e);
  }

  // Outbound Beds24 push — only when the reservation did NOT come from Beds24.
  // All failures are already logged as SyncEvent ERROR rows inside the client,
  // so we intentionally don't block the user's request on this.
  if (!inboundRef) {
    try {
      const push = await createBeds24Booking({
        reservationId: data.id,
        roomCode,
        guestName,
        phone: phone || "",
        email: email || null,
        startDate,
        endDate,
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
      console.error("[reservations POST] beds24 push threw", e);
    }
  }

  return NextResponse.json(data, { status: 201 });
}
