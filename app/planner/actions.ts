"use server";

import { getSupabaseServerClient } from "@/lib/supabase";
import { computeProgress } from "@/lib/plannerProgress";
import type {
  GoalRow,
  PlannerGoalSummary,
  PlannerStageRow,
  PlannerStageWithSteps,
  PlannerStatus,
  PlannerStepRow,
} from "@/lib/types";

const EDITABLE_STEP_STATUSES: PlannerStatus[] = ["planned", "in_progress", "finished"];

const STATUS_LABELS: Record<PlannerStatus, string> = {
  planned: "Запланирован",
  in_progress: "В работе",
  finished: "Завершён",
  canceled: "Отменён",
  deleted: "Удалён",
};

export async function loadPlannerGoals(clientUuid: string): Promise<PlannerGoalSummary[]> {
  const supabase = getSupabaseServerClient();

  const { data: goals, error: goalsError } = await supabase
    .from("goals")
    .select("id, title, status, smart_json, created_at")
    .eq("client_uuid", clientUuid)
    .neq("status", "trash")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (goalsError || !goals) {
    return [];
  }

  const goalRows = goals as unknown as Array<
    Pick<GoalRow, "id" | "title" | "status"> & {
      smart_json: Record<string, unknown> | null;
      created_at: string | null;
    }
  >;
  if (goalRows.length === 0) {
    return [];
  }

  const goalIds = goalRows.map((goal) => goal.id);
  const { data: stages } = await supabase
    .from("planner_stages")
    .select("id, goal_id, title, description, strategy_title, status, idea_index, order_index, updated_at")
    .in("goal_id", goalIds)
    .neq("status", "deleted")
    .order("idea_index", { ascending: true });

  const stageRows = (stages || []) as unknown as Array<{
    id: string;
    goal_id: string;
    title: string;
    description: string | null;
    strategy_title: string | null;
    status: PlannerStatus;
    idea_index: number | null;
    order_index: number | null;
    updated_at: string | null;
  }>;

  const { data: steps } = await supabase
    .from("planner_steps")
    .select("id, stage_id, goal_id, status, progress_percent")
    .in("goal_id", goalIds)
    .neq("status", "deleted");

  const stepRows = (steps || []) as unknown as Array<{
    id: string;
    stage_id: string;
    goal_id: string;
    status: PlannerStatus;
    progress_percent: number | null;
  }>;

  const stepsByGoal = new Map<string, typeof stepRows>();
  for (const step of stepRows) {
    const bucket = stepsByGoal.get(step.goal_id);
    if (bucket) bucket.push(step);
    else stepsByGoal.set(step.goal_id, [step]);
  }

  const stagesByGoal = new Map<string, typeof stageRows>();
  for (const stage of stageRows) {
    const bucket = stagesByGoal.get(stage.goal_id);
    if (bucket) bucket.push(stage);
    else stagesByGoal.set(stage.goal_id, [stage]);
  }

  const summaries = goalRows.map((goal, index) => {
    const goalStages = stagesByGoal.get(goal.id) || [];
    const goalSteps = stepsByGoal.get(goal.id) || [];
    const firstStage = goalStages[0];
    const progressPercent = computeProgress(goalSteps);
    const ideaIndexes = goalStages
      .map((stage) => stage.idea_index ?? stage.order_index)
      .filter((value): value is number => typeof value === "number");
    const minIdeaIndex = ideaIndexes.length > 0 ? Math.min(...ideaIndexes) : null;

    return {
      summary: {
        id: goal.id,
        title: goal.title || "Без названия",
        status: goal.status ?? null,
        description:
          (typeof goal.smart_json?.description === "string" ? goal.smart_json.description : null) ??
          firstStage?.description ??
          null,
        strategy_title: firstStage?.strategy_title ?? null,
        stages_count: goalStages.length,
        steps_count: goalSteps.length,
        finished_steps_count: goalSteps.filter((step) => step.status === "finished").length,
        progress_percent: progressPercent,
        updated_at: firstStage?.updated_at ?? null,
      },
      // Цели без этапов уходят в конец, чтобы порядок idea_index не рвался.
      ideaIndex: minIdeaIndex ?? Number.MAX_SAFE_INTEGER,
      ideaIndexValue: minIdeaIndex,
      fallbackIndex: index,
    };
  });

  summaries.sort((a, b) => {
    if (a.ideaIndex !== b.ideaIndex) return a.ideaIndex - b.ideaIndex;
    return a.fallbackIndex - b.fallbackIndex;
  });

  return summaries.map((item) => ({
    ...item.summary,
    idea_index: item.ideaIndexValue,
  }));
}

