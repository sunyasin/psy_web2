import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { ShortAnalysisResult, ShortAnalysisStrategy, ShortAnalysisStep } from "@/lib/types";

// Copy the normalize logic from short-analysis route
const STRATEGY_KEYS = ["strategies", "Стратегии", "plan", "план", "steps", "шаги"];
const STRATEGY_NAME_KEYS = ["name", "title", "название", "имя", "стратегия"];
const STEP_TITLE_KEYS = ["title", "step", "name", "название", "задача", "шаг", "действие"];
const STEP_DAYS_KEYS = ["estimated_days", "days", "срок", "дней", "duration", "estimate"];
const STEP_DESCRIPTION_KEYS = ["description", "detail", "details", "описание", "пояснение"];

function readString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readDays(source: Record<string, unknown>): number {
  for (const key of STEP_DAYS_KEYS) {
    const value = source[key];
    const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.min(Math.round(parsed), 3650);
  }
  return 0;
}

function readSteps(source: unknown): ShortAnalysisStep[] {
  if (typeof source === "string") {
    const lines = source.split(/\r?\n|(?<=[.;])\s+/).map((line) => line.replace(/^[\s\-–—•*\d.)\]]+/, "").trim()).filter(Boolean);
    const items = lines.length > 0 ? lines : [source.trim()];
    return items.map((text, index) => ({
      step: index + 1,
      title: text.length > 80 ? `${text.slice(0, 80).trim()}…` : text,
      description: text,
      estimated_days: 0,
    }));
  }
  if (!Array.isArray(source)) return [];

  return source.flatMap((rawStep, index) => {
    if (typeof rawStep === "string") {
      const text = rawStep.trim();
      if (!text) return [];
      return [{
        step: index + 1,
        title: text.length > 80 ? `${text.slice(0, 80).trim()}…` : text,
        description: text,
        estimated_days: 0,
      }];
    }
    if (!rawStep || typeof rawStep !== "object") return [];
    const step = rawStep as Record<string, unknown>;
    const title = readString(step, STEP_TITLE_KEYS);
    if (!title) return [];
    return [{
      step: index + 1,
      title,
      description: readString(step, STEP_DESCRIPTION_KEYS),
      estimated_days: readDays(step),
    }];
  });
}

function stepsFromDescription(description: string): ShortAnalysisStep[] {
  const sentences = description
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.replace(/^[\s•*\-–—]+/, "").trim())
    .filter((sentence) => sentence.length > 15);

  const picked = (sentences.length > 0 ? sentences : [description.trim()])
    .slice(0, 5)
    .filter(Boolean);

  return picked.map((text, index) => ({
    step: index + 1,
    title: text.length > 80 ? `${text.slice(0, 80).trim()}…` : text,
    description: text,
    estimated_days: index === 0 ? 3 : 7,
  }));
}

