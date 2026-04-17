import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * StayPilot Supabase clients.
 *
 * - RLS is ENABLED on every app table. The anon key has no policies
 *   and therefore cannot read or write anything.
 * - All server-side code uses `supabaseAdmin`, which is authenticated
 *   with the service_role key and bypasses RLS. This key MUST stay
 *   on the server only.
 * - The anon client (`supabase`) is browser-safe but is intentionally
 *   useless without a session cookie, since every API route verifies
 *   the JWT in `sp_session` before touching the DB.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL");
if (!anonKey) throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY");

// Browser-safe client.
export const supabase: SupabaseClient = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Server-only client. Throws at first use if the service_role key is missing,
// so we fail loudly in production rather than silently falling back to anon.
function makeAdmin(): SupabaseClient {
  if (!serviceRoleKey) {
    throw new Error(
      "Missing env var: SUPABASE_SERVICE_ROLE_KEY. " +
        "Set it in Netlify → Site settings → Environment variables. " +
        "Find the key in Supabase Dashboard → Settings → API → service_role."
    );
  }
  return createClient(url!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { "x-staypilot-server": "1" } },
  });
}

// Lazy proxy so the service key is only required when admin is actually used,
// and the admin client is constructed once per server runtime.
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const g = globalThis as any;
    const client: SupabaseClient = g.__spAdmin ?? (g.__spAdmin = makeAdmin());
    const value = (client as any)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
