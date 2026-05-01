export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import {
  welcomeEmailHtml,
  welcomeEmailSubject,
  farewellEmailHtml,
  farewellEmailSubject,
  welcomeWhatsAppText,
  farewellWhatsAppText,
  caparoReminderEmailHtml,
  caparoReminderEmailSubject,
  whatsappLink,
  type TemplateData,
  type GuestLang,
} from "@/lib/email-templates";

/**
 * POST /api/messages/send
 *
 * Body: { reservationId: string, type: "welcome" | "farewell" }
 *
 * 1. Sends email via Gmail SMTP (nodemailer).
 * 2. Returns a wa.me click-to-chat link for WhatsApp (manual send by staff).
 * 3. Updates Reservation.welcomeSentAt or farewellSentAt.
 *
 * Env vars: GMAIL_USER, GMAIL_APP_PASSWORD
 */

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reservationId, type, customWaText, customHtml, customSubject } = body;
  if (!reservationId || !type || !["welcome", "farewell", "caparo"].includes(type)) {
    return NextResponse.json({ error: "Missing reservationId or invalid type (welcome|farewell|caparo)" }, { status: 400 });
  }

  // Fetch reservation + room info
  const { data: res, error: resErr } = await supabaseAdmin
    .from("Reservation")
    .select("*, room:Room(code, label, entrance, capacity)")
    .eq("id", reservationId)
    .maybeSingle();

  if (resErr) return NextResponse.json({ error: resErr.message }, { status: 500 });
  if (!res) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

  // Build template data
  const startDate = res.startDate?.slice(0, 10) || "";
  const endDate = res.endDate?.slice(0, 10) || "";
  const nights = Math.max(1, Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
  ));
  const childSurcharge = (Number(res.children) || 0) * 12.5;
  const cotSurcharge = (Number(res.cots) || 0) * 25;
  const total = `€${Math.round(((Number(res.pricePerNight) || 0) + childSurcharge + cotSurcharge) * nights)}`;

  const lang = (res.guestLang || "en") as GuestLang;

  const td: TemplateData = {
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
  };

  // ── Send email ────────────────────────────────────────────────────────────
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  let emailSent = false;
  let emailError: string | null = null;

  // For caparo: claim the timestamp BEFORE sending. If two operators (or
  // a cron run + an operator) try to send simultaneously, only one wins
  // the conditional UPDATE (caparoReminderSentAt was NULL → set to now).
  // The losers get emailError="reminder already sent" and no email fires.
  // If the send subsequently fails, we release the claim so retry works.
  let caparoClaimAt: string | null = null;
  if (type === "caparo") {
    caparoClaimAt = new Date().toISOString();
    const { data: claimed } = await supabaseAdmin
      .from("Reservation")
      .update({ caparoReminderSentAt: caparoClaimAt })
      .eq("id", reservationId)
      .is("caparoReminderSentAt", null)
      .select("id");
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({
        emailSent: false,
        emailError: "Capaparo reminder already sent for this reservation",
        waLink: null,
        type,
        guestName: td.guestName,
      });
    }
  }

  if (!res.email) {
    emailError = "No email address on this reservation";
  } else if (!gmailUser || !gmailPass) {
    emailError = "Gmail SMTP not configured (GMAIL_USER / GMAIL_APP_PASSWORD env vars missing)";
  } else {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: gmailUser, pass: gmailPass },
      });

      const _defaultSubject = type === "farewell"
        ? farewellEmailSubject(td.guestName, lang)
        : type === "caparo"
          ? caparoReminderEmailSubject(td.guestName, lang)
          : welcomeEmailSubject(td.guestName, lang);
      const _defaultHtml = type === "farewell"
        ? farewellEmailHtml(td)
        : type === "caparo"
          ? caparoReminderEmailHtml(td)
          : welcomeEmailHtml(td);
      const subject = customSubject || _defaultSubject;
      const html = customHtml || _defaultHtml;

      await transporter.sendMail({
        from: `"Apartments Flora" <${gmailUser}>`,
        to: res.email,
        subject,
        html,
      });

      emailSent = true;
    } catch (e: any) {
      console.error("[messages/send] email error:", e.message);
      emailError = e.message || "Email send failed";
      // If we claimed caparoReminderSentAt above and the send failed,
      // release the claim so the operator can retry.
      if (type === "caparo" && caparoClaimAt) {
        try {
          await supabaseAdmin
            .from("Reservation")
            .update({ caparoReminderSentAt: null })
            .eq("id", reservationId)
            .eq("caparoReminderSentAt", caparoClaimAt);
        } catch { /* best-effort */ }
      }
    }
  }

  // ── WhatsApp link ─────────────────────────────────────────────────────────
  // Caparo has no WA template — staff can send freehand if they want.
  let waLink: string | null = null;
  if (res.phone && type !== "caparo") {
    const waText = customWaText || (type === "farewell"
      ? farewellWhatsAppText(td)
      : welcomeWhatsAppText(td));
    waLink = whatsappLink(res.phone, waText);
  }

  // ── Update sent timestamp ─────────────────────────────────────────────────
  // welcome/farewell write here; caparo already claimed its timestamp at the
  // top of the handler so we skip — re-writing would needlessly bump the value.
  const tsColumn = type === "welcome" ? "welcomeSentAt"
                 : type === "farewell" ? "farewellSentAt"
                 : null;
  if (tsColumn && (emailSent || waLink)) {
    await supabaseAdmin
      .from("Reservation")
      .update({ [tsColumn]: new Date().toISOString() })
      .eq("id", reservationId);
  }

  return NextResponse.json({
    emailSent,
    emailError,
    waLink,
    type,
    guestName: td.guestName,
  });
}
