"use server";

import { getSupabaseServerClient } from "@/lib/supabase";
import type { CbtSessionRow, CbtState, CbtMessage, CbtOutcome } from "@/lib/types";
import { callClaude, claudeConfigured, CBT_SYSTEM_PROMPT, getModelUsed } from "@/lib/claude";

/**
 * Острые кризисные сигналы (самоубийство / самоповреждение).
 * Приоритет выше любого продуктового шага — сразу выдаём кризисные ресурсы
 * и эскалируем.
 */
const CRISIS_KEYWORDS = [
  "самоубийств",
  "суицид",
  "убить",
  "покончить",
  "не хочу жить",
  "нет смысла",
  "попытка",
];

/**
 * Темы вне компетенции коучинга/КПТ (травма, насилие, зависимость,
 * психоактивные вещества). Требуют рекомендации платной консультации
 * с человеком, но не являются острым кризисом.
 */
const OUT_OF_SCOPE_KEYWORDS = [
  "травм",
  "насилие",
  "зависимость",
  "наркотик",
  "алкоголь",
];

const CRISIS_RESOURCES = [
  "Если тебе плохо и есть мысли о самоповреждении — ты не один. Прямо сейчас можно позвонить по телефону доверия 8-800-2000-122 (Россия).",
  "Если это острый кризис — обратись к врачу/психологу как можно скорее. Я не заменяю профессиональную помощь.",
];

function detectCrisis(text: string): boolean {
  const lower = text.toLowerCase();
  return CRISIS_KEYWORDS.some((k) => lower.includes(k));
}

function detectOutOfScope(text: string): boolean {
  const lower = text.toLowerCase();
  return OUT_OF_SCOPE_KEYWORDS.some((k) => lower.includes(k));
}

function getCbtResponse(message: string, history: CbtMessage[]): string {
  const lower = message.toLowerCase();

  if (history.length === 0) {
    return `Привет. Я — помощник по КПТ, это не психотерапевт и не замена врачу. 
Мы можем вместе разобрать твою ситуацию здесь и сейчас, но если речь о травме, зависимости или остром кризисе — я рекомендую записаться на сессию с человеком.

С чего начнём? Опиши, что тебя сейчас беспокоит.`;
  }

  if (lower.includes("травм") || lower.includes("насилие") || lower.includes("зависимость") || lower.includes("наркотик") || lower.includes("алкоголь")) {
    return `То, что ты описываешь, выходит за рамки коучинга и КПТ здесь. 
Рекомендую записаться на консультацию со специалистом, который работает с такими темами.`;
  }

  if (detectCrisis(lower)) {
    return `Спасибо, что сказал. ${CRISIS_RESOURCES[0]} ${CRISIS_RESOURCES[1]}

Хочешь, я предложу вариант записи на консультацию с человеком?`;
  }

  if (lower.includes("да") || lower.includes("ага") || lower.includes("хорошо") || lower.includes("готов")) {
    return `Хорошо. Тогда давай разберём по шагам:
1. Что конкретно произошло?
2. Что ты чувствовал в тот момент?
3. Что обычно делаешь в таких ситуациях?
4. Как бы ты хотел поступить в следующий раз?`;
  }

  if (lower.includes("нет") || lower.includes("не хочу") || lower.includes("не сейчас")) {
    return `Понял, нажимаю паузу. Если захочешь вернуться — пиши.`;
  }

   return `Понял. Давай разберём это подробнее:
- Что именно в этой ситуации тебя беспокоит больше всего?
- Какая мысль приходит первой?
- Что ты обычно делаешь, когда это происходит?`;
}

/**
 * Шаблонный fallback (graceful degradation), когда Claude недоступен
 * (ANTHROPIC_API_KEY не задан). Гарантирует, что прототип работает без ключа.
 */
const FALLBACK_RESPONSE = getCbtResponse;

/**
 * Маппинг истории сессии на формат, ожидаемый Claude (agent → assistant).
 */
function toLlmMessages(history: CbtMessage[]) {
  return history.map((m): { role: "assistant" | "user"; text: string } => ({
    role: m.role === "agent" ? "assistant" : "user",
    text: m.text,
  }));
}

/**
 * Живой ответ от Claude с fallback на шаблоны, если API-ключ не настроен.
 * `history` — полная история включая последнее пользовательское сообщение.
 * Жёсткие safety-чеки (кризис / зоны вне компетенции) выполняются
 * вызывающим кодом до этой функции — Claude получает «чистый» диалог.
 */
