// v1.4 — Netlify Scheduled Function: caparo reminders.
//
// Runs every 15 minutes regardless of whether anyone has a StayPilot tab
// open. Hits /api/caparo/check-reminders with the shared CRON_SECRET
// bearer token, which then walks every CONFIRMED website/direct/phone
// booking that's 24+ hours old and unpaid, fires an ALERT push, and
// stamps caparoReminderSentAt to prevent re-firing.
//
// Failure mode: if the API call fails, we log + return — the next tick
// 15 minutes later will retry. Idempotent on the API side.
//
// Required Netlify env vars:
//   STAYPILOT_PUBLIC_URL  — full origin, e.g. https://staypilot3.netlify.app
//   CRON_SECRET           — long random string, also set on the API route

export default async () => {
  const base = Netlify.env.get("STAYPILOT_PUBLIC_URL");
  const secret = Netlify.env.get("CRON_SECRET");
  if (!base || !secret) {
    console.warn("[cron-caparo-reminders] missing STAYPILOT_PUBLIC_URL or CRON_SECRET; skipping");
    return new Response("not configured", { status: 200 });
  }
  try {
    const res = await fetch(`${base}/api/caparo/check-reminders`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.text();
    console.log("[cron-caparo-reminders]", res.status, body.slice(0, 240));
    return new Response(body, { status: 200 });
  } catch (e) {
    console.error("[cron-caparo-reminders] threw:", e?.message || e);
    return new Response("error", { status: 200 });
  }
};

// Every 15 minutes. The 24-hour reminder threshold + 36-hour auto-cancel
// give us a 12-hour window — every 15 min is plenty of resolution.
export const config = { schedule: "*/15 * * * *" };
