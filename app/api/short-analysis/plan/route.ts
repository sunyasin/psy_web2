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

    const parsed = extractShortResponse(analysis.model_json);
    if (!parsed || parsed.stages.length === 0) {
      return NextResponse.json({ error: "В анализе нет стратегий" }, { status: 400 });
    }

    const createdGoals: string[] = [];
    const createdStages: string[] = [];
    for (const selection of body.selections) {
      const selectedStage = parsed.stages[selection.ideaIndex];
      const strategy = selectedStage?.strategies[selection.strategyIndex];
      if (!selectedStage || !strategy) {
        return NextResponse.json({ error: "Выбрана неизвестная стратегия" }, { status: 400 });
      }

      const { data: existingGoal, error: existingGoalError } = await supabase
        .from("goals")
        .select("id")
        .eq("client_uuid", body.clientUuid)
        .eq("source_analysis_id", analysis.id)
        .eq("title", selectedStage.name)
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
            title: selectedStage.name,
            smart_json: {
              description: selectedStage.description || "",
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
            title: selectedStage.name,
            description: selectedStage.description,
            planned_days: plannedDays || null,
            model_comments: selectedStage.description,
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
