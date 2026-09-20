import dotenv from "dotenv";
import { URL } from "url";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const { Client } = pg;

async function checkDbConnection() {
  let dbUrl = process.env.SUPABASE_DB_URL;

  if (!dbUrl || dbUrl.includes("[YOUR-PASSWORD]") || dbUrl.includes("[YOUR-PROJECT-ID]")) {
    console.error("SUPABASE_DB_URL contains placeholder values and is not valid.");
    console.error("Current value:", dbUrl);
    console.error("Please update .env.local with real Supabase credentials.");
    process.exit(1);
  }

  // Force IPv6 for Supabase db host because Windows Node.js DNS may fail on A records
  try {
    const parsed = new URL(dbUrl);
    const host = parsed.host;
    if (host && !host.includes('[')) {
      dbUrl = dbUrl.replace(parsed.host, `[${host}]`);
    }
  } catch (e) {
    console.error("Failed to parse SUPABASE_DB_URL", e);
    process.exit(1);
  }

  const client = new Client({ connectionString: dbUrl });

  try {
    await client.connect();
    console.log("Connected to PostgreSQL successfully");

    const res = await client.query("SELECT NOW() AS now, version() AS version");
    console.log("DB time:", res.rows[0].now);
    console.log("Postgres:", res.rows[0].version);

    await client.end();
    console.log("Connection closed");
  } catch (err) {
    console.error("Connection failed:", err);
    process.exit(1);
  }
}

checkDbConnection();
