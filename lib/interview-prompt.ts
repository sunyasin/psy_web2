import { getSupabaseServerClient } from "@/lib/supabase";
import type { InterviewQuestion } from "@/lib/types";

export type AnswerItem = {
  block: string;
  order: string;
  answer: string;
  interviewId?: string | null;
};

export type NumberedAnswer = AnswerItem & {
  number: number;
  question: string | null;
};

export type QuestionIndex = Map<string, Map<string, string>>;

const NON_BLOCK_KEY = "block4_trigger";

/**
 * Разворачивает interview_sessions.answers ({ "<block>": { "<order>": "<text>" } })
 * в плоский список ответов, пропуская служебный ключ block4_trigger.
 */
export function flattenAnswers(answers: unknown, interviewId?: string | null): AnswerItem[] {
  if (!answers || typeof answers !== "object") return [];

  const items: AnswerItem[] = [];

  for (const [block, blockAnswers] of Object.entries(answers as Record<string, unknown>)) {
    if (block === NON_BLOCK_KEY) continue;
    if (!blockAnswers || typeof blockAnswers !== "object" || Array.isArray(blockAnswers)) continue;

    for (const [order, text] of Object.entries(blockAnswers as Record<string, unknown>)) {
      if (typeof text !== "string" || !text.trim()) continue;
      items.push({ block, order, answer: text.trim(), interviewId: interviewId ?? null });
    }
  }

  return items;
}

/**
 * Загружает тексты вопросов из interview_config для указанных интервью.
 * Индекс: interview_id -> "<block>.<order>" -> текст вопроса.
 */
export async function loadQuestionIndex(
  interviewIds: Array<string | null | undefined>
): Promise<QuestionIndex> {
  const index: QuestionIndex = new Map();
  const ids = [
    ...new Set(interviewIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
  ];

  if (ids.length === 0) return index;

  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("interview_config")
    .select("interview_id, block_number, questions")
    .in("interview_id", ids)
    .eq("active", true);

  for (const row of data || []) {
    const interviewId = String(row.interview_id);
    const block = String(row.block_number);
    const questions = Array.isArray(row.questions)
      ? (row.questions as InterviewQuestion[])
      : [];

    const blocks = index.get(interviewId) || new Map<string, string>();
    for (const question of questions) {
      if (!question || typeof question.text !== "string" || !question.text.trim()) continue;
      blocks.set(`${block}.${question.order}`, question.text.trim());
    }
    index.set(interviewId, blocks);
  }

  return index;
}

export function resolveQuestion(
  index: QuestionIndex,
  interviewId: string | null | undefined,
  block: string,
  order: string
): string | null {
  const key = `${block}.${order}`;

  const own = interviewId ? index.get(interviewId) : undefined;
  const ownQuestion = own?.get(key);
  if (ownQuestion) return ownQuestion;

  for (const blocks of index.values()) {
    const question = blocks.get(key);
    if (question) return question;
  }

  return null;
}

/** Пронумеровывает ответы и подставляет к каждому текст вопроса. */
export function numberAnswers(items: AnswerItem[], index: QuestionIndex): NumberedAnswer[] {
  return items.map((item, i) => ({
    ...item,
    number: i + 1,
    question: resolveQuestion(index, item.interviewId, item.block, item.order),
  }));
}

/** «Вопрос N (блок B, № O): текст» + «Ответ N: текст» для каждого ответа. */
export function formatNumberedQA(answers: NumberedAnswer[]): string {
  return answers
    .map(
      ({ number, block, order, question, answer }) =>
        `Вопрос ${number} (блок ${block}, № ${order}): ${question || "[текст вопроса недоступен]"}\nОтвет ${number}: ${answer}`
    )
    .join("\n\n");
}
