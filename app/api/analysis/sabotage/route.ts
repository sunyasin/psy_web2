import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { callClaude, claudeConfigured } from "@/lib/claude";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_uuid, goal_id } = body as { client_uuid: string; goal_id: string };

    if (!client_uuid || !goal_id) {
      return NextResponse.json({ error: "client_uuid and goal_id are required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const { data: goal, error: goalError } = await supabase
      .from("goals")
      .select("*")
      .eq("id", goal_id)
      .eq("client_uuid", client_uuid)
      .single();

    if (goalError || !goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    const { data: session } = await supabase
      .from("interview_sessions")
      .select("id, answers")
      .eq("client_uuid", client_uuid)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Prefer raw_answers from interview_analyses linked to the session or latest for client
    let rawAnswers: Record<string, Record<string, string>> = {};

    if (session?.id) {
      const { data: analysis } = await supabase
        .from("interview_analyses")
        .select("raw_answers")
        .eq("interview_session_id", session.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (analysis?.raw_answers && typeof analysis.raw_answers === "object") {
        rawAnswers = analysis.raw_answers as Record<string, Record<string, string>>;
      }
    }

    if (Object.keys(rawAnswers).length === 0) {
      const { data: latestAnalysis } = await supabase
        .from("interview_analyses")
        .select("raw_answers")
        .eq("client_uuid", client_uuid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestAnalysis?.raw_answers && typeof latestAnalysis.raw_answers === "object") {
        rawAnswers = latestAnalysis.raw_answers as Record<string, Record<string, string>>;
      }
    }

    const flatAnswers = Object.values(rawAnswers)
      .filter((block) => typeof block === "object" && block !== null && block !== (rawAnswers as any).block4_trigger)
      .flatMap((block) => {
        if (block === (rawAnswers as any).block4_trigger) return [];
        return Object.values(block as Record<string, string>);
      });

    const ruleFlags = detectSabotageRules(flatAnswers);
    const llmPrompt = buildPrompt(goal, flatAnswers, ruleFlags);

    let analysisText: string;
    if (!claudeConfigured()) {
      analysisText = buildFallbackAnalysis(goal, ruleFlags);
    } else {
      const systemPrompt = `Ты — карьерный и жизненный стратег. Ты говоришь по-русски. Твоя задача — провести анализ саботажа и психологической готовности для выбранной цели пользователя.

Шаги:
1. tension_resolution_agent: предъяви возможное противоречие между целью и паттернами поведения из ответов интервью. 
2. self_sabotage_agent: разбери, какие внутренние установки могут саботировать достижение этой цели. В конце укажи возможные маршруты: далее вы можете: 1) самостоятельно пройти когнитивно-поведенческую-диагностику в любой LLM-модели типа ChatGPT/Claude или 2) продолжить общаться с этой моделью во встроенном чате, оплатив доступ или 3) пройти бесплатную подробную диагностику проблем на бесплатной сессии со специалистом.
3. Будь конкретным, опирайся на ответы пользователя. Не используй markdown-заголовки вида # или ##, используй простые абзацы и маркированные списки с дефисами.

Формат ответа: готовый текст для отображения пользователю, с пунктами и подзаголовками на русском языке.`;

      analysisText = await callClaude(
        [{ role: "user", text: llmPrompt }],
        systemPrompt,
        { max_tokens: 4096, temperature: 0.7 }
      );
    }

    const fullAnalysis = `## Анализ саботажа и психологической готовности\n\n${analysisText}`;

    const { error: updateError } = await supabase
      .from("goals")
      .update({ conflict_analysis: fullAnalysis })
      .eq("id", goal_id)
      .eq("client_uuid", client_uuid);

    if (updateError) {
      console.error("[sabotage] Failed to save analysis:", updateError);
    }

    return NextResponse.json({ analysis: fullAnalysis });
  } catch (err) {
    console.error("[sabotage] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Analysis error" },
      { status: 500 }
    );
  }
}

function detectSabotageRules(answers: string[]): { pattern: string; domains: string[]; description: string }[] {
  const flags: { pattern: string; domains: string[]; description: string }[] = [];
  const text = answers.join(" ").toLowerCase();

  const domainPatterns: { pattern: string; domains: string[]; keywords: string[]; description: string }[] = [
    { pattern: "procrastination", domains: ["work", "personal"], keywords: ["откладываю", "прокрастин", "не могу начать", "завтра"], description: "Склонность к откладыванию важных дел" },
    { pattern: "perfectionism", domains: ["work", "personal"], keywords: ["идеально", "должен быть", "недостаточно хорошо", "совершен"], description: "Перфекционизм, мешающий завершать дела" },
    { pattern: "impostor_syndrome", domains: ["work", "social"], keywords: ["не заслуживаю", "повезло", "всё равно не смогу", "я не expert"], description: "Синдром самозванца" },
    { pattern: "fear_failure", domains: ["work", "personal"], keywords: ["боюсь", "страх", "не получится", "а что если"], description: "Страх неудачи блокирует действия" },
    { pattern: "people_pleasing", domains: ["relationships", "work"], keywords: ["должен помочь", "не могу отказать", "все должны быть довольны"], description: "Потребность угождать другим в ущерб себе" },
    { pattern: "money_avoidance", domains: ["money", "work"], keywords: ["деньги не важны", "не хочу считать", "не могу брать оплату"], description: "Избегание финансовых тем" },
    { pattern: "health_neglect", domains: ["health", "work"], keywords: ["нет времени на спорт", "пропускаю приемы", "откладываю здоровье"], description: "Игнорирование здоровья под давлением других сфер" },
    { pattern: "conflict_avoidance", domains: ["relationships", "work"], keywords: ["избегаю конфликтов", "не хочу ссор", "молчу"], description: "Избегание конфликтов, даже когда нужно отстаивать границы" },
  ];

  for (const dp of domainPatterns) {
    const matched = dp.keywords.some((k) => text.includes(k));
    if (matched) {
      flags.push({ pattern: dp.pattern, domains: dp.domains, description: dp.description });
    }
  }

  return flags;
}

function buildPrompt(goal: any, answers: string[], flags: { pattern: string; domains: string[]; description: string }[]): string {
  const goalText = typeof goal.smart_json === "object" && goal.smart_json
    ? JSON.stringify(goal.smart_json)
    : goal.title;

  return `Цель пользователя: ${goalText}

Ответы на интервью:
${answers.map((a, i) => `${i + 1}. ${a}`).join("\n")}

Правильные флаги (self_sabotage_detector):
${flags.length > 0 ? flags.map((f) => `- ${f.pattern} (сферы: ${f.domains.join(", ")}): ${f.description}`).join("\n") : "Правильный детектор не нашёл явных паттернов."}

Задача:
1. Опиши возможное противоречие между этой целью и паттернами из ответов.
2. Опиши, как эти паттерны могут sabotировать достижение цели.
3. Предложи варианты: самостоятельная КПТ-диагностика, платная встроенная КПТ-диагностика или бесплатная консультация со специалистом.
4. Будь кратким, конкретным, на русском.`;
}

function buildFallbackAnalysis(goal: any, flags: { pattern: string; domains: string[]; description: string }[]): string {
  const goalTitle = goal.title || "выбранная цель";
  let text = `Я посмотрел на твою цель «${goalTitle}» и ответы интервью.\n\n`;

  if (flags.length > 0) {
    text += "Возможные точки сопротивления:\n";
    flags.forEach((f) => {
      text += `- ${f.description} (сферы: ${f.domains.join(", ")})\n`;
    });
    text += "\n";
    text += "Что с этим делать:\n";
    text += "- Бесплатная КПТ-диагностика: разберём, откуда берётся это сопротивление, и составим первый шаг.\n";
    text += "- Платная сессия: глубокая работа с паттерном, если он сильно блокирует движение к цели.\n";
  } else {
    text += "Правильный детектор не нашёл явных паттернов самосаботажа в ответах. Это не значит, что их нет — просто нужен более глубокий разбор.\n\n";
    text += "Рекомендую начать с бесплатной КПТ-диагностики, чтобы проверить готовность и выяснить, что мешает стартовать.\n";
  }

  return text;
}
