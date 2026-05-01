export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { notify } from "@/lib/notify";

/**
 * v1.4 — Caparo reminder pusher.
 *
 * Fires an ALERT push when a direct/website booking is 24+ hours old
 * with no caparo received and no reminder already pushed. The 24-hour
 * threshold is deliberately INSIDE the 36-hour auto-cancel window so
 * the alert reaches the operator BEFORE the reservation is killed off
 * (giving them ~12 hours to call the guest, mark the deposit received,
 * etc.). Stamps `caparoReminderSentAt` so we don't re-pester.
 *
 * Auth modes (so this can run from a real cron, not just the browser):
 *   • Logged-in admin session  → allowed
 *   • Authorization: Bearer ${CRON_SECRET}  → allowed (Netlify Scheduled
 *     Functions / pg_cron / external schedulers pass this header)
 *
 * Idempotent: the timestamp guard + notify-dedupe (30 min) mean calling
 * it 1000 times in a row still only fires each reminder once.
 *
 * Skips OTA reservations (Booking / Airbnb / etc.) — those have their
 * own deposit/cancellation policies and we never auto-message about them.
 */
const CARAPO_REMINDER_HOURS = 24;
// Sources where caparo applies. OTA bookings handle their own deposits.
const REMINDER_SAFE_SOURCES = ["Уебсайт", "Директна", "Direct", "Телефон"];

export async function GET(req: Request) {
  // Authenticate: either a logged-in admin, or a Bearer token matching CRON_SECRET.
  const session = await getSession();
  const cronSecret = process.env.CRON_SECRET || "";
  const authHeader = req.headers.get("authorization") || "";
  const expectedHeader = cronSecret ? `Bearer ${cronSecret}` : null;
  const isCronCall = !!expectedHeader && authHeader === expectedHeader;
  if (!session && !isCronCall) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoffIso = new Date(Date.now() - CARAPO_REMINDER_HOURS * 3600_000).toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from("Reservation")
    .select("id, guestName, roomCode, startDate, endDate, createdAt, source")
    .eq("status", "CONFIRMED")
    .eq("caparoReceived", false)
    .is("caparoReminderSentAt", null)
    .in("source", REMINDER_SAFE_SOURCES)
    .lte("createdAt", cutoffIso);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reminded: string[] = [];
  for (const r of rows || []) {
    try {
      await notify({
        type: "ALERT",
        title: `⚠ Капаро · ${r.roomCode}`,
        detail: `${r.guestName} · ${String(r.startDate).slice(0,10)} — ${String(r.endDate).slice(0,10)} · няма капаро 24+ ч (анулиране в 36 ч)`,
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
