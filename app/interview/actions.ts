"use server";

import { getSupabaseServerClient } from "@/lib/supabase";
import { callClaude, claudeConfigured } from "@/lib/claude";
import type { InterviewConfigRow, InterviewSessionRow, InterviewQuestionResult, Idea, GoalRow, SelectedIdea } from "@/lib/types";

export async function startInterview(clientUuid: string, interviewId?: string): Promise<InterviewQuestionResult> {
  const supabase = getSupabaseServerClient();

  let resolvedInterviewId = interviewId;
  if (!resolvedInterviewId) {
    const { data: defaultInterview, error: defaultError } = await supabase
      .from("interview")
      .select("id")
      .eq("code", "default")
      .single();
    if (defaultError || !defaultInterview) {
      throw new Error(defaultError?.message || "Default interview not found");
    }
    resolvedInterviewId = defaultInterview.id;
  }

  const sessionPayload: Record<string, unknown> = {
    client_uuid: clientUuid,
    interview_id: resolvedInterviewId,
    current_block: 1,
    status: "in_progress",
    answers: {},
  };

  const { data: session, error: sessionError } = await supabase
    .from("interview_sessions")
    .insert(sessionPayload)
    .select("*")
    .single();

  if (sessionError || !session) {
    throw new Error(sessionError?.message || "Failed to start interview");
  }

  return getNextQuestion(session as InterviewSessionRow);
}

export async function submitAnswer(
  clientUuid: string,
  answer: string,
  blockNumber: number,
  order: number
): Promise<InterviewQuestionResult> {
  const supabase = getSupabaseServerClient();
  const { data: session, error: sessionError } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("client_uuid", clientUuid)
    .eq("status", "in_progress")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (sessionError || !session) {
    throw new Error(sessionError?.message || "No active interview session");
  }

  const s = session as InterviewSessionRow;
  const answers = s.answers || {};

  const blockConfig = await getBlockConfig(blockNumber, s.interview_id);
  if (!blockConfig) {
    throw new Error(`Block ${blockNumber} config not found`);
  }

  const questions = blockConfig.questions.sort((a, b) => a.order - b.order);
  const isBlockComplete = questions.length > 0 && questions.every((q) => answers[blockNumber.toString()]?.[q.order.toString()]);

  if (blockNumber === 3 && isBlockComplete && !answers.block4_trigger) {
    answers.block4_trigger = answer;
    const triggered = isPositiveTrigger(answer);

    const updatedSession = {
      ...s,
      block4_triggered: triggered,
      block4_trigger_description: answer,
      answers,
      current_block: triggered ? 4 : 5,
    };

    await supabase
      .from("interview_sessions")
      .update({
        block4_triggered: triggered,
        block4_trigger_description: answer,
        answers,
        current_block: triggered ? 4 : 5,
      })
      .eq("id", s.id);

return getNextQuestion(updatedSession, order);
  }

  if (!answers[blockNumber.toString()]) {
    answers[blockNumber.toString()] = {};
  }
  answers[blockNumber.toString()][order.toString()] = answer;

  const { error: updateError } = await supabase
    .from("interview_sessions")
    .update({ answers, current_block: blockNumber })
    .eq("id", s.id);

  if (updateError) {
    throw new Error(updateError.message || "Failed to save answer");
  }

  const updatedSession = { ...s, answers, current_block: blockNumber };
  return getNextQuestion(updatedSession, order);
}

export async function loadExistingSession(clientUuid: string, interviewId?: string): Promise<InterviewQuestionResult | null> {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("interview_sessions")
    .select("*")
    .eq("client_uuid", clientUuid)
    .eq("status", "in_progress")
    .order("created_at", { ascending: false })
    .limit(1);

  if (interviewId) {
    query = query.eq("interview_id", interviewId);
  }

  const { data: session, error: sessionError } = await query.single();

  if (sessionError || !session) {
    return null;
  }

  return getNextQuestion(session as InterviewSessionRow);
}

export async function hasCompletedInterviews(clientUuid: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { data: session, error: sessionError } = await supabase
    .from("interview_sessions")
    .select("id")
    .eq("client_uuid", clientUuid)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sessionError || !session) {
    return false;
  }

  return true;
}

export async function loadUserGoals(clientUuid: string): Promise<GoalRow[]> {
  const supabase = getSupabaseServerClient();
  const { data: goals, error: goalsError } = await supabase
    .from("goals")
    .select("*")
    .eq("client_uuid", clientUuid)
    .order("created_at", { ascending: false });

  if (goalsError || !goals) {
    return [];
  }

  return goals as GoalRow[];
}

