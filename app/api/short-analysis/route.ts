import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { ShortAnalysisResult } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const clientUuid = new URL(request.url).searchParams.get("client_uuid");
    if (!clientUuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: analyses, error: analysisError } = await supabase
      .from("interview_analyses")
      .select("*")
      .eq("client_uuid", clientUuid)
      .order("created_at", { ascending: false })
      .limit(20);
    if (analysisError) {
      return NextResponse.json({ error: analysisError.message }, { status: 500 });
    }

    const analysis = (analyses || []).find((item) => Array.isArray(item.strategy_json) && item.strategy_json.length > 0) || null;
    if (!analysis) {
      return NextResponse.json({ analysis: null, ideas: [] });
    }

    const parsed = analysis.strategy_json as ShortAnalysisResult[];
    const ideas = parsed.map((idea, ideaIndex) => ({
      id: `${analysis.id}:${ideaIndex}`,
      idea_index: ideaIndex,
      title: idea.title,
      description: idea.description,
      strategies: idea.strategies.map((strategy, strategyIndex) => ({
        id: `${analysis.id}:${ideaIndex}:${strategyIndex}`,
        idea_index: ideaIndex,
        strategy_index: strategyIndex,
        title: strategy.name,
        description: "",
        steps: strategy.steps,
        is_selected: false,
        tracking: [],
      })),
    }));

    return NextResponse.json({ analysis, ideas });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
