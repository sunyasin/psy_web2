import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { callClaude, claudeConfigured } from "@/lib/claude";
import type { ShortAnalysisResult, ShortAnalysisStep, ShortAnalysisStrategy } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const clientUuid = new URL(request.url).searchParams.get("client_uuid");
    if (!clientUuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: sessions, error: sessionsError } = await supabase
      .from("interview_sessions")
      .select("*")
      .eq("client_uuid", clientUuid)
      .eq("status", "completed")
      .order("created_at", { ascending: true });
    if (sessionsError) {
      return NextResponse.json({ error: sessionsError.message }, { status: 500 });
    }
    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ error: "No completed interview sessions found" }, { status: 404 });
    }

    const interviewIds = [...new Set(sessions.map((session) => session.interview_id).filter(Boolean))] as string[];
    const { data: interviewRows, error: interviewError } = await supabase
      .from("interview")
      .select("id, code, prompt")
      .in("id", interviewIds.length > 0 ? interviewIds : ["00000000-0000-0000-0000-000000000000"]);
    if (interviewError) {
      return NextResponse.json({ error: interviewError.message }, { status: 500 });
    }

    const shortInterview = (interviewRows || []).find((interview) => interview.code === "short");
    if (!shortInterview) {
      return NextResponse.json({ error: "Short interview prompt not found" }, { status: 404 });
    }

    const rawAnswers: Record<string, Record<string, string>> = {};
    const flatAnswers: string[] = [];
    let goalAnswer = "";
    for (const [sessionIndex, session] of sessions.entries()) {
      const answers = (session.answers || {}) as Record<string, unknown>;
      for (const [block, blockAnswers] of Object.entries(answers)) {
        if (block === "block4_trigger" || !blockAnswers || typeof blockAnswers !== "object") continue;
        const values = blockAnswers as Record<string, string>;
        rawAnswers[`session_${sessionIndex + 1}`] ||= {};
        for (const [order, text] of Object.entries(values)) {
          if (typeof text !== "string" || !text.trim()) continue;
          if (!goalAnswer && session.interview_id === shortInterview.id) goalAnswer = text.trim();
          rawAnswers[`session_${sessionIndex + 1}`][`${block}.${order}`] = text;
          flatAnswers.push(text);
        }
      }
    }

    if (flatAnswers.length === 0) {
      return NextResponse.json({ error: "No answers found in completed interviews" }, { status: 404 });
    }

    const profileText = flatAnswers.join(" ").toLowerCase();
    const promptText = flatAnswers.map((text, index) => `Ответ ${index + 1}: ${text}`).join("\n");
    let strategies: ShortAnalysisResult[] = [];
    let modelUsed = "fallback";

    if (claudeConfigured()) {
      try {
        const response = await callClaude(
          [{ role: "user", text: promptText }],
          shortInterview.prompt,
          { max_tokens: 10000, temperature: 0.7 }
        );
        strategies = normalizeStrategies(JSON.parse(stripCodeFence(response)));
        if (strategies.length > 0) modelUsed = "claude";
      } catch (err) {
        console.error("[analysis/short] Claude call failed, using fallback:", err);
        strategies = [];
      }
    }

    if (!strategies || strategies.length === 0) {
      console.error("[analysis/short] no usable model strategies, falling back", {
        claudeConfigured: claudeConfigured(),
        modelUsed,
      });
      strategies = generateFallbackStrategies(profileText);
      modelUsed = "fallback";
    }

    const { data: analysis, error: analysisError } = await supabase
      .from("interview_analyses")
      .insert({
        client_uuid: clientUuid,
        interview_session_id: sessions[sessions.length - 1].id,
        interview_id: shortInterview.id,
        raw_answers: rawAnswers,
        goal_answer: goalAnswer,
        ideas: strategies,
        strategy_json: strategies,
        model_used: modelUsed,
        answer_count: flatAnswers.length,
      })
      .select("id")
      .single();
    if (analysisError || !analysis) {
      return NextResponse.json({ error: analysisError?.message || "Failed to save analysis" }, { status: 500 });
    }

    return NextResponse.json({
      strategies,
      answerCount: flatAnswers.length,
      analysis_id: analysis.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}

function stripCodeFence(value: string): string {
  return value.replace(/```json\n?|\n?```/g, "").trim();
}

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
  // The model may return a single idea, an object with an "ideas"/"идеи" key, or an array
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
        // Either a list of steps directly, or a list of {name, steps} objects
        const firstObject = strategySource.find((item) => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown> | undefined;
        const named = firstObject ? readString(firstObject, STRATEGY_NAME_KEYS) : "";
        const stepsSource = named ? strategySource : [strategySource];
        const steps = readSteps(stepsSource);
        if (steps.length > 0) {
          ideaStrategies.push({
            name: named || readString(idea, STRATEGY_NAME_KEYS) || `Стратегия ${ideaStrategies.length + 1}`,
            steps,
          });
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
      console.error("[analysis/short] idea dropped: no title/description/strategies", JSON.stringify(idea).slice(0, 300));
      continue;
    }

    result.push({ title: title || description.slice(0, 60), description, strategies: ideaStrategies });
  }

  if (synthesized > 0) {
    console.error(`[analysis/short] synthesized plans for ${synthesized} idea(s) from description text`);
  }

  return result.slice(0, 5);
}

function generateFallbackStrategies(profileText: string): ShortAnalysisResult[] {
  const target = profileText.split(/[.!?\n]/).find((part) => part.trim().length > 20)?.trim();
  return [{
    title: target || "Цель и стратегия её достижения",
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
