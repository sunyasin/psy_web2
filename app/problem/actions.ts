"use server";

import { getSupabaseServerClient } from "@/lib/supabase";
import { callClaude, claudeConfigured, LlmMessage } from "@/lib/claude";
import type { ProblemPhase, ProblemState, ProblemDiagnosisSessionRow } from "@/lib/types";

const POINT_A_PROMPTS = [
  "Расскажи, что происходит сейчас? В чём именно проблема, своими словами?",
  "Есть что-то ещё, что делает эту ситуацию особенно сложной или болезненной?",
];

const POINT_B_PROMPTS = [
  "А как выглядело бы идеальное решение? Что должно измениться, чтобы проблема исчезла?",
  "Если бы это решение уже было — что бы ты чувствовал? Как бы изменился твой обычный день?",
];

const CLARIFY_PROMPT =
  "Давай подытожу, чтобы убедиться, что я правильно понял. Суть проблемы — это... Правильно?";

const CHOICES = [
  { value: "free_diagnosis", label: "Бесплатная диагностика в чате" },
  { value: "paid_booking", label: "Записаться на консультацию" },
  { value: "dismiss", label: "Не сейчас" },
];

const PROBLEM_DIAGNOSIS_SYSTEM_PROMPT = `Ты — ассистент по диагностике жизненных проблем. Ты говоришь по-русски. Твоя задача — провести структурированную беседу, чтобы помочь человеку разобраться в своей проблеме.

Флоу сессии:
1. Точка А — разберись, что происходит сейчас. Спроси, в чём именно проблема, своими словами. Если есть что-то, что делает ситуацию особенно сложной — уточни это.
2. Точка Б — представь идеальное решение. Спроси, как бы выглядело идеальное решение, что должно измениться. Если бы решение уже было — что бы человек чувствовал, как бы изменился обычный день?
3. Проверка — кратко подытожь, чтобы убедиться, что правильно понял. Спроси «правильно?» для подтверждения.

После проверки предложи варианты дальнейших действий.

Говори коротко, по делу, тёпло. Задавай по одному вопросу за раз. Не давай лекций. Не ставь диагнозы. Если клиент молчит или говорит «да»/«нет» — задавай конкретный следующий вопрос.`;

function toLlmMessages(log: Array<{ role: string; text: string }>): LlmMessage[] {
  return log
    .filter((e) => e.role === "user" || e.role === "agent")
    .map((e) => ({
      role: (e.role === "agent" ? "assistant" : "user") as "assistant" | "user",
      text: e.text,
    }));
}

function getFallbackPrompt(phase: ProblemPhase, turn: number): string {
  const idx = Math.max(0, turn - 1);
  switch (phase) {
    case "point_a":
      return POINT_A_PROMPTS[Math.min(idx, POINT_A_PROMPTS.length - 1)];
    case "point_b":
      return POINT_B_PROMPTS[Math.min(idx, POINT_B_PROMPTS.length - 1)];
    case "clarify":
      return CLARIFY_PROMPT;
    default:
      return "";
  }
}

