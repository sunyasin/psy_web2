import type { ShortAnalysisResult, ShortAnalysisStrategy, ShortAnalysisStep } from "@/lib/types";

/** Маркер декомпозиции в interview_analyses.kind. */
export const DECOMPOSITION_KIND = "goal_decomposition";

/**
 * Временная копия парсера ответа модели из app/api/short-analysis/route.ts.
 * Существующие роуты намеренно не рефакторились — при согласовании выбрано их не трогать.
 * При следующем рефакторинге вынести в lib/shortAnalysis.ts.
 */

export type DecomposeStep = ShortAnalysisStep;

export type DecomposeStrategy = {
  id: string;
  idea_index: number;
  strategy_index: number;
  title: string;
  steps: DecomposeStep[];
};

export type DecomposeIdea = {
  id: string;
  idea_index: number;
  title: string;
  description: string | null;
  strategies: DecomposeStrategy[];
};

export type DecomposeAnalysis = {
  id: string;
  goal_answer: string | null;
  answer_count: number;
  created_at: string;
};

/** Идея декомпозиции, для которой в планировщике уже есть этапы. */
export type PlannedIdeaInfo = {
  title: string;
  stageCount: number;
};

export type DecomposePayload = {
  analysis: DecomposeAnalysis | null;
  ideas: DecomposeIdea[];
  /** Заполняется только когда analysis != null. */
  plannedIdeas: PlannedIdeaInfo[];
};

const STRATEGY_KEYS = ["strategies", "Стратегии", "plan", "план", "steps", "шаги"];
const STRATEGY_NAME_KEYS = ["name", "title", "название", "имя", "стратегия"];
const STEP_TITLE_KEYS = ["title", "step", "name", "название", "задача", "шаг", "действие"];
const STEP_DAYS_KEYS = ["estimated_days", "days", "срок", "дней", "duration", "estimate"];
const STEP_DESCRIPTION_KEYS = ["description", "detail", "details", "описание", "пояснение"];

function readString(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readDays(source: Record<string, unknown>): number {
  for (const key of STEP_DAYS_KEYS) {
    const value = source[key];
    const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.min(Math.round(parsed), 3650);
  }
  return 0;
}

function readSteps(source: unknown): ShortAnalysisStep[] {
  if (typeof source === "string") {
    const lines = source
      .split(/\r?\n|(?<=[.;])\s+/)
      .map((line) => line.replace(/^[\s\-–—•*\d.)\]]+/, "").trim())
      .filter(Boolean);
    const items = lines.length > 0 ? lines : [source.trim()];
    return items.map((text, index) => ({
      step: index + 1,
      title: text.length > 80 ? `${text.slice(0, 80).trim()}…` : text,
      description: text,
      estimated_days: 0,
    }));
  }
  if (!Array.isArray(source)) return [];

  return source.flatMap((rawStep, index) => {
    if (typeof rawStep === "string") {
      const text = rawStep.trim();
      if (!text) return [];
      return [{
        step: index + 1,
        title: text.length > 80 ? `${text.slice(0, 80).trim()}…` : text,
        description: text,
        estimated_days: 0,
      }];
    }
    if (!rawStep || typeof rawStep !== "object") return [];
    const step = rawStep as Record<string, unknown>;
    const title = readString(step, STEP_TITLE_KEYS);
    if (!title) return [];
    return [{
      step: index + 1,
      title,
      description: readString(step, STEP_DESCRIPTION_KEYS),
      estimated_days: readDays(step),
    }];
  });
}

function stepsFromDescription(description: string): ShortAnalysisStep[] {
  const sentences = description
    .split(/(?<=[.!?…])\s+/)
    .map((sentence) => sentence.replace(/^[\s•*\-–—]+/, "").trim())
    .filter((sentence) => sentence.length > 15);

  const picked = (sentences.length > 0 ? sentences : [description.trim()])
    .slice(0, 5)
    .filter(Boolean);

  return picked.map((text, index) => ({
    step: index + 1,
    title: text.length > 80 ? `${text.slice(0, 80).trim()}…` : text,
    description: text,
    estimated_days: index === 0 ? 3 : 7,
  }));
}