export async function saveSelectedIdeasAsGoals(
  clientUuid: string,
  analysisId: string,
  selectedIdeas: SelectedIdea[]
): Promise<void> {
  const supabase = getSupabaseServerClient();

  const rows = selectedIdeas.map((idea) => ({
    client_uuid: clientUuid,
    title: idea.title,
    smart_json: {
      description: idea.description,
      tags: idea.tags,
    },
    source_analysis_id: analysisId,
    status: "active",
  }));

  const { error: insertError } = await supabase.from("goals").insert(rows);

  if (insertError) {
    throw new Error(insertError.message || "Failed to save goals");
  }
}

export async function updateAnswer(
  clientUuid: string,
  blockNumber: number,
  order: number,
  answer: string
): Promise<InterviewQuestionResult> {
  const supabase = getSupabaseServerClient();
  const { data: session, error: sessionError } = await supabase
    .from("interview_sessions")
    .select("*")
    .eq("client_uuid", clientUuid)
    .eq("status", "in_progress")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (sessionError || !session) {
    throw new Error(sessionError?.message || "No active interview session");
  }

  const s = session as InterviewSessionRow;
  const answers = s.answers || {};

  if (!answers[blockNumber.toString()]) {
    answers[blockNumber.toString()] = {};
  }
  answers[blockNumber.toString()][order.toString()] = answer;

  const { error: updateError } = await supabase
    .from("interview_sessions")
    .update({ answers })
    .eq("id", s.id);

  if (updateError) {
    throw new Error(updateError.message || "Failed to update answer");
  }

  const updatedSession = { ...s, answers, current_block: blockNumber };
  return getNextQuestion(updatedSession, order);
}

async function getNextQuestion(
  session: InterviewSessionRow,
  lastAnsweredOrder?: number
): Promise<InterviewQuestionResult> {
  const blockConfig = await getBlockConfig(session.current_block, session.interview_id);
  if (!blockConfig) {
    throw new Error(`Block ${session.current_block} config not found`);
  }

  const answers = session.answers || {};
  const blockAnswers = answers[session.current_block.toString()] || {};
  const questions = blockConfig.questions.sort((a, b) => a.order - b.order);

  // If lastAnsweredOrder is provided, find the next question in sequence
  if (lastAnsweredOrder !== undefined) {
    const currentIndex = questions.findIndex((q) => q.order === lastAnsweredOrder);
    if (currentIndex >= 0 && currentIndex < questions.length - 1) {
      const nextQuestion = questions[currentIndex + 1];
      return {
        sessionId: session.id,
        blockNumber: session.current_block,
        order: nextQuestion.order,
        text: nextQuestion.text,
        isLast: nextQuestion.order === questions[questions.length - 1].order,
        totalInBlock: questions.length,
        completed: false,
      };
    }
    // If last answered was the last question, or not found, fall through to check if block is complete
  }

  // Find first unanswered question in current block (for initial load or when order not provided)
  for (const q of questions) {
    if (!blockAnswers[q.order.toString()]) {
      return {
        sessionId: session.id,
        blockNumber: session.current_block,
        order: q.order,
        text: q.text,
        isLast: q.order === questions[questions.length - 1].order,
        totalInBlock: questions.length,
        completed: false,
      };
    }
  }

  // All questions in current block answered - move to next block
  if (session.current_block === 6) {
    const supabase = getSupabaseServerClient();
    await supabase
      .from("interview_sessions")
      .update({ status: "completed" })
      .eq("id", session.id);

    return {
      sessionId: session.id,
      blockNumber: session.current_block,
      order: 0,
      text: "Интервью завершено. Далее — синтез профиля.",
      isLast: true,
      totalInBlock: questions.length,
      completed: true,
    };
  }

  if (session.current_block === 3 && !answers.block4_trigger) {
    return {
      sessionId: session.id,
      blockNumber: session.current_block,
      order: 0,
      text:
        blockConfig.trigger_question ||
        "За последние 12 месяцев у тебя было существенное изменение в жизни — переезд, смена семейного статуса, значимая потеря или внезапный рост (в доходе, статусе, обстоятельствах)?",
      isLast: false,
      totalInBlock: questions.length,
      completed: false,
    };
  }

  const nextBlock = session.current_block + 1;
  const supabase = getSupabaseServerClient();
  await supabase
    .from("interview_sessions")
    .update({ current_block: nextBlock })
    .eq("id", session.id);

  const nextBlockConfig = await getBlockConfig(nextBlock, session.interview_id);
  if (!nextBlockConfig) {
    throw new Error(`Block ${nextBlock} config not found`);
  }

  const nextQuestions = nextBlockConfig.questions.sort((a, b) => a.order - b.order);
  return {
    sessionId: session.id,
    blockNumber: nextBlock,
    order: nextQuestions[0].order,
    text: nextQuestions[0].text,
    isLast: nextQuestions.length === 1,
    totalInBlock: nextQuestions.length,
    completed: false,
  };
}

