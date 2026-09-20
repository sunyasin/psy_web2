"use server";

import { getSupabaseServerClient } from "@/lib/supabase";
import { callClaude, claudeConfigured } from "@/lib/claude";
import type { Idea } from "@/lib/types";

export interface LastSessionMessage {
  role: "user" | "assistant";
  text: string;
}

export interface LastSessionSummary {
  sessionId: string;
  status: string;
  currentBlock: number;
  answerCount: number;
  completed: boolean;
  keyThemes: string[];
  profileSnapshot?: any;
  ideas?: Idea[];
}

export async function loadLastSessionSummary(clientUuid: string): Promise<LastSessionSummary | null> {
  const supabase = getSupabaseServerClient();

  const { data: session, error: sessionError } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("client_uuid", clientUuid)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (sessionError || !session) {
    return null;
  }

  const answers = (session.answers as Record<string, Record<string, string>>) || {};
  const flatAnswers = Object.values(answers)
    .filter((block) => typeof block === "object" && block !== null && block !== (answers as any).block4_trigger)
    .flatMap((block) => {
      if (block === (answers as any).block4_trigger) return [];
      return Object.values(block as Record<string, string>);
    });

  const answerCount = flatAnswers.length;
  const profileText = flatAnswers.join(" ").toLowerCase();
  const keyThemes = extractThemes(profileText);

  let profileSnapshot: any = null;
  const { data: snapshot } = await supabase
    .from("profile_snapshots")
    .select("*")
    .eq("client_uuid", clientUuid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapshot) {
    profileSnapshot = snapshot.data;
  }

  let ideas: Idea[] = [];
  const { data: analysis } = await supabase
    .from("interview_analyses")
    .select("ideas")
    .eq("client_uuid", clientUuid)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (analysis?.ideas && Array.isArray(analysis.ideas)) {
    ideas = analysis.ideas.slice(0, 5);
  }

  return {
    sessionId: session.id,
    status: session.status,
    currentBlock: session.current_block,
    answerCount,
    completed: session.status === "completed",
    keyThemes,
    profileSnapshot,
    ideas,
  };
}

export async function submitLastSessionMessage(
  clientUuid: string,
  message: string,
  history: LastSessionMessage[]
): Promise<LastSessionMessage> {
  const supabase = getSupabaseServerClient();

  const { data: session, error: sessionError } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("client_uuid", clientUuid)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (sessionError || !session) {
    throw new Error("No interview session found");
  }

  const answers = (session.answers as Record<string, Record<string, string>>) || {};
  const flatAnswers = Object.values(answers)
    .filter((block) => typeof block === "object" && block !== null && block !== (answers as any).block4_trigger)
    .flatMap((block) => {
      if (block === (answers as any).block4_trigger) return [];
      return Object.values(block as Record<string, string>);
    });

  const profileText = flatAnswers.join(" ").toLowerCase();
  const keyThemes = extractThemes(profileText);
  const themesText = keyThemes.length > 0 ? keyThemes.join(", ") : "общие вопросы о жизни и целях";

  const systemPrompt = `Ты — "друг-советчик, вторая голова". Ты говоришь по-русски. У тебя есть контекст последней сессии интервью этого пользователя.

Темы, которые всплыли в интервью: ${themesText}.
Всего ответов: ${flatAnswers.length}.

Твоя задача:
1. Кратко напомнить, о чём была последняя сессия (1-2 предложения).
2. Отвечать на вопросы пользователя, опираясь на его ответы из интервью.
3. Если пользователь говорит, что хочет поработать с целью — направляй его на страницу /goals.
4. Говори коротко, тёпло, по делу. Не давай лекций.
5. Если вопрос выходит за рамки контекста сессии — честно скажи, что у тебя есть только контекст интервью, и предложи перейти к /goals или /problem для более глубокой работы.`;

  const llmMessages = history.map((m) => ({
    role: (m.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
    text: m.text,
  }));

  let responseText: string;
  if (claudeConfigured()) {
    try {
      responseText = await callClaude(llmMessages, systemPrompt, { max_tokens: 1024, temperature: 0.7 });
    } catch (err) {
      console.error("[last_session] Claude call failed, using fallback:", err);
      responseText = getFallbackResponse(message, history);
    }
  } else {
    responseText = getFallbackResponse(message, history);
  }

  return { role: "assistant", text: responseText };
}

function extractThemes(text: string): string[] {
  const themes: { theme: string; count: number }[] = [
    { theme: "работа / проекты", count: (text.match(/\b(проект|работа|задача|бизнес)\b/g) || []).length },
    { theme: "отношения / люди", count: (text.match(/\b(люди|отношения|семья|друзья|общение)\b/g) || []).length },
    { theme: "деньги / доход", count: (text.match(/\b(деньги|доход|зарплата|оплата|бюджет)\b/g) || []).length },
    { theme: "здоровье / энергия", count: (text.match(/\b(здоровье|сон|усталость|энергия|спорт)\b/g) || []).length },
    { theme: "саморазвитие / навыки", count: (text.match(/\b(навык|изучать|учиться|развитие|курс)\b/g) || []).length },
    { theme: "смысл / призвание", count: (text.match(/\b(смысл|призвание|цель|мечта|важно)\b/g) || []).length },
  ];

  return themes
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((t) => t.theme);
}

function getFallbackResponse(message: string, history: LastSessionMessage[]): string {
  const lower = message.toLowerCase();

  if (history.length === 0) {
    return "Привет! Я помню твою последнюю сессию интервью. Хочешь обсудить что-то конкретное из ответов или просто подвести промежуточные итоги?";
  }

  if (lower.includes("цель") || lower.includes("цели") || lower.includes("хочу") || lower.includes("планирую")) {
    return "Кажется, ты хочешь поработать с целями. Лучше всего для этого подходит страница /goals — там можно выбрать идеи из интервью и превратить их в конкретные цели.";
  }

  if (lower.includes("проблема") || lower.includes("трудность") || lower.includes("не получается")) {
    return "Если есть конкретная проблема, которая требует разбора — рекомендую перейти на /problem. Там мы можем разобрать точку А и точку Б.";
  }

  if (lower.includes("область") || lower.includes("домен") || lower.includes("отношения") || lower.includes("деньги") || lower.includes("здоровье")) {
    return "Если хочешь поработать с конкретной областью жизни — переходи на /domain-screening. Там короткий скрининг по 6 доменам.";
  }

  return "Понял. Если хочешь глубже поработать с тем, что всплыло в интервью — переходи на /goals для целеполагания или /problem для разбора конкретной ситуации.";
}
