export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

// POST — save a push subscription
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription object" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("PushSubscription").upsert(
    {
      endpoint: body.endpoint,
      keys: body.keys,
      label: body.label || "",
    },
    { onConflict: "endpoint" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — remove a push subscription.
// "Toggle OFF" must silence pushes on EVERY device, not just the one
// hitting this endpoint. Otherwise a stale subscription from an old
// browser session keeps firing after the user thinks pushes are off.
// Body: { endpoint?: string, all?: boolean }
//   - { all: true }   → wipe every subscription (default for toggle-off)
//   - { endpoint: x } → remove just that one (legacy single-device path)
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  // Default: nuke every subscription. Caller can pass { all: false, endpoint: "..." }
  // to opt back into the old single-device behaviour if ever needed.
  const wantsAll = body?.all !== false;

  let q = supabaseAdmin.from("PushSubscription").delete();
  if (wantsAll) {
    q = q.not("endpoint", "is", null);
  } else {
    if (!body?.endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    q = q.eq("endpoint", body.endpoint);
  }

  const { error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, scope: wantsAll ? "all" : "single" });
}
