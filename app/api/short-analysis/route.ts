import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { extractShortResponse } from "@/lib/short-analysis";

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
      .eq("kind", "short")
      .order("created_at", { ascending: false })
      .limit(20);
    if (analysisError) {
      return NextResponse.json({ error: analysisError.message }, { status: 500 });
    }

    const parsed = (analyses || [])
      .map((item) => ({ analysis: item, response: extractShortResponse(item.model_json) }))
      .filter((item): item is { analysis: typeof item.analysis; response: NonNullable<typeof item.response> } =>
        Boolean(item.response && item.response.stages.length > 0)
      );
    const latest = parsed[0] || null;

    if (!latest) {
      return NextResponse.json({ analysis: null, response: null, stages: [] });
    }

    const { analysis, response } = latest;

    const stages = response.stages.map((stage, stageIndex) => ({
      id: `${analysis.id}:${stage.number || stageIndex}`,
      stage_index: stageIndex,
      number: stage.number,
      name: stage.name,
      description: stage.description,
      strategies: stage.strategies.map((strategy, strategyIndex) => ({
        id: `${analysis.id}:${stageIndex}:${strategyIndex}`,
        stage_index: stageIndex,
        strategy_index: strategyIndex,
        name: strategy.name,
        approach: strategy.approach,
        resources: strategy.resources,
        support: strategy.support,
        steps: strategy.steps,
        time_to_launch: strategy.time_to_launch,
        timeline: strategy.timeline,
        budget: strategy.budget,
        investment: strategy.investment,
        avoid: strategy.avoid,
        assumptions: strategy.assumptions,
      })),
    }));

    return NextResponse.json({
      analysis: {
        id: analysis.id,
        goal_answer: analysis.goal_answer,
        answer_count: analysis.answer_count,
      },
      response: {
        title: response.title,
        description: response.description,
      },
      stages,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
