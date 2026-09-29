import type { NewAvoid, NewResource, NewStage, NewStep, NewStrategy, NewSupport, NewTimeToLaunch } from "@/lib/types";

export type ShortResponse = {
  title: string;
  description: string;
  tags: string[];
  stages: NewStage[];
};

const STAGE_NAME_KEYS = ["name", "title", "название", "этап", "идея", "тема"];
const STEP_TITLE_KEYS = ["title", "step", "name", "название", "задача", "шаг", "действие"];
const STEP_DURATION_KEYS = ["duration", "длительность", "срок_текстом"];
const STEP_DAYS_KEYS = ["estimated_days", "days", "дней", "estimate"];
const STEP_DESCRIPTION_KEYS = ["description", "detail", "details", "описание", "пояснение"];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(source: Record<string, unknown> | null, keys: string[]): string {
  if (!source) return "";
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readStringList(source: Record<string, unknown> | null, keys: string[]): string[] {
  if (!source) return [];
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      const items = value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean);
      if (items.length > 0) return items;
    }
    if (typeof value === "string" && value.trim()) return [value.trim()];
  }
  return [];
}

function readNumber(source: Record<string, unknown> | null, keys: string[], fallback = 0): number {
  if (!source) return fallback;
  for (const key of keys) {
    const value = source[key];
    const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.round(parsed));
  }
  return fallback;
}

function readObjectList(source: Record<string, unknown> | null, keys: string[]): Record<string, unknown>[] {
  if (!source) return [];
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) {
      return value.map(asRecord).filter((item): item is Record<string, unknown> => item !== null);
    }
  }
  return [];
}

function parseSteps(source: unknown): NewStep[] {
  const rawSteps = Array.isArray(source)
    ? source
    : Array.isArray(asRecord(source)?.steps)
      ? ((asRecord(source)?.steps ?? []) as unknown[])
      : [];

  return rawSteps.flatMap((rawStep, index) => {
    const step = asRecord(rawStep);
    if (!step) {
      const text = typeof rawStep === "string" ? rawStep.trim() : "";
      if (!text) return [];
      return [{ number: index + 1, title: text, duration: "", estimated_days: 0, description: "" }];
    }
    const title = readString(step, STEP_TITLE_KEYS);
    if (!title) return [];
    return [{
      number: readNumber(step, ["number", "step"], index + 1) || index + 1,
      title,
      duration: readString(step, STEP_DURATION_KEYS),
      estimated_days: readNumber(step, STEP_DAYS_KEYS),
      description: readString(step, STEP_DESCRIPTION_KEYS),
    }];
  });
}

function parseResources(source: Record<string, unknown> | null): NewResource[] {
  return readObjectList(source, ["resources", "ресурсы"]).map((resource, index) => ({
    category: readString(resource, ["category", "категория", "name", "title"]) || `Ресурсы ${index + 1}`,
    items: readStringList(resource, ["items", "пункты", "элементы"]),
    rationale: readString(resource, ["rationale", "обоснование", "description", "описание"]),
  }));
}

function parseSupport(source: Record<string, unknown> | null): NewSupport[] {
  return readObjectList(source, ["support", "поддержка"]).map((support, index) => ({
    who: readString(support, ["who", "кто", "name", "title"]) || `Поддержка ${index + 1}`,
    needed: support.needed === true,
    description: readString(support, ["description", "описание", "detail", "details"]),
  }));
}

function parseTimeToLaunch(source: Record<string, unknown> | null): NewTimeToLaunch {
  const timeToLaunch = asRecord(source?.time_to_launch);
  return {
    days_to_first_step: readNumber(timeToLaunch, ["days_to_first_step", "дней_до_первого_шага"]),
    days_to_result: readNumber(timeToLaunch, ["days_to_result", "дней_до_результата"]),
    note: readString(timeToLaunch, ["note", "заметка", "комментарий", "description", "описание"]),
  };
}

function parseAvoid(source: Record<string, unknown> | null): NewAvoid[] {
  return readObjectList(source, ["avoid", "избегать"]).map((avoid, index) => ({
    rule: readString(avoid, ["rule", "правило", "запрет", "title"]) || `Ограничение ${index + 1}`,
    reason: readString(avoid, ["reason", "причина", "description", "описание"]),
  }));
}

