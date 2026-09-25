import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientUuid = searchParams.get("client_uuid");
    const interviewId = searchParams.get("interview_id");
    const interviewCode = searchParams.get("interview_code");

    if (!clientUuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    let resolvedInterviewId = interviewId;
    if (!resolvedInterviewId && interviewCode) {
      const { data: interview } = await supabase
        .from("interview")
        .select("id")
        .eq("code", interviewCode)
        .eq("visible", true)
        .single();
      if (interview) {
        resolvedInterviewId = interview.id;
      }
    }

    // Check completed
    let completedQuery = supabase
      .from("interview_sessions")
      .select("id")
      .eq("client_uuid", clientUuid)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1);

    if (resolvedInterviewId) {
      completedQuery = completedQuery.eq("interview_id", resolvedInterviewId);
    }

    const { data: completedSession, error: completedError } = await completedQuery.maybeSingle();

    // Check in_progress
    let inProgressQuery = supabase
      .from("interview_sessions")
      .select("id")
      .eq("client_uuid", clientUuid)
      .eq("status", "in_progress")
      .order("created_at", { ascending: false })
      .limit(1);

    if (resolvedInterviewId) {
      inProgressQuery = inProgressQuery.eq("interview_id", resolvedInterviewId);
    }

    const { data: inProgressSession, error: inProgressError } = await inProgressQuery.maybeSingle();

    if (completedError || inProgressError) {
      return NextResponse.json({ error: completedError?.message || inProgressError?.message }, { status: 500 });
    }

    return NextResponse.json({ 
      completed: !!completedSession,
      in_progress: !!inProgressSession 
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
