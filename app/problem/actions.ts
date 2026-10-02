"use server";

import { getSupabaseServerClient } from "@/lib/supabase";
import { callClaude, claudeConfigured, LlmMessage } from "@/lib/claude";
import { appendTurn, formatTurnAt, parseTranscript } from "@/lib/transcript";
import {
  detectCbtSignals,
  evaluateCbtSignal,
  ruleConfidence,
  CBT_SUGGEST_CONFIDENCE_THRESHOLD,
  type CbtSignalMatch,
} from "@/lib/cbt-signal";
import type {
  ProblemPhase,
  ProblemState,
  ProblemDiagnosisSessionRow,
  CbtTriggerReason,
  TranscriptTurn,
} from "@/lib/types";

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

/**
 * Развилка, которую агент предлагает, заметив КПТ-сигналы.
 * Переход в КПТ всегда за пользователем — агент только показывает основание.
 */
const CBT_GATE_CHOICES = [
  { value: "cbt_continue", label: "Да, разберём это через КПТ" },
  { value: "stay_conversation", label: "Продолжим просто обсуждать ситуацию" },
];

const REASON_LABELS: Record<string, string> = {
  recurring_pattern_language: "повторяющийся паттерн",
  self_critical_generalization: "категоричные формулировки о себе",
  explicit_fear: "конкретный страх или тревога",
  procrastination_from_fear: "избегание, связанное со страхом",
  pattern_across_contexts: "один паттерн в разных сферах жизни",
  why_i_do_this: "запрос понять, почему ты так делаешь",
};

/** Короткое объяснение, по которому предложен КПТ — "смотри, что я замечаю". */
function buildCbtGatePrompt(reason: CbtTriggerReason, matches: CbtSignalMatch[]): string {
  const label = reason
    ? REASON_LABELS[reason] || "признаки когнитивного паттерна"
    : "признаки когнитивного паттерна";
  const evidence = matches[0]?.evidence;
  const quote = evidence ? ` — «${evidence}»` : "";

  return `Слушай, то, как ты это описываешь${quote}, похоже не на разовую ситуацию, а на паттерн мышления. Я замечаю ${label}. Хочешь, разберём его через КПТ-технику прямо сейчас (бесплатно), или продолжим просто обсуждать саму ситуацию?`;
}

//"друг-советчик, вторая голова"
const PROBLEM_DIAGNOSIS_SYSTEM_PROMPT = `Ты — ассистент по диагностике жизненных проблем. Ты говоришь по-русски. Твоя задача — провести структурированную беседу, чтобы помочь человеку разобраться в своей проблеме.

Флоу сессии:
1. Точка А — разберись, что происходит сейчас. Спроси, в чём именно проблема, своими словами. Если есть что-то, что делает ситуацию особенно сложной — уточни это.
2. Точка Б — представь идеальное решение. Спроси, как бы выглядело идеальное решение, что должно измениться. Если бы решение уже было — что бы человек чувствовал, как бы изменился обычный день?
3. Проверка — кратко подытожь, чтобы убедиться, что правильно понял. Спроси «правильно?» для подтверждения.

После проверки предложи варианты дальнейших действий.

Говори коротко, по делу, тёпло. Задавай по одному вопросу за раз. Не давай лекций. Не ставь диагнозы. Если клиент молчит или говорит «да»/«нет» — задавай конкретный следующий вопрос.`;

/** История беседы для модели. Расшифровка однозначна, а ответ агента может содержать двоеточия. */
function toLlmMessages(turns: TranscriptTurn[]): LlmMessage[] {
  const messages: LlmMessage[] = [];
  for (const turn of turns) {
    if (turn.question) messages.push({ role: "user", text: turn.question });
    if (turn.answer) messages.push({ role: "assistant", text: turn.answer });
  }
  return messages;
}

function withContext(system: string, context: string | null | undefined): string {
  return context ? `${system}\n\n${context}` : system;
}

/** Накопленный диалог целиком — оценщик КПТ-сигналов смотрит на него, а не на последнюю реплику. */
function transcriptFrom(turns: TranscriptTurn[]): string {
  return turns
    .map((t) => `Пользователь: ${t.question}\nАгент: ${t.answer}`)
    .join("\n");
}

/**
 * Проверяет, не пора ли предложить КПТ. Вызывается после каждого ответа
 * пользователя; если пользователь уже отказался, повторно не предлагаем.
 */
