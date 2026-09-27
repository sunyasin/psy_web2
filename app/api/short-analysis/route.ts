import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { ShortAnalysisResult, ShortAnalysisStrategy, ShortAnalysisStep } from "@/lib/types";

function extractStrategiesFromModelJson(modelJson: any): ShortAnalysisResult[] {
  if (!modelJson) return [];
  
  // If modelJson has raw_response, parse it
  if (modelJson.raw_response) {
    try {
      const response = modelJson.raw_response;
      const stripped = response.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(stripped);
      return normalizeStrategies(parsed);
    } catch (err) {
      console.error("Failed to parse model_json raw_response:", err);
    }
  }
  
  // If modelJson has strategies directly (fallback case)
  if (Array.isArray(modelJson.strategies)) {
    return modelJson.strategies;
  }
  
  return [];
}

// Copy normalizeStrategies logic from analysis/short/route.ts
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
    const lines = source.split(/\r?\n|(?<=[.;])\s+/).map((line) => line.replace(/^[\s\-–—•*\d.)\]]+/, "").trim()).filter(Boolean);
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

function normalizeStrategies(value: unknown): ShortAnalysisResult[] {
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
  let synthesized = 0;

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
        // Check if first item has a "steps" property (format: [{name, steps}, {name, steps}])
        const firstObject = strategySource.find((item) => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown> | undefined;
        const hasNamedStrategies = firstObject && "steps" in firstObject && Array.isArray(firstObject.steps);

        if (hasNamedStrategies) {
          // Format: [{name: "strategy1", steps: [...]}, {name: "strategy2", steps: [...]}]
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
          // Format: direct steps array [{title: "step1"}, {title: "step2"}] or array of step strings
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

      // Object form: { "название стратегии": steps }
      for (const [name, stepsSource] of Object.entries(strategySource as Record<string, unknown>)) {
        const steps = readSteps(stepsSource);
        if (steps.length > 0) ideaStrategies.push({ name: name.trim() || `Стратегия ${ideaStrategies.length + 1}`, steps });
      }
    }

    // Model returned an idea without a plan: keep it and derive a plan from the description
    if (ideaStrategies.length === 0 && description) {
      const steps = stepsFromDescription(description);
      if (steps.length > 0) {
        ideaStrategies.push({ name: "Пошаговый план", steps });
        synthesized += 1;
      }
    }

    if (ideaStrategies.length === 0) {
      console.error("[short-analysis] idea dropped: no title/description/strategies", JSON.stringify(idea).slice(0, 300));
      continue;
    }

    result.push({ title: title || description.slice(0, 60), description, strategies: ideaStrategies });
  }

  if (synthesized > 0) {
    console.error(`[short-analysis] synthesized plans for ${synthesized} idea(s) from description text`);
  }

  return result.slice(0, 5);
}

export async function GET(request: Request) {
  try {
    const clientUuid = new URL(request.url).searchParams.get("client_uuid");
    if (!clientUuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: analyses, error: analysisError } = await supabase
      .from("interview_analyses")
      .select("*")
      .eq("client_uuid", clientUuid)
      .eq("kind", "short")
      .order("created_at", { ascending: false })
      .limit(20);
    if (analysisError) {
      return NextResponse.json({ error: analysisError.message }, { status: 500 });
    }

    const analysis = (analyses || []).find((item) => item.model_json && (
      (item.model_json.raw_response && typeof item.model_json.raw_response === "string") ||
      Array.isArray(item.model_json.strategies)
    )) || null;
    
    if (!analysis) {
      return NextResponse.json({ analysis: null, ideas: [] });
    }

    const strategies = extractStrategiesFromModelJson(analysis.model_json);
    const ideas = strategies.map((idea, ideaIndex) => ({
      id: `${analysis.id}:${ideaIndex}`,
      idea_index: ideaIndex,
      title: idea.title,
      description: idea.description,
      strategies: idea.strategies.map((strategy, strategyIndex) => ({
        id: `${analysis.id}:${ideaIndex}:${strategyIndex}`,
        idea_index: ideaIndex,
        strategy_index: strategyIndex,
        title: strategy.name,
        description: "",
        steps: strategy.steps,
        is_selected: false,
        tracking: [],
      })),
    }));

    return NextResponse.json({ 
      analysis: {
        id: analysis.id,
        goal_answer: analysis.goal_answer,
        answer_count: analysis.answer_count,
      },
      ideas 
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
