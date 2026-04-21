/**
 * Unified notification helper.
 *
 * Inserts a row into the Notification table AND fires a Web Push
 * to all subscribed devices in a single call.
 *
 * Dedupe: if an identical (type, title, detail) notification already
 * fired within the last 30 minutes, skip both the DB insert and the
 * web-push. Protects against poll loops and flaky reservation SELECTs
 * that would otherwise flood the user with the same "new booking" alert
 * every poll cycle (~2 min).
 *
 * Usage:
 *   await notify({ type: "NEW", title: "...", detail: "..." });
 *   await notify({ type: "ALERT", title: "...", detail: "...", reservationId: "..." });
 */

import { supabaseAdmin } from "@/lib/supabase";
import { sendPush } from "@/lib/web-push";

interface NotifyOpts {
  type: string;
  title: string;
  detail: string;
  reservationId?: string | null;
}

const DEDUPE_WINDOW_MS = 30 * 60_000; // 30 minutes

export async function notify(opts: NotifyOpts) {
  const { type, title, detail, reservationId } = opts;

  // 0. Dedupe — skip if the exact same notification fired in the last 30 min.
  //    Treat a DB error here as "no duplicate" and continue, so a transient
  //    Supabase hiccup doesn't suppress a legitimate alert.
  try {
    const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
    const { data: dup } = await supabaseAdmin
      .from("Notification")
      .select("id")
      .eq("type", type)
      .eq("title", title)
      .eq("detail", detail)
      .gt("createdAt", cutoff)
      .limit(1)
      .maybeSingle();
    if (dup) {
      console.log(`[notify] deduped (${type}) ${title} — already fired in the last 30 min`);
      return;
    }
  } catch (dedupeErr) {
    console.warn("[notify] dedupe check failed, proceeding:", dedupeErr);
  }

  // 1. Insert into Notification table
  const { error: dbErr } = await supabaseAdmin.from("Notification").insert({
    type,
    title,
    detail,
    ...(reservationId ? { reservationId } : {}),
  });
  if (dbErr) console.error("[notify] DB insert failed:", dbErr.message);

  // 2. Fire Web Push to all devices (best-effort, never throws)
  try {
    await sendPush({
      type,
      title,
      body: detail,
      tag: reservationId ? `${type.toLowerCase()}-${reservationId}` : `${type.toLowerCase()}-${Date.now()}`,
      url: "/dashboard/calendar",
    });
  } catch (e) {
    console.error("[notify] push failed:", e);
  }
}
