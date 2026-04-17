export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

const BEDS24_BASE = "https://beds24.com/api/v2";

// Fetches rooms from Beds24 for both properties and attempts to match
// them to existing local Room rows by name similarity. If a match is
// found the Room row is updated with the correct beds24PropertyId and
// beds24RoomId so that import/webhook can map bookings.
//
// POST /api/integrations/beds24/rooms   — auto-match + save
// GET  /api/integrations/beds24/rooms   — preview only (no DB writes)

async function getToken(): Promise<string | null> {
  const { data: cred } = await supabaseAdmin
    .from("IntegrationCredential").select("values").eq("provider", "beds24").maybeSingle();
  const values = cred?.values as any;
  if (!values) return null;

  const refresh = values.refreshToken || values.apiKey;
  let token = values.accessToken;

  if (token && values.accessTokenExpiresAt) {
    const exp = new Date(values.accessTokenExpiresAt).getTime();
    if (exp - Date.now() < 5 * 60_000) token = null;
  }

  if (!token) {
    const r = await fetch(`${BEDS24_BASE}/authentication/token`, {
      method: "GET",
      headers: { refreshToken: refresh, accept: "application/json" },
    });
    if (!r.ok) return null;
    const body = await r.json().catch(() => null);
    token = body?.token;
  }
  return token || null;
}

type Beds24Room = { id: number; name: string; qty: number; propertyId: number };

async function fetchAllRooms(token: string): Promise<Beds24Room[]> {
  // First get properties
  const propRes = await fetch(`${BEDS24_BASE}/properties`, {
    method: "GET",
    headers: { token, accept: "application/json" },
  });
  const propBody = await propRes.json().catch(() => null);
  const properties = Array.isArray(propBody?.data) ? propBody.data : [];

  const allRooms: Beds24Room[] = [];
  for (const prop of properties) {
    const r = await fetch(`${BEDS24_BASE}/rooms?propertyId=${prop.id}`, {
      method: "GET",
      headers: { token, accept: "application/json" },
    });
    const body = await r.json().catch(() => null);
    const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
    for (const rm of list) {
      allRooms.push({ id: rm.id, name: rm.name || "", qty: rm.qty || 1, propertyId: prop.id });
    }
  }
  return allRooms;
}

// Normalize a string for fuzzy matching: lowercase, strip spaces/punctuation
function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9а-яёіїє]/gi, "").trim();
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getToken();
  if (!token) return NextResponse.json({ error: "No Beds24 token" }, { status: 502 });

  const beds24Rooms = await fetchAllRooms(token);

  // Load local rooms
  const { data: localRooms } = await supabaseAdmin
    .from("Room").select("id, code, label, entrance, beds24PropertyId, beds24RoomId")
    .order("code");

  // Property entrance mapping: 322955 → "41", 322959 → "39"
  const propEntrance: Record<number, string> = {};
  for (const br of beds24Rooms) {
    // Try to determine entrance from property name or existing mapping
    if (!propEntrance[br.propertyId]) {
      // Check local rooms that were already assigned to this property
      const existing = (localRooms || []).find(lr => lr.beds24PropertyId === br.propertyId);
      if (existing) propEntrance[br.propertyId] = existing.entrance;
    }
  }

  // Attempt auto-matching: beds24 room name → local room (code or label)
  const matches: Array<{
    beds24Room: Beds24Room;
    localRoom: { id: string; code: string; label: string; entrance: string } | null;
    matchType: string;
  }> = [];

  for (const br of beds24Rooms) {
    const brNorm = norm(br.name);
    let best: any = null;
    let matchType = "none";

    for (const lr of (localRooms || [])) {
      // Exact code match
      if (norm(lr.code) === brNorm || lr.code === br.name) {
        best = lr; matchType = "exact_code"; break;
      }
      // Exact label match
      if (norm(lr.label) === brNorm) {
        best = lr; matchType = "exact_label"; break;
      }
      // Code contained in name or vice-versa
      if (brNorm.includes(norm(lr.code)) || norm(lr.code).includes(brNorm)) {
        if (!best) { best = lr; matchType = "partial_code"; }
      }
      // Label contained in name
      if (brNorm.includes(norm(lr.label)) || norm(lr.label).includes(brNorm)) {
        if (!best || matchType === "none") { best = lr; matchType = "partial_label"; }
      }
    }
    matches.push({ beds24Room: br, localRoom: best ? { id: best.id, code: best.code, label: best.label, entrance: best.entrance } : null, matchType });
  }

  return NextResponse.json({
    ok: true,
    beds24Rooms,
    localRooms: (localRooms || []).map(r => ({ code: r.code, label: r.label, entrance: r.entrance, currentBeds24: `${r.beds24PropertyId}:${r.beds24RoomId}` })),
    matches,
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const token = await getToken();
  if (!token) return NextResponse.json({ error: "No Beds24 token" }, { status: 502 });

  const beds24Rooms = await fetchAllRooms(token);

  // Accept optional manual overrides: { "beds24RoomId": "localRoomCode", ... }
  let overrides: Record<string, string> = {};
  try {
    const body = await req.json();
    overrides = body.overrides || {};
  } catch { /* no body is fine — use auto-matching */ }

  const { data: localRooms } = await supabaseAdmin
    .from("Room").select("id, code, label, entrance, beds24PropertyId, beds24RoomId")
    .order("code");

  let matched = 0, failed = 0;
  const results: Array<{ beds24: string; local: string | null; status: string }> = [];

  for (const br of beds24Rooms) {
    // Check manual override first
    const manualCode = overrides[String(br.id)];
    let targetRoom: any = null;

    if (manualCode) {
      targetRoom = (localRooms || []).find(lr => lr.code === manualCode);
    } else {
      // Auto-match by name
      const brNorm = norm(br.name);
      for (const lr of (localRooms || [])) {
        if (norm(lr.code) === brNorm || lr.code === br.name) { targetRoom = lr; break; }
        if (norm(lr.label) === brNorm) { targetRoom = lr; break; }
      }
    }

    if (targetRoom) {
      await supabaseAdmin.from("Room").update({
        beds24PropertyId: br.propertyId,
        beds24RoomId: br.id,
      }).eq("id", targetRoom.id);
      matched++;
      results.push({ beds24: `${br.propertyId}:${br.id} (${br.name})`, local: targetRoom.code, status: "updated" });
    } else {
      failed++;
      results.push({ beds24: `${br.propertyId}:${br.id} (${br.name})`, local: null, status: "no_match" });
    }
  }

  return NextResponse.json({ ok: true, matched, failed, results });
}
