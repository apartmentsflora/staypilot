export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { updateBeds24Booking, cancelBeds24Booking } from "@/lib/beds24";
import { notify } from "@/lib/notify";

// .strict() strips unknown fields — prevents injection of arbitrary DB columns
const PatchInput = z.object({
  guestName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().optional().nullable().transform(v => v === "" ? null : v),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().trim().max(2000).optional().nullable().transform(v => v === "" ? null : v),
  status: z.enum(["CONFIRMED", "CANCELLED", "HOLD"]).optional(),
  color: z.string().optional(),
  roomCode: z.string().trim().optional(),
  source: z.string().trim().max(40).optional(),
  guests: z.any().optional(),
  children: z.any().optional(),
  cots: z.any().optional(),
  pricePerNight: z.any().optional(),
  arrivalTime: z.string().optional(),
  departTime: z.string().optional(),
  guestLang: z.enum(["en","bg","de","fr","ru","uk","no"]).optional(),
  // v1.2 — Caparo (deposit) tracking.
  caparoReceived: z.boolean().optional(),
  caparoAmount: z.any().optional(),
  // v1.4 — Parking pool toggle.
  parking: z.boolean().optional(),
}).strip();

function normalizeDate(v: string | undefined): string | null | undefined {
  if (!v) return undefined;
  const d = new Date(v.length <= 10 ? v + "T00:00:00Z" : v);
  if (isNaN(d.getTime())) return null; // null signals invalid
  return d.toISOString();
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = PatchInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }
  const update: Record<string, any> = { ...parsed.data };

  // Validate and normalize dates — return 400 for invalid dates instead of silently ignoring
  if (update.startDate) {
    const norm = normalizeDate(update.startDate);
    if (norm === null) return NextResponse.json({ error: "Invalid startDate" }, { status: 400 });
    update.startDate = norm;
  }
  if (update.endDate) {
    const norm = normalizeDate(update.endDate);
    if (norm === null) return NextResponse.json({ error: "Invalid endDate" }, { status: 400 });
    update.endDate = norm;
  }

  // If roomCode changed, resolve the new room ID — fail if room not found
  if (update.roomCode) {
    const { data: newRoom } = await supabaseAdmin
      .from("Room").select("id").eq("code", update.roomCode).maybeSingle();
    if (!newRoom) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    update.roomId = newRoom.id;
  }

  // If cancelling, set cancelledAt in the same update (not a separate query)
  if (update.status === "CANCELLED") {
    update.cancelledAt = new Date().toISOString();
  }
  // If reverting a cancellation, clear cancelledAt in the same update
  if (update.status === "CONFIRMED") {
    update.cancelledAt = null;
  }

  // v1.2 — Caparo auto-stamp.
  // When staff tick "capaparo получено" we record the timestamp and coerce
  // the amount to a number. When they untick, we clear both timestamp and
  // amount so the row goes back to "pending" correctly.
  if (typeof update.caparoReceived === "boolean") {
    if (update.caparoReceived) {
      update.caparoReceivedAt = new Date().toISOString();
      if (update.caparoAmount != null && update.caparoAmount !== "") {
        const n = Number(update.caparoAmount);
        update.caparoAmount = isFinite(n) && n >= 0 ? n : null;
      }
    } else {
      update.caparoReceivedAt = null;
      update.caparoAmount = null;
      update.caparoReminderSentAt = null; // allow reminder to fire again on re-flag
    }
  }

  const { data, error } = await supabaseAdmin
    .from("Reservation")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

  if (update.status === "CANCELLED") {
    try {
      await notify({
        type: "CANCEL",
        title: `Анулирана резервация · ${data.roomCode}`,
        detail: `${data.guestName} · ${String(data.startDate).slice(0, 10)} – ${String(data.endDate).slice(0, 10)}`,
        reservationId: data.id,
      });
    } catch (e) {
      console.error("[reservations PATCH] notify failure", e);
    }
  }

  // Outbound Beds24 push — only for reservations that originated from Beds24.
  if (data.externalRef && String(data.externalRef).startsWith("beds24-")) {
    try {
      await updateBeds24Booking({
        externalRef: data.externalRef,
        guestName: update.guestName,
        phone: update.phone,
        email: update.email,
        startDate: update.startDate,
        endDate: update.endDate,
        notes: update.notes,
        status: update.status,
      });
    } catch (e) {
      console.error("[reservations PATCH] beds24 push threw", e);
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Look up externalRef before deleting so we can still cancel on Beds24.
  const { data: existing } = await supabaseAdmin
    .from("Reservation").select("externalRef").eq("id", params.id).maybeSingle();

  const { error } = await supabaseAdmin.from("Reservation").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing?.externalRef) {
    try { await cancelBeds24Booking(existing.externalRef); }
    catch (e) { console.error("[reservations DELETE] beds24 cancel threw", e); }
  }
  return NextResponse.json({ ok: true });
}