export async function loadPlannerStages(
  clientUuid: string,
  goalId: string
): Promise<PlannerStageWithSteps[]> {
  const supabase = getSupabaseServerClient();

  const { data: goal } = await supabase
    .from("goals")
    .select("id")
    .eq("id", goalId)
    .eq("client_uuid", clientUuid)
    .maybeSingle();

  if (!goal) {
    return [];
  }

  const { data: stages, error: stagesError } = await supabase
    .from("planner_stages")
    .select("*")
    .eq("goal_id", goalId)
    .eq("client_uuid", clientUuid)
    .neq("status", "deleted")
    .order("order_index", { ascending: true });

  if (stagesError || !stages) {
    return [];
  }

  const stageRows = stages as unknown as PlannerStageRow[];
  if (stageRows.length === 0) {
    return [];
  }

  const { data: steps, error: stepsError } = await supabase
    .from("planner_steps")
    .select("*")
    .in(
      "stage_id",
      stageRows.map((stage) => stage.id)
    )
    .neq("status", "deleted")
    .order("order_index", { ascending: true });

  if (stepsError || !steps) {
    return [];
  }

  const stepRows = steps as unknown as PlannerStepRow[];

  return stageRows.map((stage) => ({
    ...stage,
    steps: stepRows.filter((step) => step.stage_id === stage.id),
  }));
}

export async function updatePlannerStep(
  clientUuid: string,
  stepId: string,
  input: {
    status: PlannerStatus;
    notes: string;
    progress_percent: number;
  }
): Promise<PlannerStepRow> {
  const supabase = getSupabaseServerClient();

  if (!EDITABLE_STEP_STATUSES.includes(input.status)) {
    throw new Error("Этот статус нельзя изменить вручную");
  }

  const progress = Math.min(100, Math.max(0, Math.round(Number(input.progress_percent) || 0)));
  const finalStatus = input.status;
  const finalProgress = finalStatus === "finished" ? 100 : progress;

  const { data: existing, error: existingError } = await supabase
    .from("planner_steps")
    .select("*")
    .eq("id", stepId)
    .eq("client_uuid", clientUuid)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message || "Не удалось найти шаг");
  }
  if (!existing) {
    throw new Error("Шаг не найден");
  }

  const current = existing as unknown as PlannerStepRow;
  if (!EDITABLE_STEP_STATUSES.includes(current.status)) {
    throw new Error(`Шаг закрыт (${STATUS_LABELS[current.status]}) и больше не редактируется`);
  }

  const { data: updated, error: updateError } = await supabase
    .from("planner_steps")
    .update({
      status: finalStatus,
      notes: input.notes.trim(),
      progress_percent: finalProgress,
      started_at: current.started_at ?? (finalStatus === "in_progress" ? new Date().toISOString() : null),
      updated_at: new Date().toISOString(),
    })
    .eq("id", stepId)
    .eq("client_uuid", clientUuid)
    .select("*")
    .single();

  if (updateError || !updated) {
    throw new Error(updateError?.message || "Не удалось сохранить шаг");
  }

  return updated as unknown as PlannerStepRow;
}

export async function deleteGoal(clientUuid: string, goalId: string): Promise<{ success: boolean; warning?: string }> {
  const supabase = getSupabaseServerClient();

  // First check if goal exists and belongs to user
  const { data: goal, error: goalError } = await supabase
    .from("goals")
    .select("id, title")
    .eq("id", goalId)
    .eq("client_uuid", clientUuid)
    .maybeSingle();

  if (goalError || !goal) {
    throw new Error("Цель не найдена");
  }

  // Check for started steps (in_progress or finished)
  const { data: steps, error: stepsError } = await supabase
    .from("planner_steps")
    .select("id, status")
    .eq("goal_id", goalId)
    .eq("client_uuid", clientUuid)
    .in("status", ["in_progress", "finished"]);

  if (stepsError) {
    throw new Error("Ошибка проверки шагов");
  }

  const hasStartedSteps = steps && steps.length > 0;

  // Delete steps first (cascade), then stages, then goal
  // Using status = 'deleted' soft delete for steps and stages
  const { error: stepsDeleteError } = await supabase
    .from("planner_steps")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("goal_id", goalId)
    .eq("client_uuid", clientUuid);

  if (stepsDeleteError) {
    throw new Error("Ошибка удаления шагов: " + stepsDeleteError.message);
  }

  const { error: stagesDeleteError } = await supabase
    .from("planner_stages")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("goal_id", goalId)
    .eq("client_uuid", clientUuid);

  if (stagesDeleteError) {
    throw new Error("Ошибка удаления этапов: " + stagesDeleteError.message);
  }

  // Hard delete the goal (or soft delete with status='trash')
  const { error: goalDeleteError } = await supabase
    .from("goals")
    .update({ status: "trash", deleted_at: new Date().toISOString() })
    .eq("id", goalId)
    .eq("client_uuid", clientUuid);

  if (goalDeleteError) {
    throw new Error("Ошибка удаления цели: " + goalDeleteError.message);
  }

  return { 
    success: true, 
    warning: hasStartedSteps ? "Цель и все её этапы и шаги удалены. Были начатые шаги." : undefined 
  };
}
