export const ROOM_COLORS: Record<string, string> = {
  "39.0.1": "bg-rose-50 border-rose-300",
  "1.3":    "bg-amber-50 border-amber-300",
  "1.3A":   "bg-yellow-50 border-yellow-300",
  "1.5":    "bg-green-50 border-green-300",
  "2.4.1":  "bg-emerald-50 border-emerald-300",
  "2.4.2":  "bg-teal-50 border-teal-300",
  "2.4.3":  "bg-cyan-50 border-cyan-300",
  "2.5":    "bg-sky-50 border-sky-300",
  "5.5":    "bg-blue-50 border-blue-300",
  "41.0.1": "bg-indigo-50 border-indigo-300",
  "41.0.2": "bg-violet-50 border-violet-300",
  "1.1":    "bg-purple-50 border-purple-300",
  "1.2":    "bg-fuchsia-50 border-fuchsia-300",
  "2.2":    "bg-pink-50 border-pink-300",
  "41-2":   "bg-rose-50 border-rose-200",
  "3.1":    "bg-orange-50 border-orange-300",
  "4.1":    "bg-lime-50 border-lime-300",
  "4.2":    "bg-green-50 border-green-200",
};

export function getRoomColor(code: string) {
  return ROOM_COLORS[code] || "bg-slate-50 border-slate-300";
}

import { supabaseAdmin } from "@/lib/supabase";

// Beds24 propertyId:roomId → internal room code
// Static fallback — prefer loadBeds24Map() which reads from the Room table.
export const BEDS24_MAP: Record<string, string> = {};

/** Build the "propertyId:roomId" → roomCode map from the Room table at runtime. */
export async function loadBeds24Map(): Promise<Record<string, string>> {
  try {
    const { data: rooms } = await supabaseAdmin
      .from("Room").select("code, beds24PropertyId, beds24RoomId");
    const map: Record<string, string> = {};
    for (const r of (rooms || [])) {
      if (r.beds24PropertyId && r.beds24RoomId) {
        map[`${r.beds24PropertyId}:${r.beds24RoomId}`] = r.code;
      }
    }
    return map;
  } catch {
    return {};
  }
}

// Booking hotelId:roomId → internal room code
export const BOOKING_MAP: Record<string, string> = {
  "2310023:231002306": "39.0.1",
  "2310023:231002302": "1.3",
  "2310023:231002308": "1.3A",
  "2310023:231002309": "1.5",
  "2310023:231002301": "2.4.1",
  "2310023:231002307": "2.4.2",
  "2310023:231002303": "2.4.3",
  "2310023:231002304": "2.5",
  "2310023:231002305": "5.5",
  "2248792:224879209": "41.0.1",
  "2248792:224879207": "41.0.2",
  "2248792:224879206": "1.1",
  "2248792:224879208": "1.2",
  "2248792:224879202": "2.2",
  "2248792:224879203": "41-2",
  "2248792:224879201": "3.1",
  "2248792:224879205": "4.1",
  "2248792:224879204": "4.2",
};
