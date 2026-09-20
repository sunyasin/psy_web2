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

    const { data: session, error } = await supabase
      .from("interview_sessions")
      .select("id")
      .eq("client_uuid", clientUuid)
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ completed: !!session });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
