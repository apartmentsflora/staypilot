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
  if (!reservationId || !type || !["welcome", "farewell"].includes(type)) {
    return NextResponse.json({ error: "Missing reservationId or invalid type (welcome|farewell)" }, { status: 400 });
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

      const subject = customSubject || (type === "farewell"
        ? farewellEmailSubject(td.guestName, lang)
        : welcomeEmailSubject(td.guestName, lang));

      const html = customHtml || (type === "farewell"
        ? farewellEmailHtml(td)
        : welcomeEmailHtml(td));

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
    }
  }

  // ── WhatsApp link ─────────────────────────────────────────────────────────
  let waLink: string | null = null;
  if (res.phone) {
    const waText = customWaText || (type === "farewell"
      ? farewellWhatsAppText(td)
      : welcomeWhatsAppText(td));
    waLink = whatsappLink(res.phone, waText);
  }

  // ── Update sent timestamp ─────────────────────────────────────────────────
  const tsColumn = type === "welcome" ? "welcomeSentAt" : "farewellSentAt";
  if (emailSent || waLink) {
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
