import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Single client — RLS is disabled, auth handled by our own JWT middleware
export const supabase = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Alias for server-side usage (same client, kept for compatibility)
export const supabaseAdmin = supabase;
