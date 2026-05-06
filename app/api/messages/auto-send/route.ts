export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "@/lib/supabase";
import {
  welcomeEmailHtml,
  welcomeEmailSubject,
  farewellEmailHtml,
  farewellEmailSubject,
  type TemplateData,
  type GuestLang,
} from "@/lib/email-templates";

// ═══════════════════════════════════════════════════════════════════════════
// Auto-send endpoint — called periodically (every 2 min alongside poll).
//
// Two jobs:
//   1. WELCOME emails: reservations created today that haven't received
//      a welcome email yet → send immediately.
//   2. FAREWELL emails: reservations checking out today, after 11:00 AM
//      local time (Europe/Sofia, UTC+2/+3), that haven't received a
//      farewell email → send automatically.
//
// Only processes CONFIRMED reservations with a valid email address.
// Rate limit: won't re-process if last run was < 60s ago.
// No auth required — only sends emails, never exposes data.
// ═══════════════════════════════════════════════════════════════════════════

const MIN_INTERVAL_MS = 60_000; // 60s between runs
const TIMEZONE = "Europe/Sofia";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function todayLocal(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TIMEZONE }); // YYYY-MM-DD
}

function currentHourLocal(): number {
  const h = new Date().toLocaleString("en-US", { timeZone: TIMEZONE, hour: "numeric", hour12: false });
  return parseInt(h, 10);
}

function buildTemplateData(res: any): TemplateData {
  const startDate = res.startDate?.slice(0, 10) || "";
  const endDate = res.endDate?.slice(0, 10) || "";
  const nights = Math.max(1, Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
  ));
  // v1.7.12 — Match Flora's occupancy-based pricing rule. The website
  // already bakes the room rate, sub-cap discount, +1 extra-kid surcharge,
  // and cot fee into `pricePerNight` at booking time — so emails should
  // NOT re-add child or cot surcharges (which would double-charge guests
  // on the displayed total). For OTA bookings, pricePerNight is what the
  // OTA charged; child/cot are not separately tracked there either.
  const total = `€${Math.round((Number(res.pricePerNight) || 0) * nights)}`;
  const lang = (res.guestLang || "en") as GuestLang;

  return {
    guestName: res.guestName || "Guest",
    roomCode: res.roomCode || "",
    checkin: fmtDate(res.startDate),
    checkout: fmtDate(res.endDate),
    nights,
    total,
    guests: Number(res.guests) || 1,
    children: Number(res.children) || 0,
    cots: Number(res.cots) || 0,
    arrivalTime: res.arrivalTime || "14:00",
    departTime: res.departTime || "11:00",
    notes: res.notes || "",
    lang,
    // v1.2 B8/B9: parking opt-in flows into the welcome email so it
    // renders "reserved" or "Green Zone fallback" accordingly.
    parking: res.parking === true,
  };
}

