export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { fetchBeds24Bookings } from "@/lib/beds24";
import { loadBeds24Map } from "@/lib/rooms";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/integrations/beds24/debug
 *
 * Returns raw diagnostic info:
 * - How many bookings Beds24 API returns per property
 * - All booking IDs, dates, statuses, names
 * - Room mapping coverage
 * - Comparison with our Reservation table
 */
export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

  const bookings = await fetchBeds24Bookings(today, future);
  if (!bookings) {
    return NextResponse.json({ error: "Beds24 API fetch failed — check token" }, { status: 502 });
  }

  const dynamicMap = await loadBeds24Map();

  // Summarize each booking from the API
  const apiSummary = bookings.map((b: any) => {
    const key = `${b.propertyId}:${b.roomId}`;
    return {
      id: b.id,
      propertyId: b.propertyId,
      roomId: b.roomId,
      mappedTo: dynamicMap[key] || "UNMAPPED",
      arrival: b.arrival,
      departure: b.departure,
      status: b.status,
      firstName: b.firstName,
      lastName: b.lastName,
      numAdult: b.numAdult,
      channel: b.channel || null,
      referer: b.referer || null,
      apiSource: b.apiSource || null,
    };
  });

  // Get all our reservations for comparison
  const { data: ourReservations } = await supabaseAdmin
    .from("Reservation")
    .select("externalRef, guestName, roomCode, startDate, endDate, status, source")
    .gte("endDate", today)
    .order("startDate");

  // Find reservations in our DB that are NOT in the API response
  const apiIds = new Set(bookings.map((b: any) => `beds24-${b.id}`));
  const missingFromApi = (ourReservations || []).filter(
    (r: any) => r.externalRef?.startsWith("beds24-") && !apiIds.has(r.externalRef)
  );

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    dateRange: { from: today, to: future },
    roomMap: dynamicMap,
    apiBookingsCount: bookings.length,
    apiBookings: apiSummary,
    ourReservationsCount: (ourReservations || []).length,
    missingFromApi: missingFromApi.map((r: any) => ({
      externalRef: r.externalRef,
      guestName: r.guestName,
      roomCode: r.roomCode,
      dates: `${r.startDate?.slice(0, 10)} – ${r.endDate?.slice(0, 10)}`,
      status: r.status,
      source: r.source,
    })),
  });
}
