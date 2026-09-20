import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const clientUuid = searchParams.get("client_uuid");

    if (!id || !clientUuid) {
      return NextResponse.json({ error: "id and client_uuid are required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .eq("id", id)
      .eq("client_uuid", clientUuid)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    return NextResponse.json({ goal: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}