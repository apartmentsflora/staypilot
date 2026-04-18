export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/voice-history — fetch transcripts for the last 30 days
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sort = url.searchParams.get("sort") || "created_at";
  const order = url.searchParams.get("order") || "desc";

  // Only allow safe sort columns
  const ALLOWED_SORTS = ["created_at", "guest_name", "check_in", "check_out"];
  const safeSort = ALLOWED_SORTS.includes(sort) ? sort : "created_at";
  const safeOrder = order === "asc" ? true : false;

  // Fetch last 30 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const { data, error } = await supabaseAdmin
    .from("voice_transcripts")
    .select("*")
    .gte("created_at", cutoff.toISOString())
    .order(safeSort, { ascending: safeOrder })
    .limit(200);

  if (error) {
    console.error("[voice-history] fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ transcripts: data || [] });
}

// POST /api/voice-history — save a new transcript
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { transcript, guest_name, room_code, check_in, check_out, phone, guests, children, notes, source } = body;

    if (!transcript) {
      return NextResponse.json({ error: "No transcript provided" }, { status: 400 });
    }

    // Clean up old records (> 30 days) while we're here
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    await supabaseAdmin
      .from("voice_transcripts")
      .delete()
      .lt("created_at", cutoff.toISOString());

    const { data, error } = await supabaseAdmin
      .from("voice_transcripts")
      .insert({
        transcript,
        guest_name: guest_name || null,
        room_code: room_code || null,
        check_in: check_in || null,
        check_out: check_out || null,
        phone: phone || null,
        guests: guests || null,
        children: children || null,
        notes: notes || null,
        source: source || null,
      })
      .select()
      .single();

    if (error) {
      console.error("[voice-history] insert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id });
  } catch (e: any) {
    console.error("[voice-history] error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
