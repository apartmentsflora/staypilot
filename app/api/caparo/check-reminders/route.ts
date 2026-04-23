export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { notify } from "@/lib/notify";

/**
 * v1.2 — Caparo reminder pusher.
 *
 * Finds confirmed reservations that are at least 2 calendar days old,
 * have no caparo received, and have not yet had a reminder push sent.
 * Fires one ALERT notification per such reservation (which in turn
 * triggers web-push to every subscribed device) and stamps
 * `caparoReminderSentAt` so we don't re-pester.
 *
 * Called from the browser's auto-sync loop (every 30s while the tab is
 * open). Idempotent: the timestamp guard + notify dedupe (30 min) mean
 * calling it 1000 times in a row still only fires each reminder once.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from("Reservation")
    .select("id, guestName, roomCode, startDate, endDate, createdAt")
    .eq("status", "CONFIRMED")
    .eq("caparoReceived", false)
    .is("caparoReminderSentAt", null)
    .lte("createdAt", twoDaysAgo);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reminded: string[] = [];
  for (const r of rows || []) {
    try {
      await notify({
        type: "ALERT",
        title: `⚠ Капаро · ${r.roomCode}`,
        detail: `${r.guestName} · ${String(r.startDate).slice(0,10)} — ${String(r.endDate).slice(0,10)} · няма капаро от 2+ дни`,
        reservationId: r.id,
      });
      await supabaseAdmin
        .from("Reservation")
        .update({ caparoReminderSentAt: new Date().toISOString() })
        .eq("id", r.id);
      reminded.push(r.id);
    } catch (e) {
      console.error("[caparo/check-reminders] notify failed for", r.id, e);
    }
  }

  return NextResponse.json({ ok: true, checked: rows?.length || 0, reminded: reminded.length });
}