export function normalizeStrategies(value: unknown): ShortAnalysisResult[] {
  const rawList = Array.isArray(value)
    ? value
    : (() => {
        if (value && typeof value === "object") {
          const container = value as Record<string, unknown>;
          for (const key of ["ideas", "идеи", "strategies", "Стратегии", "results", "data"]) {
            if (Array.isArray(container[key])) return container[key];
          }
        }
        return [value];
      })();

  const result: ShortAnalysisResult[] = [];

  for (const rawIdea of rawList) {
    if (!rawIdea || typeof rawIdea !== "object") continue;
    const idea = rawIdea as Record<string, unknown>;
    const title = readString(idea, ["title", "name", "заголовок", "идея", "тема"]);
    const description = readString(idea, ["description", "описание", "detail", "details", "текст"]);
    if (!title && !description) continue;

    const ideaStrategies: ShortAnalysisStrategy[] = [];

    for (const key of STRATEGY_KEYS) {
      const strategySource = idea[key];
      if (!strategySource || typeof strategySource !== "object") continue;

      if (Array.isArray(strategySource)) {
        const firstObject = strategySource.find(
          (item) => item && typeof item === "object" && !Array.isArray(item)
        ) as Record<string, unknown> | undefined;
        const hasNamedStrategies = firstObject && "steps" in firstObject && Array.isArray(firstObject.steps);

        if (hasNamedStrategies) {
          for (const strat of strategySource) {
            if (!strat || typeof strat !== "object") continue;
            const stratObj = strat as Record<string, unknown>;
            const stratName = readString(stratObj, STRATEGY_NAME_KEYS);
            const stratSteps = readSteps(stratObj.steps);
            if (stratSteps.length > 0) {
              ideaStrategies.push({
                name: stratName || `Стратегия ${ideaStrategies.length + 1}`,
                steps: stratSteps,
              });
            }
          }
        } else {
          const steps = readSteps(strategySource);
          if (steps.length > 0) {
            const named = firstObject ? readString(firstObject, STRATEGY_NAME_KEYS) : "";
            ideaStrategies.push({
              name: named || readString(idea, STRATEGY_NAME_KEYS) || `Стратегия ${ideaStrategies.length + 1}`,
              steps,
            });
          }
        }
        continue;
      }

      for (const [name, stepsSource] of Object.entries(strategySource as Record<string, unknown>)) {
        const steps = readSteps(stepsSource);
        if (steps.length > 0) {
          ideaStrategies.push({ name: name.trim() || `Стратегия ${ideaStrategies.length + 1}`, steps });
        }
      }
    }

    if (ideaStrategies.length === 0 && description) {
      const steps = stepsFromDescription(description);
      if (steps.length > 0) {
        ideaStrategies.push({ name: "Пошаговый план", steps });
      }
    }

    if (ideaStrategies.length === 0) continue;

    result.push({ title: title || description.slice(0, 60), description, strategies: ideaStrategies });
  }

  return result.slice(0, 5);
}

export function parseModelResponse(response: string): unknown {
  return JSON.parse(response.replace(/```json\n?|\n?```/g, "").trim());
}

export function extractStrategiesFromModelJson(modelJson: unknown): ShortAnalysisResult[] {
  if (!modelJson) return [];
  const container = modelJson as Record<string, unknown>;

  if (typeof container.raw_response === "string") {
    try {
      return normalizeStrategies(parseModelResponse(container.raw_response));
    } catch (err) {
      console.error("[analysis/decompose] Failed to parse model_json raw_response:", err);
    }
  }

  if (Array.isArray(container.strategies)) {
    return container.strategies as ShortAnalysisResult[];
  }

  return [];
}

export function toDecomposePayload(
  analysis: Record<string, unknown> | null,
  plannedIdeas: PlannedIdeaInfo[] = []
): DecomposePayload {
  if (!analysis) return { analysis: null, ideas: [], plannedIdeas: [] };

  const id = String(analysis.id);
  const ideas = extractStrategiesFromModelJson(analysis.model_json).map((idea, ideaIndex) => ({
    id: `${id}:${ideaIndex}`,
    idea_index: ideaIndex,
    title: idea.title,
    description: idea.description,
    strategies: idea.strategies.map((strategy, strategyIndex) => ({
      id: `${id}:${ideaIndex}:${strategyIndex}`,
      idea_index: ideaIndex,
      strategy_index: strategyIndex,
      title: strategy.name,
      steps: strategy.steps,
    })),
  }));

  return {
    analysis: {
      id,
      goal_answer: (analysis.goal_answer as string | null) ?? null,
      answer_count: Number(analysis.answer_count) || 0,
      created_at: String(analysis.created_at || ""),
    },
    ideas,
    plannedIdeas,
  };
}

export function generateFallbackStrategies(goalTitle: string): ShortAnalysisResult[] {
  return [{
    title: goalTitle || "Цель и стратегия её достижения",
    description: "Разбейте цель на последовательность проверяемых действий и выберите реалистичный темп.",
    strategies: [{
      name: "Пошаговый эксперимент",
      steps: [
        { step: 1, title: "Сформулировать первый результат", description: "Определить минимальный измеримый результат на ближайшие 7 дней.", estimated_days: 1 },
        { step: 2, title: "Составить план на неделю", description: "Распределить действия по дням и определить время на каждый.", estimated_days: 1 },
        { step: 3, title: "Выполнить и зафиксировать результат", description: "Сделать первый шаг и записать, что получилось.", estimated_days: 7 },
      ],
    }],
  }];
}