async function getAgentResponse(
  history: CbtMessage[],
  userMessage: string,
  domain?: string
): Promise<string> {
  // Шаблонный fallback (graceful degradation), когда Claude недоступен.
  if (!claudeConfigured()) {
    console.log("[cbt_session_agent] using template fallback (no ANTHROPIC_API_KEY)");
    return FALLBACK_RESPONSE(userMessage, history);
  }

  const scope = domain ? `Тема сессии: ${domain}. ` : "";
  const system = scope + CBT_SYSTEM_PROMPT;
  const messages = toLlmMessages(history);

  try {
    return await callClaude(messages, system);
  } catch (err) {
    console.error("[cbt_session_agent] Claude call failed, falling back to template:", err);
    return FALLBACK_RESPONSE(userMessage, history);
  }
}

/**
 * Первичный ответ агента в начале сессии (приветствие + контекст).
 */
async function getFirstResponse(domain?: string): Promise<string> {
  if (!claudeConfigured()) {
    return getCbtResponse("", []);
  }

  const scope = domain ? `Тема сессии: ${domain}. ` : "";
  const messages = [
    {
      role: "user" as const,
      text: `${scope}Кратко поприветствуй клиента, напомни, что это не психотерапия и не замена врачу. Если речь о травме/зависимости/остром кризисе — сразу выдай кризисные ресурсы и рекомендацию платной консультации. Затем спроси, с чего начнём.`,
    },
  ];

  try {
    return await callClaude(messages, CBT_SYSTEM_PROMPT, { max_tokens: 384 });
  } catch (err) {
    console.error("[cbt_session_agent] Claude first-response failed, falling back to template:", err);
    return getCbtResponse("", []);
  }
}

export async function startCbtSession(clientUuid: string, relatedFlagId?: string, domain?: string): Promise<CbtState> {
  const supabase = getSupabaseServerClient();
  const firstMessage: CbtMessage = {
    role: "agent",
    text: await getFirstResponse(domain),
    timestamp: new Date().toISOString(),
  };
  const sessionLog: CbtMessage[] = [firstMessage];

  const { data, error } = await supabase
    .from("cbt_sessions")
    .insert({
      client_uuid: clientUuid,
      related_flag_id: relatedFlagId || null,
      domain: domain || null,
      session_log: sessionLog,
      outcome: null,
      model_used: claudeConfigured() ? getModelUsed() : "stub-template",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Failed to start CBT session");
  }

  return {
    sessionId: data.id,
    messages: sessionLog,
    completed: false,
    crisisDetected: false,
  };
}

export async function submitCbtMessage(clientUuid: string, sessionId: string, message: string): Promise<CbtState> {
  const supabase = getSupabaseServerClient();
  const { data: session, error } = await supabase
    .from("cbt_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("client_uuid", clientUuid)
    .single();

  if (error || !session) {
    throw new Error(error?.message || "CBT session not found");
  }

  const log = Array.isArray(session.session_log) ? session.session_log : [];
  const userMessage: CbtMessage = {
    role: "user",
    text: message,
    timestamp: new Date().toISOString(),
  };
  const updatedLog = [...log, userMessage];

  const crisisDetected = detectCrisis(message);
  const outOfScope = detectOutOfScope(message);
  let outcome: CbtOutcome | null = session.outcome;

  // Hard safety gates (приоритет выше LLM): кризис или тема вне компетенции.
  let agentText: string;
  if (crisisDetected) {
    outcome = "escalated";
    console.log("[cbt_session_agent] HARD GATE: crisis keywords detected, escalating");
    agentText = `Спасибо, что сказал. ${CRISIS_RESOURCES[0]} ${CRISIS_RESOURCES[1]}

Хочешь, я предложу вариант записи на консультацию с человеком?`;
  } else if (outOfScope) {
    console.log("[cbt_session_agent] HARD GATE: out-of-scope keywords detected, recommending human");
    agentText = `То, что ты описываешь, выходит за рамки коучинга и КПТ здесь.
Рекомендую записаться на консультацию со специалистом, который работает с такими темами.`;
  } else {
    agentText = await getAgentResponse(updatedLog, message, session.domain);
  }
  const agentMessage: CbtMessage = {
    role: "agent",
    text: agentText,
    timestamp: new Date().toISOString(),
  };
  const finalLog = [...updatedLog, agentMessage];

  const { error: updateError } = await supabase
    .from("cbt_sessions")
    .update({
      session_log: finalLog,
      outcome: outcome,
    })
    .eq("id", sessionId);

  if (updateError) {
    throw new Error(updateError.message || "Failed to save CBT message");
  }

  return {
    sessionId,
    messages: finalLog,
    completed: false,
    outcome: outcome || undefined,
    crisisDetected,
  };
}

export async function completeCbtSession(clientUuid: string, sessionId: string, outcome: CbtOutcome): Promise<void> {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase
    .from("cbt_sessions")
    .update({ outcome })
    .eq("id", sessionId)
    .eq("client_uuid", clientUuid);

  if (error) {
    throw new Error(error.message || "Failed to complete CBT session");
  }
}
