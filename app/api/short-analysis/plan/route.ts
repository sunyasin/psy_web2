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
    const { data: stages, error: stagesError } = await supabase
      .from("planner_stages")
      .select("*")
      .eq("client_uuid", clientUuid)
      .neq("status", "deleted")
      .order("order_index", { ascending: true });
    if (stagesError) {
      return NextResponse.json({ error: stagesError.message }, { status: 500 });
    }

    const stageRows = stages || [];
    const stageIds = stageRows.map((stage) => stage.id);
    let steps: unknown[] = [];
    if (stageIds.length > 0) {
      const { data: stepRows, error: stepsError } = await supabase
        .from("planner_steps")
        .select("*")
        .in("stage_id", stageIds)
        .order("order_index", { ascending: true });
      if (stepsError) {
        return NextResponse.json({ error: stepsError.message }, { status: 500 });
      }
      steps = stepRows || [];
    }

    return NextResponse.json({
      stages: stageRows.map((stage) => ({
        ...stage,
        steps: steps.filter((step) => (step as { stage_id?: string }).stage_id === stage.id),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      clientUuid?: string;
      analysisId?: string;
      selections?: Array<{ ideaIndex: number; strategyIndex: number }>;
    };
    if (!body.clientUuid || !body.analysisId || !Array.isArray(body.selections)) {
      return NextResponse.json({ error: "clientUuid, analysisId and selections are required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: analysis, error: analysisError } = await supabase
      .from("interview_analyses")
      .select("id, goal_answer, strategy_json")
      .eq("id", body.analysisId)
      .eq("client_uuid", body.clientUuid)
      .maybeSingle();
    if (analysisError || !analysis) {
      return NextResponse.json({ error: analysisError?.message || "Анализ не найден" }, { status: 404 });
    }

    const parsed = analysis.strategy_json as ShortAnalysisResult[] | null;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return NextResponse.json({ error: "В анализе нет стратегий" }, { status: 400 });
    }

    const createdGoals: string[] = [];
    const createdStages: string[] = [];
    for (const selection of body.selections) {
      const idea = parsed[selection.ideaIndex];
      const strategy = idea?.strategies[selection.strategyIndex];
      if (!idea || !strategy) {
        return NextResponse.json({ error: "Выбрана неизвестная стратегия" }, { status: 400 });
      }

      const { data: existingGoal, error: existingGoalError } = await supabase
        .from("goals")
        .select("id")
        .eq("client_uuid", body.clientUuid)
        .eq("source_analysis_id", analysis.id)
        .eq("title", idea.title)
        .maybeSingle();
      if (existingGoalError) {
        return NextResponse.json({ error: existingGoalError.message }, { status: 500 });
      }

      let goalId = existingGoal?.id as string | undefined;
      if (!goalId) {
        const { data: goal, error: goalError } = await supabase
          .from("goals")
          .insert({
            client_uuid: body.clientUuid,
            title: idea.title,
            smart_json: {
              description: idea.description || "",
              goal_answer: analysis.goal_answer || "",
              source_idea_index: selection.ideaIndex,
              selected_strategy_title: strategy.name,
            },
            source_analysis_id: analysis.id,
            origin: "primary",
            planning_track: "standard_ai_plan",
            status: "active",
          })
          .select("id")
          .single();
        if (goalError || !goal) {
          return NextResponse.json({ error: goalError?.message || "Не удалось создать цель" }, { status: 500 });
        }
        goalId = goal.id;
      }
      if (!goalId) {
        return NextResponse.json({ error: "Не удалось определить цель" }, { status: 500 });
      }
      const resolvedGoalId: string = goalId;
      if (!createdGoals.includes(resolvedGoalId)) createdGoals.push(resolvedGoalId);

      const plannedDays = strategy.steps.reduce((sum, step) => sum + (Number(step.estimated_days) || 0), 0);
      const { data: stage, error: stageError } = await supabase
        .from("planner_stages")
        .upsert(
          {
            client_uuid: body.clientUuid,
            goal_id: resolvedGoalId,
            analysis_id: analysis.id,
            idea_index: selection.ideaIndex,
            strategy_title: strategy.name,
            title: idea.title,
            description: idea.description,
            planned_days: plannedDays || null,
            model_comments: idea.description,
            order_index: selection.ideaIndex,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "goal_id,idea_index" },
        )
        .select("id")
        .single();
      if (stageError || !stage) {
        return NextResponse.json({ error: stageError?.message || "Не удалось создать этап" }, { status: 500 });
      }
      createdStages.push(stage.id);

      const stepRows = strategy.steps.map((step, orderIndex) => ({
        stage_id: stage.id,
        client_uuid: body.clientUuid,
        goal_id: resolvedGoalId,
        strategy_title: strategy.name,
        title: step.title,
        description: step.description || "",
        planned_days: Number(step.estimated_days) || null,
        model_comments: step.description || "",
        order_index: orderIndex,
        updated_at: new Date().toISOString(),
      }));
      if (stepRows.length > 0) {
        const { error: stepsError } = await supabase
          .from("planner_steps")
          .upsert(stepRows, { onConflict: "stage_id,order_index" });
        if (stepsError) {
          return NextResponse.json({ error: stepsError.message || "Не удалось создать шаги" }, { status: 500 });
        }
      }
    }

    if (createdStages.length === 0) {
      return NextResponse.json({ error: "Не выбрано ни одной стратегии" }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      goalIds: createdGoals,
      stageIds: createdStages,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
