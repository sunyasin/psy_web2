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

    // Декомпозиция цели доступна только после завершённого большого интервью.
    const { data: defaultInterview } = await supabase
      .from("interview")
      .select("id")
      .eq("code", "default")
      .eq("visible", true)
      .maybeSingle();

    let hasDefaultInterview = false;
    if (defaultInterview) {
      const { data: session } = await supabase
        .from("interview_sessions")
        .select("id")
        .eq("client_uuid", clientUuid)
        .eq("interview_id", defaultInterview.id)
        .eq("status", "completed")
        .limit(1)
        .maybeSingle();
      hasDefaultInterview = Boolean(session);
    }

    return NextResponse.json({ goal: { ...data, has_default_interview: hasDefaultInterview } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}