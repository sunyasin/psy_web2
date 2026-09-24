import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { callClaude, claudeConfigured } from "@/lib/claude";
import type { InterviewConfigRow, InterviewSessionRow, Idea } from "@/lib/types";

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_uuid, interview_id } = body as { client_uuid: string; interview_id?: string };

    if (!client_uuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    // Get the completed interview session
    let query = supabase
      .from("interview_sessions")
      .select("*")
      .eq("client_uuid", client_uuid)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1);

    if (interview_id) {
      query = query.eq("interview_id", interview_id);
    }

    const { data: session, error: sessionError } = await query.maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: sessionError?.message || "No completed interview session found" },
        { status: 404 }
      );
    }

    // Check if analysis already exists for this session
    const { data: existingAnalysis } = await supabase
      .from("interview_analyses")
      .select("id")
      .eq("interview_session_id", session.id)
      .maybeSingle();

    if (existingAnalysis) {
      return NextResponse.json({
        message: "Analysis already exists",
        analysis_id: existingAnalysis.id,
      });
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
        console.error("[interview_analyze] Claude call failed, using fallback:", err);
        ideas = generateFallbackIdeas(profileText, flatAnswers);
      }
    }

    const { data: analysis, error: insertError } = await supabase
      .from("interview_analyses")
      .insert({
        client_uuid,
        interview_session_id: session.id,
        raw_answers: answers,
        ideas,
        model_used: claudeConfigured() ? "claude" : "fallback",
        answer_count: answerCount,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[interview_analyze] Failed to save analysis:", insertError);
      return NextResponse.json(
        { error: insertError.message || "Failed to save analysis" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      analysis_id: analysis.id,
      ideas,
      answer_count: answerCount,
    });
  } catch (err) {
    console.error("[interview_analyze] Unhandled error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 500 }
    );
  }
}