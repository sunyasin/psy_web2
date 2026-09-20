import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientUuid = searchParams.get("client_uuid");
    const interviewId = searchParams.get("interview_id");

    if (!clientUuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    console.log("[api/results] Fetching analyses for client_uuid:", clientUuid);

    const { data: analyses, error: analysesError } = await supabase
      .from("interview_analyses")
      .select("*")
      .eq("client_uuid", clientUuid)
      .order("created_at", { ascending: false });

    console.log("[api/results] Analyses result:", { count: analyses?.length, error: analysesError?.message });

    if (analysesError) {
      console.error("[api/results] Supabase error:", analysesError);
      return NextResponse.json(
        { error: analysesError.message || "Failed to load analyses" },
        { status: 500 }
      );
    }

    if (!analyses || analyses.length === 0) {
      console.log("[api/results] No analyses found for client_uuid:", clientUuid);
      return NextResponse.json({ results: [] });
    }

    // Try to get session info for interview names
    const sessionIds = [...new Set(analyses.map((a) => a.interview_session_id))];
    let sessionMap = new Map();
    let sessionsError = null;

    try {
      const { data: sessions, error: sessError } = await supabase
        .from("interview_sessions")
        .select("id, interview_id, status, created_at")
        .in("id", sessionIds);

      sessionsError = sessError;
      if (sessError) {
        console.warn("[api/results] Failed to load sessions (column may not exist):", sessError.message);
      } else {
        sessionMap = new Map((sessions || []).map((s) => [s.id, s]));
      }
    } catch (e) {
      console.warn("[api/results] Sessions query failed:", e);
    }

    let filteredAnalyses = analyses;
    if (interviewId && sessionMap.size > 0) {
      filteredAnalyses = analyses.filter((a) => {
        const session = sessionMap.get(a.interview_session_id);
        return session?.interview_id === interviewId;
      });
    }

    const interviewIds = [...new Set(
      filteredAnalyses
        .map((a) => sessionMap.get(a.interview_session_id)?.interview_id)
        .filter(Boolean)
    )];

    if (interviewIds.length > 0) {
      const { data: interviews } = await supabase
        .from("interview")
        .select("id, name")
        .in("id", interviewIds as string[]);

      const interviewMap = new Map((interviews || []).map((i) => [i.id, i.name]));

      const results = filteredAnalyses.map((analysis) => {
        const session = sessionMap.get(analysis.interview_session_id);
        return {
          ...analysis,
          interview_id: session?.interview_id || null,
          interview_name: session?.interview_id ? interviewMap.get(session.interview_id) || null : null,
          session_status: session?.status || null,
        };
      });

      return NextResponse.json({ results });
    }

    // Return analyses without interview join info
    const results = filteredAnalyses.map((analysis) => ({
      ...analysis,
      interview_id: null,
      interview_name: null,
      session_status: null,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[api/results] Unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
