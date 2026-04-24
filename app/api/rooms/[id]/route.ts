export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

/**
 * v1.2 — B6 per-room admin config.
 * Lets the admin update occupancy and cot settings per room from the
 * StayPilot settings UI. Only ADMIN sessions may PATCH — staff roles
 * can fetch but not mutate.
 */
const PatchInput = z.object({
  capacity:         z.number().int().min(1).max(12).optional(),
  cotEligible:      z.boolean().optional(),
  maxGuestsWithCot: z.number().int().min(1).max(12).optional().nullable(),
}).strip();

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const parsed = PatchInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  const update = { ...parsed.data };
  // If cotEligible is being turned OFF, leave maxGuestsWithCot as-is so a
  // later re-enable preserves the operator's preference; no cascading.

  const { data, error } = await supabaseAdmin
    .from("Room")
    .update(update)
    .eq("id", params.id)
    .select()
    .single();

  if (error)  return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Room not found" }, { status: 404 });
  return NextResponse.json(data);
}
