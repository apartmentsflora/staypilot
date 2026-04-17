export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

const BEDS24_BASE = "https://beds24.com/api/v2";

// Authenticated diagnostic endpoint. Fetches properties + bookings from
// Beds24 and returns raw responses for debugging.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Load credential
  const { data: cred } = await supabaseAdmin
    .from("IntegrationCredential").select("values").eq("provider", "beds24").maybeSingle();
  const values = cred?.values as any;
  if (!values) return NextResponse.json({ ok: false, error: "no credential" });

  // Get access token
  const refresh = values.refreshToken || values.apiKey;
  let token = values.accessToken;

  // Check if cached token is still valid
  if (token && values.accessTokenExpiresAt) {
    const exp = new Date(values.accessTokenExpiresAt).getTime();
    if (exp - Date.now() < 5 * 60_000) token = null;
  }

  // Exchange if needed
  if (!token) {
    try {
      const r = await fetch(`${BEDS24_BASE}/authentication/token`, {
        method: "GET",
        headers: { refreshToken: refresh, accept: "application/json" },
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) return NextResponse.json({ ok: false, error: "token exchange failed", status: r.status, body });
      token = body?.token;
      if (!token) return NextResponse.json({ ok: false, error: "no token in response", body });
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: "token exchange error", detail: e?.message });
    }
  }

  // 1. Fetch properties to see what this account has access to
  let properties: any = null;
  try {
    const r = await fetch(`${BEDS24_BASE}/properties`, {
      method: "GET",
      headers: { token, accept: "application/json" },
    });
    properties = await r.json().catch(() => r.text());
  } catch (e: any) {
    properties = { error: e?.message };
  }

  // 2. Fetch rooms for each property
  let rooms: any = {};
  const propIds = Array.isArray(properties?.data)
    ? properties.data.map((p: any) => p.id)
    : [];
  for (const pid of propIds) {
    try {
      const r = await fetch(`${BEDS24_BASE}/rooms?propertyId=${pid}`, {
        method: "GET",
        headers: { token, accept: "application/json" },
      });
      const body = await r.json().catch(() => null);
      const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
      rooms[pid] = list.map((rm: any) => ({ id: rm.id, name: rm.name, qty: rm.qty }));
    } catch (e: any) {
      rooms[pid] = { error: e?.message };
    }
  }

  // 3. Try fetching bookings without any property filter
  let bookingsAll: any = null;
  try {
    const r = await fetch(`${BEDS24_BASE}/bookings?departureFrom=2026-04-01&arrivalTo=2026-12-31&includeGuests=true`, {
      method: "GET",
      headers: { token, accept: "application/json" },
    });
    bookingsAll = await r.json().catch(() => r.text());
  } catch (e: any) {
    bookingsAll = { error: e?.message };
  }

  // 3. Try fetching bookings for each hardcoded property
  const bookingsByProp: Record<string, any> = {};
  for (const pid of [320505, 320506]) {
    try {
      const r = await fetch(`${BEDS24_BASE}/bookings?propertyId=${pid}&departureFrom=2026-04-01&arrivalTo=2026-12-31`, {
        method: "GET",
        headers: { token, accept: "application/json" },
      });
      bookingsByProp[pid] = await r.json().catch(() => r.text());
    } catch (e: any) {
      bookingsByProp[pid] = { error: e?.message };
    }
  }

  return NextResponse.json({
    ok: true,
    tokenPresent: !!token,
    properties: Array.isArray(properties?.data) ? properties.data.map((p: any) => ({ id: p.id, name: p.name, address: p.address })) : properties,
    rooms,
    bookingsAll: Array.isArray(bookingsAll?.data) ? { count: bookingsAll.data.length, sample: bookingsAll.data.slice(0, 2) } : Array.isArray(bookingsAll) ? { count: bookingsAll.length, sample: bookingsAll.slice(0, 2) } : bookingsAll,
    bookingsByProperty: bookingsByProp,
  });
}
