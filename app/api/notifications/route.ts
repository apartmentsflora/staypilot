import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin
    .from("Notification")
    .select("*")
    .order("createdAt", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Delete every row. `gte createdAt '1970-01-01'` matches all rows reliably,
  // unlike `.neq("id", "")` which can fail on non-text primary keys.
  const { error } = await supabaseAdmin
    .from("Notification")
    .delete()
    .gte("createdAt", "1970-01-01T00:00:00Z");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
