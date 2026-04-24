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
  const childSurcharge = (Number(res.children) || 0) * 12.5;
  const cotSurcharge = (Number(res.cots) || 0) * 25;
  const total = `€${Math.round(((Number(res.pricePerNight) || 0) + childSurcharge + cotSurcharge) * nights)}`;
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
      try {
        const td = buildTemplateData(res);
        const lang = (res.guestLang || "en") as GuestLang;
        await transporter.sendMail({
          from: `"Apartments Flora" <${gmailUser}>`,
          to: res.email,
          subject: welcomeEmailSubject(td.guestName, lang),
          html: welcomeEmailHtml(td),
        });
        await supabaseAdmin
          .from("Reservation")
          .update({ welcomeSentAt: new Date().toISOString() })
          .eq("id", res.id);
        welcomeSent++;
      } catch (e: any) {
        console.error(`[auto-send] welcome failed for ${res.id}:`, e.message);
        errors++;
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
        try {
          const td = buildTemplateData(res);
          const lang = (res.guestLang || "en") as GuestLang;
          await transporter.sendMail({
            from: `"Apartments Flora" <${gmailUser}>`,
            to: res.email,
            subject: farewellEmailSubject(td.guestName, lang),
            html: farewellEmailHtml(td),
          });
          await supabaseAdmin
            .from("Reservation")
            .update({ farewellSentAt: new Date().toISOString() })
            .eq("id", res.id);
          farewellSent++;
        } catch (e: any) {
          console.error(`[auto-send] farewell failed for ${res.id}:`, e.message);
          errors++;
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
