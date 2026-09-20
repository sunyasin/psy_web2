import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("interview")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message || "Failed to load interviews" }, { status: 500 });
    }

    return NextResponse.json({ interviews: data || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
