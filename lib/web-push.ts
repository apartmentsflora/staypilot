/**
 * Server-side Web Push notification sender.
 *
 * Reads all PushSubscription rows from Supabase and sends a push
 * message to each device. Stale subscriptions (410 Gone) are
 * automatically cleaned up.
 *
 * Usage:
 *   await sendPush({ type: "ALERT", title: "...", body: "..." });
 *   await sendPush({ type: "NEW", title: "...", body: "..." });
 */

import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase";

interface PushPayload {
  type: string;          // "ALERT" | "NEW" | "CANCEL" | etc.
  title: string;
  body: string;
  tag?: string;          // dedup tag
  url?: string;          // click target
}

let _configured = false;

async function ensureConfigured() {
  if (_configured) return;
  const { data } = await supabaseAdmin
    .from("IntegrationCredential")
    .select("values")
    .eq("provider", "webpush")
    .maybeSingle();

  const keys = data?.values as any;
  if (!keys?.publicKey || !keys?.privateKey) {
    throw new Error("Web Push VAPID keys not configured");
  }

  webpush.setVapidDetails(
    "mailto:praznq1@gmail.com",
    keys.publicKey,
    keys.privateKey,
  );
  _configured = true;
}

export async function sendPush(payload: PushPayload): Promise<{ sent: number; failed: number; cleaned: number }> {
  await ensureConfigured();

  const { data: subs } = await supabaseAdmin
    .from("PushSubscription")
    .select("id, endpoint, keys");

  if (!subs || subs.length === 0) {
    return { sent: 0, failed: 0, cleaned: 0 };
  }

  const message = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  let cleaned = 0;

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys as any,
          },
          message,
          {
            TTL: 86400, // 24 hours — notification stays queued
            urgency: payload.type === "ALERT" ? "high" : "normal",
          },
        );
        sent++;
      } catch (err: any) {
        // 410 Gone or 404 — subscription expired, clean it up
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabaseAdmin.from("PushSubscription").delete().eq("id", sub.id);
          cleaned++;
        } else {
          console.error(`[web-push] Failed to send to ${sub.endpoint.slice(0, 60)}:`, err.statusCode || err.message);
          failed++;
        }
      }
    })
  );

  return { sent, failed, cleaned };
}