function parseStrategy(raw: unknown): NewStrategy | null {
  const source = asRecord(raw);
  if (!source) return null;
  const name = readString(source, ["name", "title", "название", "стратегия"]);
  const steps = parseSteps(source.steps);
  if (!name || steps.length === 0) return null;
  return {
    name,
    approach: readString(source, ["approach", "подход", "description", "описание"]),
    resources: parseResources(source),
    support: parseSupport(source),
    steps,
    time_to_launch: parseTimeToLaunch(source),
    timeline: readString(source, ["timeline", "сроки", "график"]),
    budget: readString(source, ["budget", "бюджет"]),
    investment: readString(source, ["investment", "вложения", "инвестиции"]),
    avoid: parseAvoid(source),
    assumptions: readStringList(source, ["assumptions", "допущения"]),
  };
}

function parseStage(raw: unknown, index: number): NewStage | null {
  const source = asRecord(raw);
  if (!source) return null;
  const strategies = readObjectList(source, ["strategies", "стратегии", "Стратегии"])
    .map(parseStrategy)
    .filter((item): item is NewStrategy => item !== null);
  if (strategies.length === 0) return null;
  const name = readString(source, STAGE_NAME_KEYS) || `Этап ${readNumber(source, ["number"], index + 1)}`;
  return {
    number: readNumber(source, ["number", "номер"], index + 1) || index + 1,
    name,
    description: readString(source, ["description", "описание", "detail", "details"]),
    strategies,
  };
}

function parseStages(value: unknown): NewStage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(parseStage)
    .filter((item): item is NewStage => item !== null);
}

/** Преобразует старую структуру (идеи со strategies[]) в новую (stages[]). */
function fromLegacyIdeas(ideas: unknown[]): ShortResponse {
  const stages = ideas
    .map((rawIdea, index) => {
      const idea = asRecord(rawIdea);
      if (!idea) return null;
      const strategies = (Array.isArray(idea.strategies) ? idea.strategies : [])
        .map(parseStrategy)
        .filter((item): item is NewStrategy => item !== null);
      if (strategies.length === 0) return null;
      return {
        number: index + 1,
        name: readString(idea, ["title", "name", "название", "идея", "тема"]) || `Этап ${index + 1}`,
        description: readString(idea, ["description", "описание", "detail", "details"]),
        strategies,
      } satisfies NewStage;
    })
    .filter((item): item is NewStage => item !== null);

  const first = asRecord(ideas[0]);
  return {
    title: readString(first, ["title", "name", "название"]),
    description: readString(first, ["description", "описание"]),
    tags: readStringList(first, ["tags", "теги"]),
    stages,
  };
}

/** Приводит ответ модели (новый или старый формат) к структуре { title, description, tags, stages }. */
export function parseShortResponse(value: unknown): ShortResponse | null {
  const root = asRecord(value);
  if (!root) {
    return Array.isArray(value) ? fromLegacyIdeas(value) : null;
  }

  if (Array.isArray(root.stages)) {
    return {
      title: readString(root, ["title", "name", "название"]),
      description: readString(root, ["description", "описание", "detail", "details"]),
      tags: readStringList(root, ["tags", "теги"]),
      stages: parseStages(root.stages),
    };
  }

  for (const key of ["ideas", "идеи", "strategies", "Стратегии", "results", "data"]) {
    if (Array.isArray(root[key])) return fromLegacyIdeas(root[key] as unknown[]);
  }

  return fromLegacyIdeas([root]);
}

function stripCodeFence(value: string): string {
  return value.replace(/```json\n?|\n?```/g, "").trim();
}

/** Достаёт разобранный ответ модели из interview_analyses.model_json. */
export function extractShortResponse(modelJson: unknown): ShortResponse | null {
  const source = asRecord(modelJson);
  if (!source) return null;

  if (typeof source.raw_response === "string" && source.raw_response.trim()) {
    try {
      const parsed = parseShortResponse(JSON.parse(stripCodeFence(source.raw_response)));
      if (parsed && parsed.stages.length > 0) return parsed;
    } catch (err) {
      console.error("[short-analysis] не удалось разобрать raw_response:", err);
    }
  }

  const parsed = parseShortResponse(source);
  return parsed && parsed.stages.length > 0 ? parsed : null;
}
