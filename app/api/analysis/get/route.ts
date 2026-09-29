import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientUuid = searchParams.get("client_uuid");
    const id = searchParams.get("id");

    if (!clientUuid || !id) {
      return NextResponse.json({ error: "client_uuid and id are required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const { data: analysis, error } = await supabase
      .from("interview_analyses")
      .select("*")
      .eq("client_uuid", clientUuid)
      .eq("id", id)
      .single();

    if (error || !analysis) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }

    return NextResponse.json({ analysis });
  } catch (err) {
    console.error("[api/analysis/get] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}