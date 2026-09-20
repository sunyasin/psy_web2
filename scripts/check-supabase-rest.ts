import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

async function checkSupabaseConnection() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data, error } = await supabase.from("clients").select("*").limit(1);

    if (error) {
      console.error("Supabase query failed:", error);
      process.exit(1);
    }

    console.log("Supabase PostgREST connection works");
    console.log("Sample data:", data);
  } catch (err) {
    console.error("Connection failed:", err);
    process.exit(1);
  }
}

checkSupabaseConnection();
