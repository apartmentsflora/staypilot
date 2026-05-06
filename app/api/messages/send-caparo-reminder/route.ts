export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import {
  caparoReminderEmailHtml,
  caparoReminderEmailSubject,
  type TemplateData,
  type GuestLang,
} from "@/lib/email-templates";

/**
 * v1.4 — Manual caparo reminder.
 *
 * Sends a single-purpose "your deposit is overdue, here are the bank
 * details" email to the guest of one specific reservation. Triggered by
 * the operator from the calendar reservation modal.
 *
 * Modes:
 *   GET  ?reservationId=xxx&preview=1   → returns the rendered HTML for
 *                                         in-browser preview (does NOT send)
 *   POST { reservationId }              → actually sends the email and
 *                                         stamps caparoReminderSentAt
 *
 * Auth: admin session OR Bearer ${CRON_SECRET} (kept consistent with
 * the auto-cancel + check-reminders routes).
 */

function buildTemplateData(res: any): TemplateData {
  const startDate = res.startDate?.slice(0, 10) || "";
  const endDate = res.endDate?.slice(0, 10) || "";
  const nights = Math.max(1, Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
  ));
  // v1.7.12 — pricePerNight already includes occupancy/cot/extra-kid baked
  // by Flora at booking time; do not re-add the surcharges here.
  const total = `€${Math.round((Number(res.pricePerNight) || 0) * nights)}`;
  const lang = (res.guestLang || "en") as GuestLang;
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
  };
  return {
    guestName: res.guestName || "Guest",
    roomCode: res.roomCode || "",
    checkin: fmt(res.startDate),
    checkout: fmt(res.endDate),
    nights,
    total,
    guests: Number(res.guests) || 1,
    children: Number(res.children) || 0,
    cots: Number(res.cots) || 0,
    arrivalTime: res.arrivalTime || "14:00",
    departTime: res.departTime || "11:00",
    notes: res.notes || "",
    lang,
    parking: res.parking === true,
  };
}

function authorize(req: Request, session: any): boolean {
  if (session) return true;
  const cronSecret = process.env.CRON_SECRET || "";
  const authHeader = req.headers.get("authorization") || "";
  return !!cronSecret && authHeader === `Bearer ${cronSecret}`;
}

async function loadReservation(id: string) {
  const { data, error } = await supabaseAdmin
    .from("Reservation")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

// ─── GET — preview mode ─────────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await getSession();
  if (!authorize(req, session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const id = url.searchParams.get("reservationId");
  const preview = url.searchParams.get("preview") === "1";
  const langOverride = url.searchParams.get("lang") as GuestLang | null;
  if (!id) return NextResponse.json({ error: "Missing reservationId" }, { status: 400 });

  const res = await loadReservation(id);
  if (!res) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

  const data = buildTemplateData(res);
  if (langOverride) data.lang = langOverride;
  const html = caparoReminderEmailHtml(data);
  const subject = caparoReminderEmailSubject(data.guestName, data.lang);

  if (preview) {
    // Return raw HTML so it can be loaded in an iframe / new tab for inspection.
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return NextResponse.json({ ok: true, subject, html, lang: data.lang });
}

// ─── POST — actually send ───────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await getSession();
  if (!authorize(req, session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* no body */ }
  const id = body?.reservationId;
  if (!id) return NextResponse.json({ error: "Missing reservationId" }, { status: 400 });

  const res = await loadReservation(id);
  if (!res) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  if (!res.email || !/.+@.+\..+/.test(res.email)) {
    return NextResponse.json({ error: "Reservation has no valid email" }, { status: 400 });
  }
  if (res.caparoReceived === true) {
    return NextResponse.json({ ok: false, skipped: true, reason: "caparo already received" });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json({ error: "Gmail not configured" }, { status: 500 });
  }

  // Claim the reminder slot before sending. Conditional UPDATE: only flips
  // caparoReminderSentAt if it's currently NULL. If two operators click
  // "Send" simultaneously, one wins the claim and one gets ok:false/skipped.
  // Trade-off: if Gmail send subsequently fails, we clear the timestamp
  // below so the operator can retry.
  const claimAt = new Date().toISOString();
  const { data: claimed } = await supabaseAdmin
    .from("Reservation")
    .update({ caparoReminderSentAt: claimAt })
    .eq("id", id)
    .is("caparoReminderSentAt", null)
    .select("id");
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: "reminder already sent (or claimed by another sender)",
    });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  const data = buildTemplateData(res);
  const html = caparoReminderEmailHtml(data);
  const subject = caparoReminderEmailSubject(data.guestName, data.lang);

  try {
    await transporter.sendMail({
      from: `"Apartments Flora" <${gmailUser}>`,
      to: res.email,
      subject,
      html,
    });
  } catch (e: any) {
    console.error("[send-caparo-reminder] gmail error:", e?.message || e);
    // Send failed — release the claim so the operator can retry.
    try {
      await supabaseAdmin
        .from("Reservation")
        .update({ caparoReminderSentAt: null })
        .eq("id", id)
        .eq("caparoReminderSentAt", claimAt);
    } catch { /* swallow — best effort */ }
    return NextResponse.json({ error: e?.message || "Send failed" }, { status: 502 });
  }

  // Log to SyncEvent for audit trail
  try {
    await supabaseAdmin.from("SyncEvent").insert({
      provider: "email-auto",
      direction: "OUTBOUND",
      status: "PROCESSED",
      payload: { kind: "caparo-reminder-manual", reservationId: id, to: res.email, lang: data.lang },
    });
  } catch { /* non-fatal */ }

  return NextResponse.json({ ok: true, sent: true, to: res.email, subject });
}
