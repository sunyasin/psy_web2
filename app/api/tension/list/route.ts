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
      .from("tension_flags")
      .select("id, description, evidence, status")
      .eq("client_uuid", clientUuid)
      .eq("status", "detected")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message || "Failed to fetch tensions" }, { status: 500 });
    }

    return NextResponse.json({ tensions: data || [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