async function checkCbtSignal(
  turns: TranscriptTurn[],
  lastUserMessage: string
): Promise<{ suggested: boolean; reason: CbtTriggerReason; matches: CbtSignalMatch[] }> {
  const matches = detectCbtSignals(lastUserMessage);
  if (matches.length === 0) return { suggested: false, reason: null, matches };

  const ruleScore = ruleConfidence(matches);
  if (ruleScore < CBT_SUGGEST_CONFIDENCE_THRESHOLD) {
    return { suggested: false, reason: null, matches };
  }

  // Правила — первый фильтр, модель снимает ложные срабатывания на
  // ситуационных вопросах. Без ключа остаёмся на правилах.
  const verdict = await evaluateCbtSignal(transcriptFrom(turns), matches);
  if (!verdict) {
    return { suggested: true, reason: matches[0].reason, matches };
  }

  if (verdict.continueAs !== "suggest_cbt") {
    return { suggested: false, reason: null, matches };
  }
  if (verdict.confidence < CBT_SUGGEST_CONFIDENCE_THRESHOLD) {
    return { suggested: false, reason: null, matches };
  }

  console.log(
    `[problem_diagnosis] suggesting CBT (${verdict.triggerReason}, confidence ${verdict.confidence})`
  );
  return { suggested: true, reason: verdict.triggerReason || matches[0].reason, matches };
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

/** Контекст сессии — результат анализа саботажа по её цели. */
async function buildSessionContext(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  clientUuid: string,
  goalId?: string
): Promise<string | null> {
  if (!goalId) return null;

  const { data: goalData } = await supabase
    .from("goals")
    .select("conflict_analysis")
    .eq("id", goalId)
    .eq("client_uuid", clientUuid)
    .single();

  if (!goalData?.conflict_analysis) return null;

  return `Контекст: ранее проведён анализ саботажа для этой цели. Вот результат:\n\n${goalData.conflict_analysis}\n\nУчитывайте этот анализ при разговоре с клиентом.`;
}

/**
 * Незакрытая сессия клиента: по цели, если она указана, иначе последняя без цели
 * (вход с главной /intent, где цели ещё нет).
 */
async function findOpenSession(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  clientUuid: string,
  goalId?: string
): Promise<ProblemDiagnosisSessionRow | null> {
  const { data } = await supabase
    .from("problem_diagnosis_sessions")
    .select("*")
    .eq("client_uuid", clientUuid)
    .is("routed_to", null)
    .order("created_at", { ascending: false })
    .limit(10);

  const sessions = data || [];
  const match = goalId
    ? sessions.find((s) => s.goal_id === goalId)
    : sessions.find((s) => !s.goal_id);

  return (match as ProblemDiagnosisSessionRow) || null;
}

export async function startProblemDiagnosis(clientUuid: string, goalId?: string): Promise<ProblemState> {
  const supabase = getSupabaseServerClient();
  const context = await buildSessionContext(supabase, clientUuid, goalId);

  // Продолжаем незакрытую сессию, а не начинаем заново на каждый визит.
  const existing = await findOpenSession(supabase, clientUuid, goalId);

  if (existing) {
    // Контекст мог обновиться (пользователь перезапустил анализ саботажа) —
    // синхронизируем, не затирая беседу.
    if (context && context !== existing.context) {
      const { error } = await supabase
        .from("problem_diagnosis_sessions")
        .update({ context })
        .eq("id", existing.id);
      if (error) throw new Error(error.message || "Failed to update session context");
      existing.context = context;
    }

    return buildState(existing, existing.phase || "point_a", existing.turn || 0);
  }

  const { data, error } = await supabase
    .from("problem_diagnosis_sessions")
    .insert({
      client_uuid: clientUuid,
      goal_id: goalId || null,
      context,
      session_log: "",
      phase: "point_a",
      turn: 0,
      cbt_declined: false,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to start problem diagnosis");
  }

  return buildState(data, "point_a", 0);
}

/**
 * Полная расшифровка беседы по цели. Грузится по кнопке «История», а не при
 * открытии страницы: переписка хранится в БД текстом и в разборе качества
 * диалогов читается человеком, а экран показывает текущий разговор.
 */
export async function loadProblemHistory(
  clientUuid: string,
  goalId?: string
): Promise<TranscriptTurn[]> {
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase
    .from("problem_diagnosis_sessions")
    .select("session_log, goal_id, created_at")
    .eq("client_uuid", clientUuid)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message || "Failed to load problem history");
  }

  const sessions = data || [];
  // Только сессии этой цели. Без goal_id (вход с главной) — все сессии клиента.
  const relevant = goalId ? sessions.filter((s) => s.goal_id === goalId) : sessions;

  // Запрос отдаёт новые сессии первыми, а читать историю нужно в хронологическом
  // порядке: старая беседа → новая.
  const turns: TranscriptTurn[] = [];
  for (const session of [...relevant].reverse()) {
    turns.push(...parseTranscript(session.session_log as string | null));
  }

  return turns;
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

  const history = parseTranscript(session.session_log);
  const currentPhase = session.phase || "point_a";
  const currentTurn = session.turn || 0;
  const context = session.context;

  let nextPhase: ProblemPhase = currentPhase;
  let nextTurn = currentTurn + 1;
  let choices: { value: string; label: string }[] | undefined;

  const previouslyDeclinedCbt = Boolean(session.cbt_declined);

  /** Пишет один ход беседы и состояние сценария. Ошибку не глотаем — потеря переписки хуже падения. */
  const saveTurn = async (answer: string, patch: Record<string, unknown> = {}) => {
    const log = appendTurn(session.session_log, {
      at: formatTurnAt(new Date()),
      question: message,
      answer,
    });
    const { error: updateError } = await supabase
      .from("problem_diagnosis_sessions")
      .update({ ...patch, session_log: log })
      .eq("id", session.id);
    if (updateError) {
      throw new Error(updateError.message || "Failed to save problem diagnosis turn");
    }
    return log;
  };

  if (currentPhase === "cbt_gate") {
    const answer = message.trim().toLowerCase();

    if (answer === "cbt_continue") {
      await saveTurn("Пользователь согласился перейти в КПТ-сессию.", {
        routed_to: "free_diagnosis",
        phase: "cbt_gate",
        turn: 0,
      });
      return buildState(session, "cbt_gate", 0, true, "free_diagnosis");
    }

    // Пользователь выбрал продолжить беседу — возвращаемся в диалог.
    await saveTurn("Пользователь решил продолжить разговор без КПТ.", {
      cbt_declined: true,
      phase: "point_b",
      turn: nextTurn,
    });

    return buildState(session, "point_b", nextTurn, false, undefined, undefined, undefined, {
      cbtDeclined: true,
    });
  }

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
    const matched = CHOICES.find((c) => c.value === choice);
    const routedTo = matched?.value || "free_diagnosis";

    await saveTurn(`Выбрано: ${matched?.label || routedTo}`, {
      routed_to: routedTo,
      phase: "choice",
      turn: 0,
    });

    return buildState(session, "choice", 0, true, routedTo);
  }

  // Непрерывная проверка: если заметили КПТ-сигналы, предлагаем переход
  // вместо обычного продолжения беседы. Один раз за сессию.
  if (!previouslyDeclinedCbt) {
    const signal = await checkCbtSignal(history, message);

    if (signal.suggested) {
      const gatePrompt = buildCbtGatePrompt(signal.reason, signal.matches);

      await saveTurn(gatePrompt, { phase: "cbt_gate", turn: 0 });

      return buildState(session, "cbt_gate", 0, false, undefined, gatePrompt, CBT_GATE_CHOICES, {
        cbtSuggested: true,
        cbtTriggerReason: signal.reason,
      });
    }
  }

  let prompt = "";

  if (claudeConfigured()) {
    try {
      const messages = toLlmMessages([
        ...history,
        { at: "", question: message, answer: "" },
      ]);
      prompt = await callClaude(
        messages,
        withContext(PROBLEM_DIAGNOSIS_SYSTEM_PROMPT, context),
        { max_tokens: 512 }
      );
    } catch (err) {
      console.error("[problem_diagnosis] Claude call failed, using fallback:", err);
      prompt = getFallbackPrompt(nextPhase, nextTurn);
    }
  } else {
    prompt = getFallbackPrompt(nextPhase, nextTurn);
  }

  await saveTurn(prompt, { phase: nextPhase, turn: nextTurn });

  return buildState(session, nextPhase, nextTurn, false, undefined, prompt, choices);
}

function buildState(
  session: ProblemDiagnosisSessionRow,
  phase: ProblemPhase,
  turn: number,
  completed = false,
  routedTo?: string,
  prompt?: string,
  choices?: { value: string; label: string }[],
  extra?: {
    cbtSuggested?: boolean;
    cbtTriggerReason?: CbtTriggerReason;
    cbtDeclined?: boolean;
  }
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
    choices: phase === "choice" || phase === "cbt_gate" ? choices : undefined,
    completed,
    routedTo,
    cbtSuggested: extra?.cbtSuggested,
    cbtTriggerReason: extra?.cbtTriggerReason,
    cbtDeclined: extra?.cbtDeclined,
  };
}

export async function getProblemPhaseTitle(phase: ProblemPhase): Promise<string> {
  const titles: Record<ProblemPhase, string> = {
    point_a: "Точка А — что происходит сейчас",
    point_b: "Точка Б — идеальный результат",
    clarify: "Проверяю, правильно ли понял",
    choice: "Что дальше?",
    cbt_gate: "Что дальше?",
  };
  return titles[phase];
}
