import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServerClient();

    const { data: tiers, error } = await supabase
      .from("subscription_tiers")
      .select("id, name, description, price, currency, is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[subscriptions/tiers] Supabase error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to load tiers" },
        { status: 500 }
      );
    }

    return NextResponse.json({ tiers: tiers || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
