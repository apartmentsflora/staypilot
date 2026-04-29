export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

/**
 * v1.4 — Parking pool availability check (StayPilot side).
 *
 * Apartments Flora has 5 underground parking spots, shared across both
 * buildings. Given a date range, return the number of free spots on the
 * worst night of that range. The query mirrors the Flora-side
 * /api/get-parking-availability Netlify function so both surfaces see the
 * same number.
 *
 * Optional ?excludeId=<reservation id> lets the calendar's "edit
 * reservation" form re-check availability without counting itself.
 *
 * Response shape: { ok, total, used, free, full }.
 *
 * Auth: requires a logged-in admin session. Public guests should use the
 * Flora-side endpoint instead.
 */

const POOL_SIZE = 5;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const checkin   = url.searchParams.get("checkin");
  const checkout  = url.searchParams.get("checkout");
  const excludeId = url.searchParams.get("excludeId") || null;

  if (!checkin || !checkout) {
    return NextResponse.json({ error: "Missing checkin or checkout" }, { status: 400 });
  }
  if (checkin >= checkout) {
    return NextResponse.json({ error: "checkout must be after checkin" }, { status: 400 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from("Reservation")
    .select("id, startDate, endDate")
    .eq("status", "CONFIRMED")
    .eq("parking", true)
    .lt("startDate", checkout)
    .gt("endDate",   checkin);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const considered = (rows || []).filter(r => !excludeId || r.id !== excludeId);
  const days = _datesBetween(checkin, checkout);
  let maxUsed = 0;
  for (const day of days) {
    const count = considered.filter(r => {
      const s = String(r.startDate).slice(0, 10);
      const e = String(r.endDate).slice(0, 10);
      return s <= day && e > day;
    }).length;
    if (count > maxUsed) maxUsed = count;
  }
  const free = Math.max(0, POOL_SIZE - maxUsed);
  return NextResponse.json({
    ok: true,
    total: POOL_SIZE,
    used: maxUsed,
    free,
    full: free === 0,
  });
}

function _datesBetween(checkin: string, checkout: string): string[] {
  const out: string[] = [];
  const d = new Date(checkin + "T12:00:00Z");
  const end = new Date(checkout + "T12:00:00Z");
  while (d < end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