function normalizeStrategies(value: unknown): ShortAnalysisResult[] {
  const rawList = Array.isArray(value)
    ? value
    : (() => {
        if (value && typeof value === "object") {
          const container = value as Record<string, unknown>;
          for (const key of ["ideas", "идеи", "strategies", "Стратегии", "results", "data"]) {
            if (Array.isArray(container[key])) return container[key];
          }
        }
        return [value];
      })();

  const result: ShortAnalysisResult[] = [];
  let synthesized = 0;

  for (const rawIdea of rawList) {
    if (!rawIdea || typeof rawIdea !== "object") continue;
    const idea = rawIdea as Record<string, unknown>;
    const title = readString(idea, ["title", "name", "заголовок", "идея", "тема"]);
    const description = readString(idea, ["description", "описание", "detail", "details", "текст"]);
    if (!title && !description) continue;

    const ideaStrategies: ShortAnalysisStrategy[] = [];

    for (const key of STRATEGY_KEYS) {
      const strategySource = idea[key];
      if (!strategySource || typeof strategySource !== "object") continue;

      if (Array.isArray(strategySource)) {
        const firstObject = strategySource.find((item) => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown> | undefined;
        const hasNamedStrategies = firstObject && "steps" in firstObject && Array.isArray(firstObject.steps);

        if (hasNamedStrategies) {
          for (const strat of strategySource) {
            if (!strat || typeof strat !== "object") continue;
            const stratObj = strat as Record<string, unknown>;
            const stratName = readString(stratObj, STRATEGY_NAME_KEYS);
            const stratSteps = readSteps(stratObj.steps);
            if (stratSteps.length > 0) {
              ideaStrategies.push({
                name: stratName || `Стратегия ${ideaStrategies.length + 1}`,
                steps: stratSteps,
              });
            }
          }
        } else {
          const steps = readSteps(strategySource);
          if (steps.length > 0) {
            const named = firstObject ? readString(firstObject, STRATEGY_NAME_KEYS) : "";
            ideaStrategies.push({
              name: named || readString(idea, STRATEGY_NAME_KEYS) || `Стратегия ${ideaStrategies.length + 1}`,
              steps,
            });
          }
        }
        continue;
      }

      for (const [name, stepsSource] of Object.entries(strategySource as Record<string, unknown>)) {
        const steps = readSteps(stepsSource);
        if (steps.length > 0) ideaStrategies.push({ name: name.trim() || `Стратегия ${ideaStrategies.length + 1}`, steps });
      }
    }

    if (ideaStrategies.length === 0 && description) {
      const steps = stepsFromDescription(description);
      if (steps.length > 0) {
        ideaStrategies.push({ name: "Пошаговый план", steps });
        synthesized += 1;
      }
    }

    if (ideaStrategies.length === 0) {
      console.error("[short-analysis-plan] idea dropped: no title/description/strategies", JSON.stringify(idea).slice(0, 300));
      continue;
    }

    result.push({ title: title || description.slice(0, 60), description, strategies: ideaStrategies });
  }

  if (synthesized > 0) {
    console.error(`[short-analysis-plan] synthesized plans for ${synthesized} idea(s) from description text`);
  }

  return result.slice(0, 5);
}

function extractStrategiesFromModelJson(modelJson: any): ShortAnalysisResult[] {
  if (!modelJson) return [];
  
  if (modelJson.raw_response) {
    try {
      const response = modelJson.raw_response;
      const stripped = response.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(stripped);
      return normalizeStrategies(parsed);
    } catch (err) {
      console.error("Failed to parse model_json raw_response:", err);
    }
  }
  
  if (Array.isArray(modelJson.strategies)) {
    return modelJson.strategies;
  }
  
  return [];
}

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
      .select("id, goal_answer, model_json")
      .eq("id", body.analysisId)
      .eq("client_uuid", body.clientUuid)
      .maybeSingle();
    if (analysisError || !analysis) {
      return NextResponse.json({ error: analysisError?.message || "Анализ не найден" }, { status: 404 });
    }

    const parsed = extractStrategiesFromModelJson(analysis.model_json);
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
      const { data: previousStage } = await supabase
        .from("planner_stages")
        .select("id, strategy_title")
        .eq("goal_id", resolvedGoalId)
        .eq("idea_index", selection.ideaIndex)
        .maybeSingle();

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

      // Шаги этапа — это ровно шаги стратегии, выбранной для него сейчас.
      const stepRows = strategy.steps.map((step, orderIndex) => ({
        stage_id: stage.id,
        client_uuid: body.clientUuid,
        goal_id: resolvedGoalId,
        title: step.title,
        description: step.description || "",
        planned_days: Number(step.estimated_days) || null,
        model_comments: step.description || "",
        order_index: orderIndex,
        updated_at: new Date().toISOString(),
      }));

      const strategyChanged = !previousStage || previousStage.strategy_title !== strategy.name;

      if (strategyChanged) {
        // Стратегия сменилась — этап должен содержать только её шаги.
        const { error: clearError } = await supabase
          .from("planner_steps")
          .delete()
          .eq("stage_id", stage.id);
        if (clearError) {
          return NextResponse.json({ error: clearError.message || "Не удалось обновить шаги этапа" }, { status: 500 });
        }

        if (stepRows.length > 0) {
          const { error: stepsError } = await supabase.from("planner_steps").insert(stepRows);
          if (stepsError) {
            return NextResponse.json({ error: stepsError.message || "Не удалось создать шаги" }, { status: 500 });
          }
        }
        continue;
      }

      // Та же стратегия: обновляем только метаданные плана, сохраняя
      // статусы, прогресс и описания, отредактированные пользователем.
      const { data: currentSteps, error: currentStepsError } = await supabase
        .from("planner_steps")
        .select("id, order_index")
        .eq("stage_id", stage.id);
      if (currentStepsError) {
        return NextResponse.json({ error: currentStepsError.message || "Не удалось загрузить шаги этапа" }, { status: 500 });
      }

      const existingOrderIndexes = new Set(
        (currentSteps || []).map((item) => (item as { order_index: number }).order_index)
      );

      const missingRows = stepRows.filter((row) => !existingOrderIndexes.has(row.order_index));
      if (missingRows.length > 0) {
        const { error: insertError } = await supabase.from("planner_steps").insert(missingRows);
        if (insertError) {
          return NextResponse.json({ error: insertError.message || "Не удалось создать шаги" }, { status: 500 });
        }
      }

      for (const row of stepRows) {
        if (!existingOrderIndexes.has(row.order_index)) continue;
        const { error: updateError } = await supabase
          .from("planner_steps")
          .update({ title: row.title, planned_days: row.planned_days, model_comments: row.model_comments })
          .eq("stage_id", stage.id)
          .eq("order_index", row.order_index);
        if (updateError) {
          return NextResponse.json({ error: updateError.message || "Не удалось обновить шаги" }, { status: 500 });
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