async function getBlockConfig(blockNumber: number, interviewId?: string): Promise<InterviewConfigRow | null> {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("interview_config")
    .select("*")
    .eq("block_number", blockNumber)
    .eq("active", true);

  if (interviewId) {
    query = query.eq("interview_id", interviewId);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    return null;
  }

  return data as InterviewConfigRow;
}

function isPositiveTrigger(answer: string): boolean {
  const a = answer.trim().toLowerCase();
  return ["да", "yes", "true", "1", "было", "произошло", "изменение было"].some((v) =>
    a.includes(v)
  );
}

function formatAnswersForPrompt(answers: Record<string, Record<string, string>>): string {
  const lines: string[] = [];
  for (const [block, blockAnswers] of Object.entries(answers)) {
    if (block === "block4_trigger") continue;
    for (const [order, text] of Object.entries(blockAnswers)) {
      lines.push(`Блок ${block}, вопрос ${order}: ${text}`);
    }
  }
  return lines.join("\n");
}

export async function analyzeInterviewAnswers(
  clientUuid: string,
  interviewId?: string
): Promise<{ ideas: Idea[]; answerCount: number }> {
  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("interview_sessions")
    .select("*")
    .eq("client_uuid", clientUuid)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1);

  if (interviewId) {
    query = query.eq("interview_id", interviewId);
  }

  const { data: session, error: sessionError } = await query.maybeSingle();

  if (sessionError || !session) {
    throw new Error(sessionError?.message || "No completed interview session found");
  }

  const answers = (session.answers as Record<string, Record<string, string>>) || {};
  const flatAnswers = Object.values(answers)
    .filter((block): block is Record<string, string> => typeof block === "object" && block !== null)
    .flatMap((block) => Object.values(block));

  const answerCount = flatAnswers.length;
  const profileText = flatAnswers.join(" ").toLowerCase();
  const promptText = flatAnswers.map((text, idx) => `Ответ ${idx + 1}: ${text}`).join("\n");

  let ideas: Idea[];
  if (!claudeConfigured()) {
    ideas = generateFallbackIdeas(profileText, flatAnswers);
  } else {
    try {
      const { data: interview } = await supabase
        .from("interview")
        .select("prompt")
        .eq("id", session.interview_id)
        .single();

      const systemPrompt =
        interview?.prompt ||
        "Ты — карьерный и жизненный стратег. Ты говоришь по-русски. Проанализируй ответы и предложи 5 идей в JSON.";

      const response = await callClaude(
        [{ role: "user", text: promptText }],
        systemPrompt,
        { max_tokens: 10000, temperature: 0.7 }
      );

      const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleaned) as Idea[];
      ideas = Array.isArray(parsed) ? parsed.slice(0, 5) : generateFallbackIdeas(profileText, flatAnswers);
    } catch (err) {
      console.error("[interview_analysis] Claude call failed, using fallback:", err);
      ideas = generateFallbackIdeas(profileText, flatAnswers);
    }
  }

  const { error: insertError } = await supabase
    .from("interview_analyses")
    .insert({
      client_uuid: clientUuid,
      interview_session_id: session.id,
      raw_answers: answers,
      ideas,
      model_used: claudeConfigured() ? "claude" : "fallback",
      answer_count: answerCount,
    });

  if (insertError) {
    console.error("[interview_analysis] Failed to save analysis:", insertError);
  }

  return { ideas, answerCount };
}



