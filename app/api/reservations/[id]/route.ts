export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { updateBeds24Booking, cancelBeds24Booking } from "@/lib/beds24";

const PatchInput = z.object({
  guestName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.string().trim().email().optional().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["CONFIRMED", "CANCELLED", "HOLD"]).optional(),
  color: z.string().optional(),
}).strict();

function normalizeDate(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const d = new Date(v.length <= 10 ? v + "T00:00:00Z" : v);
  if (isNaN(d.getTime())) return undefined;
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
  if (update.startDate) update.startDate = normalizeDate(update.startDate);
  if (update.endDate)   update.endDate   = normalizeDate(update.endDate);

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
      await supabaseAdmin.from("Notification").insert({
        type: "CANCEL",
        title: `Анулирана резервация · ${data.roomCode}`,
        detail: `${data.guestName} · ${String(data.startDate).slice(0, 10)} – ${String(data.endDate).slice(0, 10)}`,
      });
    } catch (e) {
      console.error("[reservations PATCH] notify failure", e);
    }
  }

  // Outbound Beds24 push — update or cancel depending on status.
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
