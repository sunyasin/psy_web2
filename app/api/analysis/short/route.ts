import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { callClaude, claudeConfigured } from "@/lib/claude";
import type { NewStage, NewStep, NewStrategy, NewTimeToLaunch } from "@/lib/types";
import { parseShortResponse } from "@/lib/short-analysis";
import { flattenAnswers, formatNumberedQA, loadQuestionIndex, numberAnswers, type AnswerItem } from "@/lib/interview-prompt";

function stripCodeFence(value: string): string {
  return value.replace(/```json\n?|\n?```/g, "").trim();
}

function generateFallbackStrategies(profileText: string): NewStage[] {
  const target = profileText.split(/[.!?\n]/).find((part) => part.trim().length > 20)?.trim();
  const timeToLaunch: NewTimeToLaunch = {
    days_to_first_step: 1,
    days_to_result: 9,
    note: "Сроки ориентировочные, реальные даты зависят от загрузки.",
  };
  const steps: NewStep[] = [
    { number: 1, title: "Сформулировать первый результат", duration: "1 день", estimated_days: 1, description: "Определить минимальный измеримый результат на ближайшие 7 дней." },
    { number: 2, title: "Составить план на неделю", duration: "1 день", estimated_days: 1, description: "Распределить действия по дням и определить время на каждый." },
    { number: 3, title: "Выполнить и зафиксировать результат", duration: "1 неделя", estimated_days: 7, description: "Сделать первый шаг и записать, что получилось." },
  ];
  const strategy: NewStrategy = {
    name: "Пошаговый эксперимент",
    approach: "Разбейте цель на короткие проверяемые шаги и идите по ним в спокойном темпе.",
    resources: [],
    support: [],
    steps,
    time_to_launch: timeToLaunch,
    timeline: "Первый результат — в течение недели, завершение этапа — примерно за 9 дней.",
    budget: "Бюджет не оценён: в ответах нет данных о затратах.",
    investment: "Время и внимание: около часа в день.",
    avoid: [{ rule: "Не планировать вместо действия", reason: "Планы без первых шагов не дают обратной связи." }],
    assumptions: ["Оценка построена по краткому описанию цели, детали могут отличаться."],
  };
  return [{
    number: 1,
    name: target || "Путь к цели",
    description: "Базовый сценарий: последовательные маленькие шаги с фиксацией результата.",
    strategies: [strategy],
  }];
}

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

    const shortSessions = (sessions || []).filter(
      (session) => session.interview_id === shortInterview.id
    );

    const rawAnswers: Record<string, Record<string, string>> = {};
    const answerItems: AnswerItem[] = [];
    let goalAnswer = "";
    for (const [sessionIndex, session] of shortSessions.entries()) {
      const items = flattenAnswers(session.answers, session.interview_id as string);
      if (items.length === 0) continue;
      rawAnswers[`session_${sessionIndex + 1}`] = {};
      for (const item of items) {
        if (!goalAnswer) goalAnswer = item.answer;
        rawAnswers[`session_${sessionIndex + 1}`][`${item.block}.${item.order}`] = item.answer;
        answerItems.push(item);
      }
    }

    const flatAnswers = answerItems.map((item) => item.answer);

    if (flatAnswers.length === 0) {
      return NextResponse.json({ error: "No answers found in completed short interview" }, { status: 404 });
    }

    const profileText = flatAnswers.join(" ").toLowerCase();
    const questionIndex = await loadQuestionIndex([shortInterview.id]);
    const promptText = formatNumberedQA(numberAnswers(answerItems, questionIndex));
    let stages: NewStage[] = [];
    let modelUsed = "fallback";
    let modelJson: unknown = null;

    if (claudeConfigured()) {
      try {
        const response = await callClaude(
          [{ role: "user", text: promptText }],
          shortInterview.prompt,
          { max_tokens: 10000, temperature: 0.7 }
        );
        modelJson = { raw_response: response };
        const parsed = parseShortResponse(JSON.parse(stripCodeFence(response)));
        stages = parsed ? parsed.stages : [];
        if (stages.length > 0) modelUsed = "claude";
      } catch (err) {
        console.error("[analysis/short] Claude call failed, using fallback:", err);
        stages = [];
        modelJson = { error: err instanceof Error ? err.message : "Unknown error" };
      }
    }

    if (stages.length === 0) {
      console.error("[analysis/short] no usable model stages, falling back", {
        claudeConfigured: claudeConfigured(),
        modelUsed,
      });
      stages = generateFallbackStrategies(profileText);
      modelUsed = "fallback";
      modelJson = { stages, fallback: true };
    }

    const { data: analysis, error: analysisError } = await supabase
      .from("interview_analyses")
      .insert({
        client_uuid: clientUuid,
        interview_session_id: shortSessions[shortSessions.length - 1]?.id,
        interview_id: shortInterview.id,
        raw_answers: rawAnswers,
        goal_answer: goalAnswer,
        model_json: modelJson,
        model_used: modelUsed,
        answer_count: flatAnswers.length,
      })
      .select("id")
      .single();
    if (analysisError || !analysis) {
      return NextResponse.json({ error: analysisError?.message || "Failed to save analysis" }, { status: 500 });
    }

    return NextResponse.json({
      stages,
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