function generateFallbackIdeas(
  profileText: string,
  rawAnswers: string[]
): { title: string; description: string; tags: string[] }[] {
  const ideas: { title: string; description: string; tags: string[] }[] = [];

  const hasRemote = /удален|удаленк|remote|пассивн|доход/.test(profileText);
  const hasProgramming = /программир|код|разработ|айб/.test(profileText);
  const hasMeditation = /медит|духов|йог|практик|самопознан|философ/.test(profileText);
  const hasBuilding = /строит|дом|экол|каркас|геокупол/.test(profileText);
  const hasSurf = /серфинг|серфи|плаван|водн|океан/.test(profileText);
  const hasBusiness = /бизнес|продаж|монетиз|доход|инвест/.test(profileText);
  const hasTeaching = /обуч|курс|ментор|коуч|школ|наставник/.test(profileText);
  const hasTravel = /путешеств|переезд|тропик|границ|кочев/.test(profileText);
  const hasContent = /канал|ютуб|блог|контент|соцсет/.test(profileText);
  const hasConsulting = /консульт|совет|диагност|разбор/.test(profileText);

  if (hasMeditation && hasTeaching && hasRemote) {
    ideas.push({
      title: "Онлайн-школа практики самоисследования",
      description: "Метод джняна-йоги в формате онлайн-курсов и менторства. Опыт 30 лет в программировании даёт системный подход к обучению — можно упаковать практику как цифровой продукт с проверкой домашних заданий и мини-группами.",
      tags: ["education", "meditation", "remote"],
    });
  }

  if (hasProgramming && hasRemote && hasMeditation) {
    ideas.push({
      title: "Вайб-кодинг-сессии для духовных проектов",
      description: "Быстрое прототипирование на vibe coding для инфопродуктов, приложений для практикующих, платформ самоисследования. Ниша: учителя йоги/медитации, духовные школы, авторы практик.",
      tags: ["vibe-coding", "spiritual", "remote"],
    });
  }

  if (hasProgramming && hasRemote && hasTravel) {
    ideas.push({
      title: "Удалённая разработка на заказ для длительных поездок",
      description: "Фриланс/аутстафф с контрактами на 2-4 часа в день, подходящими для путешествий. Специализация на сложных задачах, где нужен опыт 30 лет, а не junior-ворк.",
      tags: ["freelance", "remote", "programming"],
    });
  }

  if (hasSurf && hasTravel && hasRemote) {
    ideas.push({
      title: "Цифровой коучинг цифровых кочевников",
      description: "Консультации по организации удалённой жизни: налоги, юрисдикции, доходные модели, маршруты. Личный опыт переезда и жизни на природе добавляет доверия.",
      tags: ["nomad", "coaching", "travel"],
    });
  }

  if (hasBuilding && hasRemote && hasTravel) {
    ideas.push({
      title: "Микродома и автономные дома для nomadic lifestyle",
      description: "Проектирование и продажа схем/макетов домов на колёсах, геокуполов, экодомов для тех, кто хочет жить где угодно. Опыт постройки трёх домов — это кейс для продажи дизайнов и чертежей.",
      tags: ["diy", "nomad", "construction"],
    });
  }

  if (hasConsulting && hasMeditation && hasProgramming) {
    ideas.push({
      title: "Психокоррекция + техническая экспертиза",
      description: "Гибридное направление: метод Толстых + помощь в технических вопросах для людей, которые переживают кризис из-за работы в IT/проектах. Уникальная комбинация, мало конкурентов.",
      tags: ["hybrid", "consulting", "psychology"],
    });
  }

  if (hasContent && hasMeditation && hasProgramming) {
    ideas.push({
      title: "Контент-проект «Программирование как медитация»",
      description: "YouTube/канал/подкаст на стыке IT и духовных практик. Аудитория: интроверты-программисты, уставшие от корпораций, ищущие смысл. Монетизация: реклама, донаты, платные комьюнити.",
      tags: ["content", "spiritual", "programming"],
    });
  }

  if (hasBusiness && hasRemote && hasProgramming) {
    ideas.push({
      title: "Вайб-кодинг-студия под ключ",
      description: "Не просто разработка, а быстрое создание MVP для стартапов и малого бизнеса. Продажа «идея → работающий прототип» за фикс. Ниша: локальный бизнес, региональные сервисы, alternative currency / barter-платформы.",
      tags: ["startup", "mvp", "vibe-coding"],
    });
  }

  if (hasTeaching && hasProgramming && hasRemote) {
    ideas.push({
      title: "Курс «Вайб-кодинг для духовных практиков»",
      description: "Научить медитативно подходить к коду: состояние потока, отсутствие суеты, создание осмысленных продуктов. Для тех, кто уже практикует, но хочет монетизировать через IT без выгорания.",
      tags: ["education", "vibe-coding", "spiritual"],
    });
  }

  if (ideas.length === 0) {
    ideas.push({
      title: "Удалённая freelance-задача с фокусом на автоматизацию",
      description: "Твои ответы указывают на сильные аналитические и технические навыки. Начни с небольшого контракта на автоматизацию рутины или оптимизацию процесса — это даст быстрый результат и деньги на эксперименты.",
      tags: ["freelance", "automation"],
    });

    ideas.push({
      title: "Мини-продукт: templates / checklists",
      description: "На основе твоих самопальных решений (таблицы, заметки, чек-листы) можно сделать продаваемые цифровые продукты на Gumroad/Booster. Ты уже создал их для себя — значит, есть спрос.",
      tags: ["digital-product", "self-made"],
    });
  }

  return ideas.slice(0, 5);
}