export async function startProblemDiagnosis(clientUuid: string, goalId?: string): Promise<ProblemState> {
  const supabase = getSupabaseServerClient();

  let contextMessage: { role: "agent"; text: string } | null = null;

  if (goalId) {
    const { data: goalData } = await supabase
      .from("goals")
      .select("conflict_analysis")
      .eq("id", goalId)
      .eq("client_uuid", clientUuid)
      .single();

    if (goalData?.conflict_analysis) {
      contextMessage = {
        role: "agent",
        text: `Контекст: ранее проведён анализ саботажа для этой цели. Вот результат:\n\n${goalData.conflict_analysis}\n\nУчитывайте этот анализ при разговоре с клиентом.`,
      };
    }
  }

  const { data, error } = await supabase
    .from("problem_diagnosis_sessions")
    .insert({
      client_uuid: clientUuid,
      session_log: contextMessage ? [contextMessage] : [],
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to start problem diagnosis");
  }

  return buildState(data, "point_a", 1);
}

export async function submitProblemMessage(
  clientUuid: string,
  message: string
): Promise<ProblemState> {
  const supabase = getSupabaseServerClient();
  const { data: session, error } = await supabase
    .from("problem_diagnosis_sessions")
    .select("*")
    .eq("client_uuid", clientUuid)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !session) {
    throw new Error(error?.message || "No active problem diagnosis session");
  }

  const log = Array.isArray(session.session_log) ? session.session_log : [];
  const lastEntry = log[log.length - 1] as { phase: ProblemPhase; turn: number } | undefined;
  const currentPhase = lastEntry?.phase || "point_a";
  const currentTurn = lastEntry?.turn || 0;

  const updatedLog = [
    ...log,
    { role: "user", text: message, phase: currentPhase, turn: currentTurn },
  ];

  let nextPhase: ProblemPhase = currentPhase;
  let nextTurn = currentTurn + 1;
  let choices: { value: string; label: string }[] | undefined;

  if (currentPhase === "point_a") {
    if (currentTurn >= POINT_A_PROMPTS.length) {
      nextPhase = "point_b";
      nextTurn = 1;
    }
  } else if (currentPhase === "point_b") {
    if (currentTurn >= POINT_B_PROMPTS.length) {
      nextPhase = "clarify";
      nextTurn = 1;
    }
  } else if (currentPhase === "clarify") {
    nextPhase = "choice";
    nextTurn = 0;
    choices = CHOICES;
  } else if (currentPhase === "choice") {
    const choice = message.trim().toLowerCase();
    const routedTo = CHOICES.find((c) => c.value === choice)?.value || "free_diagnosis";

    await supabase
      .from("problem_diagnosis_sessions")
      .update({
        routed_to: routedTo,
        session_log: [
          ...updatedLog,
          { role: "agent", text: message, phase: "choice", turn: 0 },
        ],
      })
      .eq("id", session.id);

    return buildState(session, "choice", 0, true, routedTo);
  }

  let prompt = "";

  if (claudeConfigured()) {
    try {
      const messages = toLlmMessages(updatedLog);
      prompt = await callClaude(messages, PROBLEM_DIAGNOSIS_SYSTEM_PROMPT, { max_tokens: 512 });
    } catch (err) {
      console.error("[problem_diagnosis] Claude call failed, using fallback:", err);
      prompt = getFallbackPrompt(nextPhase, nextTurn);
    }
  } else {
    prompt = getFallbackPrompt(nextPhase, nextTurn);
  }

  const agentLog = [...updatedLog, { role: "agent", text: prompt, phase: nextPhase, turn: nextTurn }];

  await supabase
    .from("problem_diagnosis_sessions")
    .update({ session_log: agentLog })
    .eq("id", session.id);

  return buildState(session, nextPhase, nextTurn, false, undefined, prompt, choices);
}

function buildState(
  session: ProblemDiagnosisSessionRow,
  phase: ProblemPhase,
  turn: number,
  completed = false,
  routedTo?: string,
  prompt?: string,
  choices?: { value: string; label: string }[]
): ProblemState {
  if (!prompt) {
    if (phase === "point_a") {
      prompt = POINT_A_PROMPTS[Math.min(turn - 1, POINT_A_PROMPTS.length - 1)];
    } else if (phase === "point_b") {
      prompt = POINT_B_PROMPTS[Math.min(turn - 1, POINT_B_PROMPTS.length - 1)];
    } else if (phase === "clarify") {
      prompt = CLARIFY_PROMPT;
    }
  }

  return {
    sessionId: session.id,
    phase,
    prompt: prompt || "",
    choices: phase === "choice" ? choices : undefined,
    completed,
    routedTo,
  };
}

export async function getProblemPhaseTitle(phase: ProblemPhase): Promise<string> {
  const titles: Record<ProblemPhase, string> = {
    point_a: "Точка А — что происходит сейчас",
    point_b: "Точка Б — идеальный результат",
    clarify: "Проверяю, правильно ли понял",
    choice: "Что дальше?",
  };
  return titles[phase];
}
