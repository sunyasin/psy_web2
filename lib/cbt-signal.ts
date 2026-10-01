/**
 * Детектор КПТ-сигналов для problem_diagnosis_agent.
 *
 * Задача — НЕ решать заранее «дружеская беседа или КПТ», а вовремя заметить в
 * разговоре признаки когнитивного искажения и предложить пользователю перейти
 * в КПТ-формат. Решение остаётся за пользователем.
 *
 * Работает по тому же принципу, что `detectSabotageRules` в
 * app/api/analysis/sabotage/route.ts: правила, а не LLM. LLM-оценка
 * (`evaluateCbtSignal`) работает поверх и уточняет вес/уверенность.
 */
import type { CbtTriggerReason } from "@/lib/types";
import { callClaude, claudeConfigured } from "@/lib/claude";

export interface CbtSignalRule {
  reason: Exclude<CbtTriggerReason, null>;
  keywords: string[];
  /** Насколько сильный сигнал сам по себе, 0..1. */
  weight: number;
  description: string;
}

/**
 * Критерии перехода из дружеской беседы в КПТ.
 * Ситуационные вопросы («что делать с X») сюда намеренно не попали —
 * они держат беседу, а не переводят её в КПТ.
 */
export const CBT_SIGNAL_RULES: CbtSignalRule[] = [
  {
    reason: "self_critical_generalization",
    keywords: [
      "я всегда",
      "я никогда",
      "я всегда так",
      "я такой человек",
      "я по натуре",
      "я ничего не умею",
      "у меня никогда",
      "я так и не",
      "мне никогда не удавалось",
      "я по натуре не",
    ],
    weight: 0.8,
    description: "Генерализация о себе вместо описания ситуации",
  },
  {
    reason: "recurring_pattern_language",
    keywords: [
      "опять то же",
      "в который раз",
      "в какой раз",
      "опять",
      "снова то же самое",
      "постоянно",
      "каждый раз",
      "это повторяется",
      "снова",
    ],
    weight: 0.6,
    description: "Повторяющийся паттерн, а не разовый эпизод",
  },
  {
    reason: "explicit_fear",
    keywords: [
      "боюсь",
      "боязнь",
      "страх",
      "тревога",
      "тревож",
      "фобия",
      "паническ",
      "мешает действовать",
      "страшно",
    ],
    weight: 0.6,
    description: "Конкретный страх или тревога, мешающие действовать",
  },
  {
    reason: "procrastination_from_fear",
    keywords: [
      "саботирую",
      "саботаж",
      "прокрастинирую",
      "откладываю",
      "избегаю",
      "не начинаю",
      "не могу начать",
    ],
    weight: 0.5,
    description: "Избегание или прокрастинация (в сочетании со страхом — КПТ)",
  },
  {
    reason: "why_i_do_this",
    keywords: [
      "почему я так",
      "хочу понять почему",
      "почему всегда",
      "из-за чего я",
      "откуда это",
      "почему же я",
      "хочу разобраться почему",
    ],
    weight: 0.7,
    description: "Запрос на разбор причины, а не на стратегию",
  },
];

/**
 * Ситуационные формулировки — удерживают разговор в дружеской беседе.
 * Если сработали они, а КПТ-сигналы слабые, предлагать КПТ не нужно.
 */
const SITUATIONAL_KEYWORDS = [
  "что делать",
  "как решить",
  "как начать",
  "не понимаю как",
  "как лучше",
  "посоветуй",
  "подскажи",
  "как справиться с",
  "как улучшить",
  "как масштабировать",
  "нужен совет",
  "как выбрать",
];

/**
 * Объяснение поведения нехваткой ресурсов, а не страхом.
 * По ТЗ прокрастинация от дефицита времени — это НЕ сигнал КПТ. Такое
 * объяснение снимает «опять откладываю», но не снимает сигналов про мышление:
 * генерализация, страх и запрос «почему я так» остаются в силе.
 */
const RESOURCE_PRESSURE_KEYWORDS = [
  /времени\s+(просто\s+|не\s+|ведь\s+)?(мало|нет|не хватает)/,
  /(мало|нет)\s+времени/,
  /времени\s+не\s+хватает/,
  /не хватает\s+(времени|ресурс)/,
  /загружен/,
  /много работы/,
  /нет сил/,
  /нет ресурс/,
  /завал/,
  /не успеваю/,
];

/** Сигналы, которые объясняются нехваткой ресурсов, а не когнитивным паттерном. */
const RESOURCE_EXPLAINED_REASONS = new Set<string>([
  "recurring_pattern_language",
  "procrastination_from_fear",
]);

export interface CbtSignalMatch {
  reason: Exclude<CbtTriggerReason, null>;
  description: string;
  /** Фрагмент реплики, на которой сработало правило. */
  evidence: string;
  /** Вес сигнала 0..1. */
  weight: number;
}

/**
 * Правиловый детектор. Возвращает список сработавших правил, отсортированный
 * по весу. Пустой массив — сигналов нет, продолжаем дружескую беседу.
 */
