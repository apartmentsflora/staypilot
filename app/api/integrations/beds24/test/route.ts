import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { beds24Ping } from "@/lib/beds24";

// Authenticated helper: attempts a Beds24 token exchange and reports
// whether outbound sync is currently operational. Used by the Settings
// UI to show a live "● Конфигуриран" / "● Грешка" status.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const res = await beds24Ping();
  return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}
