import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { InterviewConfigRow } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const url = new URL(request.url);
    const interviewId = url.searchParams.get("interview_id");

    let query = supabase
      .from("interview_config")
      .select("*")
      .eq("active", true)
      .order("block_number", { ascending: true });

    if (interviewId) {
      query = query.eq("interview_id", interviewId);
    } else {
      // Try to resolve the default interview; if the interview table is missing,
      // fall back to all active configs (no interview_id filter).
      try {
        const { data: interview, error: interviewError } = await supabase
          .from("interview")
          .select("id")
          .eq("code", "default")
          .maybeSingle();

        if (interviewError && interviewError.code !== "PGRST205" && interviewError.code !== "42P01") {
          throw interviewError;
        }

        if (interview) {
          query = query.eq("interview_id", interview.id);
        }
      } catch {
        // interview table may not exist; continue without interview_id filter
      }
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message || "Failed to load questions" }, { status: 500 });
    }

    const blocks = (data || []).map((row) => ({
      block_number: row.block_number,
      block_name: row.block_name,
      is_conditional: row.is_conditional,
      trigger_question: row.trigger_question,
      questions: (row.questions as InterviewConfigRow["questions"]) || [],
    }));

    return NextResponse.json({ blocks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