export function detectCbtSignals(text: string): CbtSignalMatch[] {
  const lower = text.toLowerCase().trim();
  if (!lower) return [];

  const matches: CbtSignalMatch[] = [];
  const hasResourcePressure = RESOURCE_PRESSURE_KEYWORDS.some((k) => k.test(lower));

  for (const rule of CBT_SIGNAL_RULES) {
    const hit = rule.keywords.find((k) => lower.includes(k));
    if (!hit) continue;
    // Поведение, объяснённое нехваткой ресурсов, — не когнитивный паттерн.
    if (hasResourcePressure && RESOURCE_EXPLAINED_REASONS.has(rule.reason)) continue;
    matches.push({
      reason: rule.reason,
      description: rule.description,
      evidence: hit,
      weight: rule.weight,
    });
  }

  if (matches.length === 0) return [];

  // Ситуационный вопрос при единственном слабом сигнале — это «что делать с X»,
  // а не запрос на разбор паттерна. Не предлагаем КПТ.
  const isSituational = SITUATIONAL_KEYWORDS.some((k) => lower.includes(k));
  if (isSituational && matches.length === 1 && matches[0].weight < 0.6) {
    return [];
  }

  return matches.sort((a, b) => b.weight - a.weight);
}

/** Порог уверенности, выше которого предлагаем КПТ пользователю. */
export const CBT_SUGGEST_CONFIDENCE_THRESHOLD = 0.5;

/** Уверенность по одному лишь правиловому совпадению, без учёта нескольких сигналов. */
export function ruleConfidence(matches: CbtSignalMatch[]): number {
  if (matches.length === 0) return 0;
  // Совпадения по разным причинам не суммируются в «доказанный» диагноз —
  // берём лучший сигнал и небольшой бонус за независимые подтверждения.
  const best = matches[0].weight;
  const bonus = Math.min(0.15, (matches.length - 1) * 0.05);
  return Math.min(1, best + bonus);
}

const SIGNAL_EVALUATOR_PROMPT = `Ты — оценщик сигналов КПТ в диалоге коуча. Ты говоришь по-русски.

Твоя задача — решить, стоит ли предложить пользователю перейти из дружеской беседы в КПТ-формат. Верни ТОЛЬКО JSON без markdown и пояснений.

Сигналы, при которых КПТ уместен:
- Генерализация о себе: «я всегда так», «я такой человек», «у меня никогда не получается» — когнитивное искажение, а не ситуация.
- Повторяющийся паттерн: «опять то же», «в который раз», «каждый раз» — не разовый эпизод.
- Конкретный страх или тревога, мешающие действовать.
- Избегание или прокрастинация, связанные со страхом, а не с нехваткой времени.
- Один и тот же паттерн проявляется в 2+ разных сферах жизни.
- Запрос сформулирован как «хочу понять, почему я так делаю», а не «что мне делать».

Сигналы, при которых остаёмся в дружеской беседе:
- Ситуационная, фактическая проблема: «что делать с X», «как масштабировать проект».
- Разовoe упоминание без эмоционального заряда.

Правила:
- Учитывай ВЕСЬ накопленный диалог, а не только последнюю реплику.
- Если пользователь описал конкретную практическую задачу — не предлагай КПТ, даже если есть слова из списка.
- Не выдумывай сигналы. Нет оснований — continue_as = "friendly_conversation".
- confidence: 0.0..1.0. Ниже 0.5 — не предлагать КПТ.
- trigger_reason — строго одно из перечисленных значений или null.`;

export interface CbtVerdict {
  continueAs: "friendly_conversation" | "suggest_cbt";
  triggerReason: CbtTriggerReason;
  confidence: number;
}

const VALID_REASONS = new Set<CbtTriggerReason>([
  null,
  "recurring_pattern_language",
  "self_critical_generalization",
  "explicit_fear",
  "procrastination_from_fear",
  "pattern_across_contexts",
  "why_i_do_this",
]);

function parseVerdict(raw: string): CbtVerdict | null {
  // Модель может вернуть JSON в markdown-обёртке — вырезаем первый объект.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const continueAs = obj.continue_as === "suggest_cbt" ? "suggest_cbt" : "friendly_conversation";
  const rawReason = typeof obj.trigger_reason === "string" ? obj.trigger_reason : null;
  const triggerReason = VALID_REASONS.has(rawReason as CbtTriggerReason)
    ? (rawReason as CbtTriggerReason)
    : null;
  const confidence =
    typeof obj.confidence === "number" && Number.isFinite(obj.confidence)
      ? Math.max(0, Math.min(1, obj.confidence))
      : 0;

  return { continueAs, triggerReason, confidence };
}

/**
 * Уточняет правиловый вердикт с помощью модели. Правила — дешёвый первый фильтр,
 * модель снимает ложные срабатывания на ситуационных вопросах.
 * Без ключа или при ошибке возвращает `null` — вызывающий код использует
 * чисто правиловую оценку.
 */
export async function evaluateCbtSignal(
  transcript: string,
  ruleMatches: CbtSignalMatch[]
): Promise<CbtVerdict | null> {
  if (!claudeConfigured()) return null;

  const signals = ruleMatches.length
    ? ruleMatches
        .map((m) => `- ${m.reason} (вес ${m.weight}): сработало на «${m.evidence}» — ${m.description}`)
        .join("\n")
    : "- правила не нашли явных совпадений";

  const prompt = `Диалог с пользователем:
${transcript}

Сработавшие правила:
${signals}

Верни JSON: {"continue_as": "...", "trigger_reason": "...", "confidence": 0.0}`;

  try {
    const raw = await callClaude([{ role: "user", text: prompt }], SIGNAL_EVALUATOR_PROMPT, {
      max_tokens: 300,
    });
    return parseVerdict(raw);
  } catch (err) {
    console.error("[cbt_signal] LLM evaluation failed, using rules only:", err);
    return null;
  }
}