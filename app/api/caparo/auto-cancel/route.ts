export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { cancelBeds24Booking } from "@/lib/beds24";
import { notify } from "@/lib/notify";
import {
  caparoCancelEmailHtml,
  caparoCancelEmailSubject,
  type GuestLang,
} from "@/lib/email-templates";

/**
 * v1.2 C2 — Caparo auto-cancel (runs every sync cycle, idempotent).
 *
 * Finds confirmed reservations that are at least 36 HOURS old and have
 * no caparo received. Flips each to CANCELLED, cancels the booking in
 * Beds24 (which frees the dates on Booking.com / Airbnb via Beds24's
 * own channel sync), sends a guest email, and posts a staff alert.
 *
 * The 36-hour window intentionally lags the 24-hour email warning by
 * 12 hours to give the guest time to pay after the welcome email arrives.
 *
 * Safety guards:
 *  - Only processes rows that are CONFIRMED + caparoReceived=false.
 *  - Externally-sourced bookings are skipped (source != 'Beds24'/'Booking'/'Airbnb')
 *    — OTAs have their own cancellation windows we must not override.
 *  - Already-CANCELLED rows are not re-processed (filtered by status).
 *  - Guest email is best-effort; a failure does not block the cancel.
 *  - Beds24 push is best-effort; a failure does not block the DB flip.
 */

const AUTO_CANCEL_HOURS = 36;

function getGmailCreds(): { user: string; pass: string } | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return { user, pass };
}

export async function GET(req: Request) {
  // Auth: admin session OR Bearer ${CRON_SECRET} (for Netlify Scheduled
  // Functions / pg_cron / external schedulers).
  const session = await getSession();
  const cronSecret = process.env.CRON_SECRET || "";
  const authHeader = req.headers.get("authorization") || "";
  const isCronCall = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!session && !isCronCall) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cutoffIso = new Date(Date.now() - AUTO_CANCEL_HOURS * 3600_000).toISOString();

  // Only StayPilot-native and Flora-website bookings are auto-cancellable.
  // External OTA bookings (Beds24/Booking/Airbnb) have their own cancellation
  // rules and depositing handled by the channel — we must not touch them.
  const SAFE_SOURCES = ["Директна", "Direct", "Уебсайт", "Телефон"];

  const { data: rows, error } = await supabaseAdmin
    .from("Reservation")
    .select("id, guestName, email, roomCode, startDate, endDate, externalRef, source, guestLang, createdAt")
    .eq("status", "CONFIRMED")
    .eq("caparoReceived", false)
    .in("source", SAFE_SOURCES)
    .lte("createdAt", cutoffIso);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const creds = getGmailCreds();
  const transporter = creds ? nodemailer.createTransport({
    service: "gmail",
    auth: { user: creds.user, pass: creds.pass },
  }) : null;

  const cancelled: string[] = [];
  const failures: Array<{ id: string; error: string }> = [];

  for (const r of rows || []) {
    try {
      // 1. Flip status in DB (single authoritative write).
      // Idempotency: WHERE status='CONFIRMED' makes a concurrent second
      // worker match 0 rows. We .select() the result and skip side-effects
      // when no row was actually flipped — without this, both workers send
      // a duplicate cancellation email + duplicate staff alert.
      const { data: claimed, error: updErr } = await supabaseAdmin
        .from("Reservation")
        .update({ status: "CANCELLED", cancelledAt: new Date().toISOString() })
        .eq("id", r.id)
        .eq("status", "CONFIRMED")
        .select("id");
      if (updErr) { failures.push({ id: r.id, error: updErr.message }); continue; }
      if (!claimed || claimed.length === 0) {
        // Another worker already cancelled this row in the gap between
        // our SELECT and UPDATE. Skip — they'll handle the side-effects.
        continue;
      }

      // 2. Push cancel to Beds24 (best-effort).
      if (r.externalRef) {
        try { await cancelBeds24Booking(r.externalRef); }
        catch (e: any) { console.error("[caparo/auto-cancel] beds24 push failed for", r.id, e?.message); }
      }

      // 3. Guest cancellation email (best-effort).
      if (r.email && transporter && creds) {
        try {
          const lang = (r.guestLang || "en") as GuestLang;
          await transporter.sendMail({
            from: `"Apartments Flora" <${creds.user}>`,
            to: r.email,
            subject: caparoCancelEmailSubject(r.guestName || "Guest", lang),
            html: caparoCancelEmailHtml(r.guestName || "Guest", lang),
          });
        } catch (e: any) { console.error("[caparo/auto-cancel] email failed for", r.id, e?.message); }
      }

      // 4. Staff alert (notification + push via existing notify layer).
      try {
        await notify({
          type: "ALERT",
          title: `🔴 Авто-анулирана · ${r.roomCode}`,
          detail: `${r.guestName} · ${String(r.startDate).slice(0,10)} — ${String(r.endDate).slice(0,10)} · без капаро 36+ часа`,
          reservationId: r.id,
        });
      } catch (e: any) { console.error("[caparo/auto-cancel] notify failed", e?.message); }

      cancelled.push(r.id);
    } catch (e: any) {
      failures.push({ id: r.id, error: e?.message || "unknown" });
    }
  }

  return NextResponse.json({
    ok: true,
    checked:   rows?.length || 0,
    cancelled: cancelled.length,
    failures:  failures.length,
    details:   failures.length ? failures : undefined,
  });
}
