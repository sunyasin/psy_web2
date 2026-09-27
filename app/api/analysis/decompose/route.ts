import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { callClaude, claudeConfigured } from "@/lib/claude";
import type { ShortAnalysisResult } from "@/lib/types";
import {
  DECOMPOSITION_KIND,
  generateFallbackStrategies,
  normalizeStrategies,
  parseModelResponse,
  toDecomposePayload,
} from "./parser";

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

    return NextResponse.json(toDecomposePayload(analysis));
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
      .select("id, code, prompt")
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

    const { rawAnswers, promptLines } = collectAnswers(sessions);
    if (promptLines.length === 0) {
      return NextResponse.json({ error: "В полном интервью нет ответов" }, { status: 404 });
    }

    const promptText = [
      `Цель, которую нужно разложить: ${buildGoalContext(goal)}`,
      "",
      "Ответы на полное интервью:",
      promptLines.join("\n"),
    ].join("\n");

    let modelJson: unknown = { fallback: true };
    let modelUsed = "fallback";
    let strategies: ShortAnalysisResult[] = [];

    if (claudeConfigured()) {
      try {
        const response = await callClaude(
          [{ role: "user", text: promptText }],
          decompositionInterview.prompt || "",
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
        answer_count: promptLines.length,
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

    return NextResponse.json(
      toDecomposePayload({
        id: analysis.id,
        client_uuid: clientUuid,
        goal_answer: goal.title,
        model_json: modelJson,
        answer_count: promptLines.length,
        created_at: new Date().toISOString(),
      })
    );
  } catch (err) {
    console.error("[analysis/decompose] Unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
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
  sessions: Array<{ answers: unknown }>
): { rawAnswers: Record<string, Record<string, string>>; promptLines: string[] } {
  const rawAnswers: Record<string, Record<string, string>> = {};
  const promptLines: string[] = [];

  for (const session of sessions) {
    const answers = (session.answers || {}) as Record<string, unknown>;
    for (const [block, blockAnswers] of Object.entries(answers)) {
      if (block === "block4_trigger" || !blockAnswers || typeof blockAnswers !== "object") continue;
      for (const [order, text] of Object.entries(blockAnswers as Record<string, unknown>)) {
        if (typeof text !== "string" || !text.trim()) continue;
        rawAnswers[block] ||= {};
        rawAnswers[block][order] = text;
        promptLines.push(`Блок ${block}, вопрос ${order}: ${text.trim()}`);
      }
    }
  }

  return { rawAnswers, promptLines };
}
