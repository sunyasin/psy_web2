import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { callClaude, claudeConfigured } from "@/lib/claude";
import { resolveInterviewPrompt } from "@/lib/subscription";
import type { ShortAnalysisResult } from "@/lib/types";
import {
  DECOMPOSITION_KIND,
  generateFallbackStrategies,
  normalizeStrategies,
  parseModelResponse,
  toDecomposePayload,
} from "./parser";
import type { DecomposeIdea, PlannedIdeaInfo } from "./parser";
import { flattenAnswers, formatNumberedQA, loadQuestionIndex, numberAnswers, type AnswerItem } from "@/lib/interview-prompt";

/**
 * Декомпозиция одной цели со страницы идеи.
 *
 * Интервью не создаётся: interview_analyses.interview_session_id ссылается на уже
 * завершённую сессию большого интервью, interview_id — на строку справочника interview
 * с code='decomposition'. Связь «анализ → цели» живёт на goals.decomposition_analysis_id.
 */

const DECOMPOSITION_INTERVIEW_CODE = "decomposition";
const FULL_INTERVIEW_CODE = "default";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientUuid = searchParams.get("client_uuid");
    const goalId = searchParams.get("goal_id");

    if (!clientUuid || !goalId) {
      return NextResponse.json({ error: "client_uuid and goal_id are required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .select("id, title, decomposition_analysis_id")
      .eq("id", goalId)
      .eq("client_uuid", clientUuid)
      .maybeSingle();

    if (goalError) {
      return NextResponse.json({ error: goalError.message }, { status: 500 });
    }
    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const analysisId = goal.decomposition_analysis_id as string | null;
    if (!analysisId) {
      return NextResponse.json(toDecomposePayload(null));
    }

    const { data: analysis, error: analysisError } = await supabase
      .from("interview_analyses")
      .select("id, client_uuid, goal_answer, model_json, answer_count, created_at, kind")
      .eq("id", analysisId)
      .eq("client_uuid", clientUuid)
      .eq("kind", DECOMPOSITION_KIND)
      .maybeSingle();

    if (analysisError) {
      return NextResponse.json({ error: analysisError.message }, { status: 500 });
    }

    const payload = toDecomposePayload(analysis);
    payload.plannedIdeas = await loadPlannedIdeas(supabase, clientUuid, payload.ideas);
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { client_uuid?: string; goal_id?: string };
    const clientUuid = body.client_uuid;
    const goalId = body.goal_id;

    if (!clientUuid || !goalId) {
      return NextResponse.json({ error: "client_uuid and goal_id are required" }, { status: 400 });
    }

    // TODO: заменить заглушку на реальную проверку getSubscriptionStatus(clientUuid).isPaid
    const subscriptionPaid = true;
    if (!subscriptionPaid) {
      return NextResponse.json({ error: "Требуется оплаченная подписка" }, { status: 402 });
    }

    const supabase = getSupabaseServerClient();

    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .select("id, title, smart_json, decomposition_analysis_id")
      .eq("id", goalId)
      .eq("client_uuid", clientUuid)
      .maybeSingle();

    if (goalError) {
      return NextResponse.json({ error: goalError.message }, { status: 500 });
    }
    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const { data: interviews, error: interviewsError } = await supabase
      .from("interview")
      .select("id, code, prompt, pay4prompt")
      .in("code", [DECOMPOSITION_INTERVIEW_CODE, FULL_INTERVIEW_CODE]);

    if (interviewsError) {
      return NextResponse.json({ error: interviewsError.message }, { status: 500 });
    }

    const decompositionInterview = (interviews || []).find(
      (item) => item.code === DECOMPOSITION_INTERVIEW_CODE
    );
    const fullInterview = (interviews || []).find((item) => item.code === FULL_INTERVIEW_CODE);

    if (!decompositionInterview) {
      return NextResponse.json(
        { error: "Interview prompt 'decomposition' not found" },
        { status: 404 }
      );
    }
    if (!fullInterview) {
      return NextResponse.json({ error: "Interview 'default' not found" }, { status: 404 });
    }

    // В модель уходят только ответы завершённых сессий большого интервью.
    const { data: sessions, error: sessionsError } = await supabase
      .from("interview_sessions")
      .select("id, answers, created_at")
      .eq("client_uuid", clientUuid)
      .eq("interview_id", fullInterview.id)
      .eq("status", "completed")
      .order("created_at", { ascending: true });

    if (sessionsError) {
      return NextResponse.json({ error: sessionsError.message }, { status: 500 });
    }
    if (!sessions || sessions.length === 0) {
      return NextResponse.json(
        { error: "Пройдите полное интервью, чтобы разложить цель" },
        { status: 404 }
      );
    }

    const { rawAnswers, answerItems } = collectAnswers(sessions, fullInterview.id);
    if (answerItems.length === 0) {
      return NextResponse.json({ error: "В полном интервью нет ответов" }, { status: 404 });
    }

    const questionIndex = await loadQuestionIndex([fullInterview.id]);
    const promptText = [
      `Цель, которую нужно разложить: ${buildGoalContext(goal)}`,
      "",
      "Вопросы и ответы полного интервью:",
      formatNumberedQA(numberAnswers(answerItems, questionIndex)),
    ].join("\n");

    let modelJson: unknown = { fallback: true };
    let modelUsed = "fallback";
    let strategies: ShortAnalysisResult[] = [];

if (claudeConfigured()) {
        try {
          const systemPrompt = await resolveInterviewPrompt(clientUuid, {
            prompt: decompositionInterview.prompt,
            pay4prompt: decompositionInterview.pay4prompt,
          });
          const response = await callClaude(
            [{ role: "user", text: promptText }],
            systemPrompt || decompositionInterview.prompt || "",
            { max_tokens: 10000, temperature: 0.7 }
          );
        strategies = normalizeStrategies(parseModelResponse(response));
        if (strategies.length > 0) {
          modelJson = { raw_response: response };
          modelUsed = "claude";
        }
      } catch (err) {
        console.error("[analysis/decompose] Claude call failed, using fallback:", err);
        modelJson = { error: err instanceof Error ? err.message : "Unknown error", fallback: true };
      }
    }

    if (strategies.length === 0) {
      strategies = generateFallbackStrategies(String(goal.title));
      modelJson = { strategies, fallback: true };
      modelUsed = "fallback";
    }

    // Предыдущая декомпозиция этой цели заменяется. ON DELETE SET NULL на goals сам
    // очистит decomposition_analysis_id, поэтому переприсваиваем его ниже.
    const previousAnalysisId = goal.decomposition_analysis_id as string | null;
    if (previousAnalysisId) {
      const { error: deleteError } = await supabase
        .from("interview_analyses")
        .delete()
        .eq("id", previousAnalysisId)
        .eq("client_uuid", clientUuid)
        .eq("kind", DECOMPOSITION_KIND);
      if (deleteError) {
        return NextResponse.json(
          { error: deleteError.message || "Не удалось удалить предыдущую декомпозицию" },
          { status: 500 }
        );
      }
    }

    const { data: analysis, error: insertError } = await supabase
      .from("interview_analyses")
      .insert({
        client_uuid: clientUuid,
        // NOT NULL: переиспользуем последнюю завершённую сессию, новую не создаём.
        interview_session_id: sessions[sessions.length - 1].id,
        interview_id: decompositionInterview.id,
        kind: DECOMPOSITION_KIND,
        raw_answers: rawAnswers,
        goal_answer: goal.title,
        model_json: modelJson,
        model_used: modelUsed,
        answer_count: answerItems.length,
      })
      .select("id")
      .single();

    if (insertError || !analysis) {
      return NextResponse.json(
        { error: insertError?.message || "Не удалось сохранить декомпозицию" },
        { status: 500 }
      );
    }

    const { error: linkError } = await supabase
      .from("goals")
      .update({ decomposition_analysis_id: analysis.id })
      .eq("id", goal.id)
      .eq("client_uuid", clientUuid);

    if (linkError) {
      return NextResponse.json(
        { error: linkError.message || "Не удалось привязать декомпозицию к цели" },
        { status: 500 }
      );
    }

    // Список созданных ранее целей: UI предупреждает о перезаписи, только если этапы есть.
    const payload = toDecomposePayload({
      id: analysis.id,
      client_uuid: clientUuid,
      goal_answer: goal.title,
      model_json: modelJson,
      answer_count: answerItems.length,
      created_at: new Date().toISOString(),
    });
    payload.plannedIdeas = await loadPlannedIdeas(supabase, clientUuid, payload.ideas);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[analysis/decompose] Unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}

/**
 * Какие из идей декомпозиции уже разложены в планировщик и сколько у них этапов.
 *
 * Ищем цели по названию, а не по source_analysis_id: /plan переиспользует цель и по
 * названию, когда вставка натыкается на UNIQUE (client_uuid, title). Поэтому совпадение
 * по названию — это ровно тот случай, когда этапы будут перезаписаны.
 */
async function loadPlannedIdeas(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  clientUuid: string,
  ideas: DecomposeIdea[]
): Promise<PlannedIdeaInfo[]> {
  const titles = ideas.map((idea) => idea.title).filter(Boolean);
  if (titles.length === 0) return [];

  const { data: goals, error: goalsError } = await supabase
    .from("goals")
    .select("id, title")
    .eq("client_uuid", clientUuid)
    .in("title", titles);

  if (goalsError || !goals || goals.length === 0) {
    if (goalsError) console.error("[analysis/decompose] loadPlannedIdeas goals:", goalsError);
    return [];
  }

  const goalIds = goals.map((row) => row.id as string);
  const { data: stages, error: stagesError } = await supabase
    .from("planner_stages")
    .select("goal_id")
    .in("goal_id", goalIds);

  if (stagesError) {
    console.error("[analysis/decompose] loadPlannedIdeas stages:", stagesError);
    return [];
  }

  const counts = new Map<string, number>();
  for (const stage of stages || []) {
    const stageGoalId = stage.goal_id as string;
    counts.set(stageGoalId, (counts.get(stageGoalId) || 0) + 1);
  }

  return goals
    .map((row) => ({ title: String(row.title), stageCount: counts.get(row.id as string) || 0 }))
    .filter((info) => info.stageCount > 0);
}

function buildGoalContext(goal: Record<string, unknown>): string {
  const smartJson = goal.smart_json;
  const description =
    smartJson && typeof smartJson === "object"
      ? (smartJson as Record<string, unknown>).description
      : null;
  return description && typeof description === "string" && description.trim()
    ? `${goal.title} — ${description.trim()}`
    : String(goal.title);
}

function collectAnswers(
  sessions: Array<{ answers: unknown }>,
  interviewId?: string
): { rawAnswers: Record<string, Record<string, string>>; answerItems: AnswerItem[] } {
  const rawAnswers: Record<string, Record<string, string>> = {};
  const answerItems: AnswerItem[] = [];

  for (const session of sessions) {
    for (const item of flattenAnswers(session.answers, interviewId)) {
      rawAnswers[item.block] ||= {};
      rawAnswers[item.block][item.order] = item.answer;
      answerItems.push(item);
    }
  }

  return { rawAnswers, answerItems };
}
