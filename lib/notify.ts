/**
 * Unified notification helper.
 *
 * Inserts a row into the Notification table AND fires a Web Push
 * to all subscribed devices in a single call.
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

export async function notify(opts: NotifyOpts) {
  const { type, title, detail, reservationId } = opts;

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
