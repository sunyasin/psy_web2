import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { DECOMPOSITION_KIND, extractStrategiesFromModelJson } from "../parser";

/**
 * Раскладка идей декомпозиции в планировщик.
 *
 * Каждая выбранная идея становится самостоятельной целью с
 * source_analysis_id = id декомпозиции. Исходная идея, на странице которой нажали
 * «Декомпозиция», не затрагивается.
 */

type Selection = { idea_index: number; strategy_index: number };

type PlannedGoal = { id: string; title: string; stepCount: number };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      client_uuid?: string;
      analysis_id?: string;
      selections?: Selection[];
    };
    const clientUuid = body.client_uuid;
    const analysisId = body.analysis_id;
    const selections = Array.isArray(body.selections) ? body.selections : [];

    if (!clientUuid || !analysisId || selections.length === 0) {
      return NextResponse.json(
        { error: "client_uuid, analysis_id and selections are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    const { data: analysis, error: analysisError } = await supabase
      .from("interview_analyses")
      .select("id, goal_answer, model_json, kind")
      .eq("id", analysisId)
      .eq("client_uuid", clientUuid)
      .eq("kind", DECOMPOSITION_KIND)
      .maybeSingle();

    if (analysisError) {
      return NextResponse.json({ error: analysisError.message }, { status: 500 });
    }
    if (!analysis) {
      return NextResponse.json({ error: "Анализ не найден" }, { status: 404 });
    }

    // Анализ должен быть привязан к какой-то цели, иначе подставлен чужой id.
    const { data: ownerGoal, error: ownerError } = await supabase
      .from("goals")
      .select("id")
      .eq("decomposition_analysis_id", analysis.id)
      .eq("client_uuid", clientUuid)
      .maybeSingle();

    if (ownerError) {
      return NextResponse.json({ error: ownerError.message }, { status: 500 });
    }
    if (!ownerGoal) {
      return NextResponse.json(
        { error: "Декомпозиция не привязана к цели" },
        { status: 403 }
      );
    }

    const parsed = extractStrategiesFromModelJson(analysis.model_json);
    if (parsed.length === 0) {
      return NextResponse.json({ error: "В декомпозиции нет идей" }, { status: 400 });
    }

    const targets: Array<{ idea: (typeof parsed)[number]; strategyIndex: number }> = [];
    for (const selection of selections) {
      const idea = parsed[selection.idea_index];
      const strategy = idea?.strategies[selection.strategy_index];
      if (!idea || !strategy) {
        return NextResponse.json({ error: "Выбрана неизвестная стратегия" }, { status: 400 });
      }
      targets.push({ idea, strategyIndex: selection.strategy_index });
    }

    const goals: PlannedGoal[] = [];

    for (const { idea, strategyIndex } of targets) {
      const strategy = idea.strategies[strategyIndex];

      // Повторная раскладка: цель переиспользуется, этапы и шаги создаются заново.
      const goalId = await resolveGoalId(supabase, {
        clientUuid,
        analysisId: analysis.id,
        idea,
        goalAnswer: (analysis.goal_answer as string | null) || "",
      });
      if (!goalId) {
        return NextResponse.json({ error: "Не удалось определить цель" }, { status: 500 });
      }

      const { error: clearStepsError } = await supabase
        .from("planner_steps")
        .delete()
        .eq("goal_id", goalId);
      if (clearStepsError) {
        return NextResponse.json(
          { error: clearStepsError.message || "Не удалось очистить шаги" },
          { status: 500 }
        );
      }

      const { error: clearStagesError } = await supabase
        .from("planner_stages")
        .delete()
        .eq("goal_id", goalId);
      if (clearStagesError) {
        return NextResponse.json(
          { error: clearStagesError.message || "Не удалось очистить этапы" },
          { status: 500 }
        );
      }

      const plannedDays = strategy.steps.reduce(
        (sum, step) => sum + (Number(step.estimated_days) || 0),
        0
      );

      const { data: stage, error: stageError } = await supabase
        .from("planner_stages")
        .insert({
          client_uuid: clientUuid,
          goal_id: goalId,
          analysis_id: analysis.id,
          // Одна идея — одна цель, поэтому индекс всегда 0 (UNIQUE(goal_id, idea_index)).
          idea_index: 0,
          order_index: 0,
          strategy_title: strategy.name,
          title: idea.title,
          description: idea.description,
          planned_days: plannedDays || null,
          model_comments: idea.description,
          status: "planned",
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (stageError || !stage) {
        return NextResponse.json(
          { error: stageError?.message || "Не удалось создать этап" },
          { status: 500 }
        );
      }

      const stepRows = strategy.steps.map((step, orderIndex) => ({
        stage_id: stage.id,
        client_uuid: clientUuid,
        goal_id: goalId,
        title: step.title,
        description: step.description || "",
        planned_days: Number(step.estimated_days) || null,
        model_comments: step.description || "",
        order_index: orderIndex,
        updated_at: new Date().toISOString(),
      }));

      if (stepRows.length > 0) {
        const { error: stepsError } = await supabase.from("planner_steps").insert(stepRows);
        if (stepsError) {
          return NextResponse.json(
            { error: stepsError.message || "Не удалось создать шаги" },
            { status: 500 }
          );
        }
      }

      goals.push({ id: goalId, title: idea.title, stepCount: stepRows.length });
    }

    return NextResponse.json({ success: true, goals });
  } catch (err) {
    console.error("[analysis/decompose/plan] Unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}

type Supabase = ReturnType<typeof getSupabaseServerClient>;

type IdeaShape = { title: string; description: string };

async function resolveGoalId(
  supabase: Supabase,
  input: { clientUuid: string; analysisId: string; idea: IdeaShape; goalAnswer: string }
): Promise<string | null> {
  const payload = {
    description: input.idea.description || "",
    goal_answer: input.goalAnswer,
    selected_strategy_title: "",
  };

  const { data: existing, error: existingError } = await supabase
    .from("goals")
    .select("id")
    .eq("client_uuid", input.clientUuid)
    .eq("source_analysis_id", input.analysisId)
    .eq("title", input.idea.title)
    .maybeSingle();

  if (existingError) {
    return null;
  }
  if (existing) {
    return existing.id as string;
  }

  const { data: created, error: createError } = await supabase
    .from("goals")
    .insert({
      client_uuid: input.clientUuid,
      title: input.idea.title,
      smart_json: payload,
      source_analysis_id: input.analysisId,
      origin: "primary",
      planning_track: "standard_ai_plan",
      status: "active",
    })
    .select("id")
    .single();

  if (!createError && created) {
    return created.id as string;
  }

  // Название может совпасть с уже существующей целью (UNIQUE(client_uuid, title)),
  // созданной из другой идеи. Тогда просто переиспользуем её.
  if ((createError as { code?: string } | null)?.code === "23505") {
    const { data: fallback } = await supabase
      .from("goals")
      .select("id")
      .eq("client_uuid", input.clientUuid)
      .eq("title", input.idea.title)
      .maybeSingle();
    if (fallback) {
      return fallback.id as string;
    }
  }

  console.error("[analysis/decompose/plan] Failed to resolve goal:", createError);
  return null;
}
