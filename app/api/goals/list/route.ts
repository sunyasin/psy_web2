import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientUuid = searchParams.get("client_uuid");

    if (!clientUuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from("goals")
      .select("id, client_uuid, title, status, conflict_analysis, smart_json, source_analysis_id, created_at")
      .eq("client_uuid", clientUuid)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[goals/list] Supabase error:", error);
      return NextResponse.json({ error: error.message || "Failed to load goals", details: error }, { status: 500 });
    }

    return NextResponse.json({ goals: data || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