export async function GET() {
  // ── Rate limit ──
  try {
    const { data: last } = await supabaseAdmin
      .from("SyncEvent")
      .select("createdAt")
      .eq("provider", "email-auto")
      .eq("status", "PROCESSED")
      .order("createdAt", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last) {
      const elapsed = Date.now() - new Date(last.createdAt).getTime();
      if (elapsed < MIN_INTERVAL_MS) {
        return NextResponse.json({ ok: true, skipped: true, reason: "too soon" });
      }
    }
  } catch { /* proceed */ }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json({ ok: false, error: "Gmail not configured" }, { status: 500 });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  const today = todayLocal();
  const hour = currentHourLocal();
  let welcomeSent = 0, farewellSent = 0, errors = 0;

  // ── 1. Welcome emails: confirmed reservations starting today, not yet sent ──
  try {
    const dayStart = `${today}T00:00:00.000Z`;
    const dayEnd = `${today}T23:59:59.999Z`;

    const { data: welcomeList } = await supabaseAdmin
      .from("Reservation")
      .select("*, room:Room(code, label, entrance, capacity)")
      .eq("status", "CONFIRMED")
      .gte("createdAt", dayStart)
      .lte("createdAt", dayEnd)
      .is("welcomeSentAt", null)
      .not("email", "is", null)
      .neq("email", "");

    for (const res of (welcomeList || [])) {
      // ── ATOMIC CLAIM ──
      // Bug fix (Ivan reported "20 emails sent for 1 reservation"): the
      // SyncEvent rate limit only inserts at the END of this handler, so
      // concurrent calls (multiple browser tabs polling, webhook + cron
      // overlap, Netlify retry on a slow function) ALL pass the gate, all
      // see welcomeSentAt=null, and all send the welcome email before any
      // of them updates the row. Result: N concurrent runs = N duplicate
      // emails to the same guest.
      //
      // Atomic-claim pattern: use a conditional UPDATE that only succeeds
      // if welcomeSentAt is still null. Postgres serializes this — only
      // one concurrent run wins the row, the rest see 0 rows updated and
      // skip. If the email send subsequently fails, we release the claim
      // so a future run retries.
      const claimAt = new Date().toISOString();
      const { data: claimed, error: claimErr } = await supabaseAdmin
        .from("Reservation")
        .update({ welcomeSentAt: claimAt })
        .eq("id", res.id)
        .is("welcomeSentAt", null)
        .select("id")
        .maybeSingle();
      if (claimErr || !claimed) {
        // Either DB error or another concurrent run already claimed it.
        continue;
      }
      try {
        const td = buildTemplateData(res);
        const lang = (res.guestLang || "en") as GuestLang;
        await transporter.sendMail({
          from: `"Apartments Flora" <${gmailUser}>`,
          to: res.email,
          subject: welcomeEmailSubject(td.guestName, lang),
          html: welcomeEmailHtml(td),
        });
        welcomeSent++;
      } catch (e: any) {
        console.error(`[auto-send] welcome failed for ${res.id}:`, e.message);
        errors++;
        // Release the claim so the next run retries this reservation.
        // Guard with .eq(welcomeSentAt, claimAt) so we don't clobber a
        // value some other code-path may have written in the meantime.
        try {
          await supabaseAdmin
            .from("Reservation")
            .update({ welcomeSentAt: null })
            .eq("id", res.id)
            .eq("welcomeSentAt", claimAt);
        } catch { /* best-effort */ }
      }
    }
  } catch (e: any) {
    console.error("[auto-send] welcome query failed:", e.message);
  }

  // ── 2. Farewell emails: checkouts today, after 11:00 AM local, not yet sent ──
  if (hour >= 11) {
    try {
      // endDate stores the checkout day as ISO — match reservations ending today
      const dayStart = `${today}T00:00:00.000Z`;
      const dayEnd = `${today}T23:59:59.999Z`;

      const { data: farewellList } = await supabaseAdmin
        .from("Reservation")
        .select("*, room:Room(code, label, entrance, capacity)")
        .eq("status", "CONFIRMED")
        .gte("endDate", dayStart)
        .lte("endDate", dayEnd)
        .is("farewellSentAt", null)
        .not("email", "is", null)
        .neq("email", "");

      for (const res of (farewellList || [])) {
        // ATOMIC CLAIM — same race-fix as the welcome loop above.
        // Concurrent runs would otherwise all see farewellSentAt=null and
        // all dispatch the same farewell email before any of them updated
        // the row. Conditional UPDATE that only succeeds when the column
        // is still null serializes the claim across runs.
        const claimAt = new Date().toISOString();
        const { data: claimed, error: claimErr } = await supabaseAdmin
          .from("Reservation")
          .update({ farewellSentAt: claimAt })
          .eq("id", res.id)
          .is("farewellSentAt", null)
          .select("id")
          .maybeSingle();
        if (claimErr || !claimed) continue;
        try {
          const td = buildTemplateData(res);
          const lang = (res.guestLang || "en") as GuestLang;
          await transporter.sendMail({
            from: `"Apartments Flora" <${gmailUser}>`,
            to: res.email,
            subject: farewellEmailSubject(td.guestName, lang),
            html: farewellEmailHtml(td),
          });
          farewellSent++;
        } catch (e: any) {
          console.error(`[auto-send] farewell failed for ${res.id}:`, e.message);
          errors++;
          try {
            await supabaseAdmin
              .from("Reservation")
              .update({ farewellSentAt: null })
              .eq("id", res.id)
              .eq("farewellSentAt", claimAt);
          } catch { /* best-effort */ }
        }
      }
    } catch (e: any) {
      console.error("[auto-send] farewell query failed:", e.message);
    }
  }

  // Log
  try {
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "email-auto",
      direction: "OUTBOUND",
      status: "PROCESSED",
      payload: { welcomeSent, farewellSent, errors, today, hour },
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, welcomeSent, farewellSent, errors, today, hour });
}
