// v1.4 — Netlify Scheduled Function: caparo auto-cancel at 36h.
//
// Runs every 15 minutes server-side (independent of any StayPilot tab
// being open). Hits /api/caparo/auto-cancel with the shared CRON_SECRET
// bearer token. The API route is idempotent — only flips CONFIRMED →
// CANCELLED for direct/website bookings older than 36h with no caparo.
//
// Required Netlify env vars:
//   STAYPILOT_PUBLIC_URL  — full origin
//   CRON_SECRET           — long random string

export default async () => {
  const base = Netlify.env.get("STAYPILOT_PUBLIC_URL");
  const secret = Netlify.env.get("CRON_SECRET");
  if (!base || !secret) {
    console.warn("[cron-caparo-auto-cancel] missing STAYPILOT_PUBLIC_URL or CRON_SECRET; skipping");
    return new Response("not configured", { status: 200 });
  }
  try {
    const res = await fetch(`${base}/api/caparo/auto-cancel`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const body = await res.text();
    console.log("[cron-caparo-auto-cancel]", res.status, body.slice(0, 240));
    return new Response(body, { status: 200 });
  } catch (e) {
    console.error("[cron-caparo-auto-cancel] threw:", e?.message || e);
    return new Response("error", { status: 200 });
  }
};

export const config = { schedule: "*/15 * * * *" };
