import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: false
    }
  }
);

// Service role key is invalid/revoked — using anon key for all server queries.
// For production, replace with a valid service_role key or implement proper auth.
export const supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  return supabase;
}
