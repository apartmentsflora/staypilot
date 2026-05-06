export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
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
  type TemplateData,
  type GuestLang,
} from "@/lib/email-templates";

/**
 * POST /api/messages/preview
 *
 * Returns { emailHtml, emailSubject, waText } without sending anything.
 * Used by the frontend to show a preview/edit modal before sending.
 */

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reservationId, type } = body;
  if (!reservationId || !type || !["welcome", "farewell", "caparo"].includes(type)) {
    return NextResponse.json({ error: "Missing reservationId or invalid type" }, { status: 400 });
  }

  const { data: res, error: resErr } = await supabaseAdmin
    .from("Reservation")
    .select("*, room:Room(code, label, entrance, capacity)")
    .eq("id", reservationId)
    .maybeSingle();

  if (resErr) return NextResponse.json({ error: resErr.message }, { status: 500 });
  if (!res) return NextResponse.json({ error: "Reservation not found" }, { status: 404 });

  const startDate = res.startDate?.slice(0, 10) || "";
  const endDate = res.endDate?.slice(0, 10) || "";
  const nights = Math.max(1, Math.round(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
  ));
  // v1.7.12 — Match Flora's occupancy-based pricing. pricePerNight is
  // the final per-night rate (kids inside cap free, +1 over-cap kid baked
  // in, cot already counted), so no extra surcharges needed.
  const total = `€${Math.round((Number(res.pricePerNight) || 0) * nights)}`;
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

  let emailHtml: string, emailSubject: string, waText: string;
  if (type === "farewell") {
    emailHtml = farewellEmailHtml(td);
    emailSubject = farewellEmailSubject(td.guestName, lang);
    waText = farewellWhatsAppText(td);
  } else if (type === "caparo") {
    // v1.4 — caparo reminder. Single-purpose deposit-only email.
    // No WhatsApp variant — staff can send the bank details via WhatsApp
    // freehand if they want.
    emailHtml = caparoReminderEmailHtml(td);
    emailSubject = caparoReminderEmailSubject(td.guestName, lang);
    waText = "";
  } else {
    emailHtml = welcomeEmailHtml(td);
    emailSubject = welcomeEmailSubject(td.guestName, lang);
    waText = welcomeWhatsAppText(td);
  }

  return NextResponse.json({ emailHtml, emailSubject, waText, phone: res.phone || "", email: res.email || "" });
}
