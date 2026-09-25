import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { callClaude, claudeConfigured } from "@/lib/claude";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientUuid = searchParams.get("client_uuid");

    if (!clientUuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    // Get all completed interview sessions for this client
    const { data: sessions, error: sessionsError } = await supabase
      .from("interview_sessions")
      .select("*")
      .eq("client_uuid", clientUuid)
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    if (sessionsError || !sessions || sessions.length === 0) {
      return NextResponse.json(
        { error: "No completed interview sessions found" },
        { status: 404 }
      );
    }

    // Combine answers from all completed sessions
    let allFlatAnswers: string[] = [];
    let totalAnswerCount = 0;
    const allRawAnswers: Record<string, Record<string, string>> = {};

    for (const session of sessions) {
      const answers = (session.answers as Record<string, Record<string, string>>) || {};
      // Merge answers from all sessions
      for (const [block, blockAnswers] of Object.entries(answers)) {
        if (block === "block4_trigger") continue;
        if (typeof blockAnswers === "object" && blockAnswers !== null) {
          if (!allRawAnswers[block]) {
            allRawAnswers[block] = {};
          }
          Object.assign(allRawAnswers[block], blockAnswers);
        }
      }
      
      const flatAnswers = Object.values(answers)
        .filter((block): block is Record<string, string> => 
          typeof block === "object" && block !== null && block !== (answers as any).block4_trigger
        )
        .flatMap((block) => Object.values(block));
      
      allFlatAnswers = allFlatAnswers.concat(flatAnswers);
      totalAnswerCount += flatAnswers.length;
    }

    if (allFlatAnswers.length === 0) {
      return NextResponse.json(
        { error: "No answers found in completed interviews" },
        { status: 404 }
      );
    }

    const profileText = allFlatAnswers.join(" ").toLowerCase();

    if (!claudeConfigured()) {
      const ideas = generateFallbackIdeas(profileText, allFlatAnswers);
      // Save analysis to database
      const { data: analysis, error: insertError } = await supabase
        .from("interview_analyses")
        .insert({
          client_uuid: clientUuid,
          interview_session_id: sessions[0].id, // Use first session as reference
          raw_answers: allRawAnswers,
          ideas,
          model_used: "fallback",
          answer_count: totalAnswerCount,
        })
        .select()
        .single();

      if (insertError) {
        console.error("[analysis/all-interviews] Failed to save analysis:", insertError);
      }

      return NextResponse.json({ 
        ideas, 
        answerCount: totalAnswerCount,
        analysis_id: analysis?.id || null
      });
    }

    // Use the prompt from the first interview (default)
    const { data: interview } = await supabase
      .from("interview")
      .select("prompt")
      .eq("code", "default")
      .eq("visible", true)
      .single();

    const systemPrompt = interview?.prompt || "Ты — карьерный и жизненный стратег. Ты говоришь по-русски. Проанализируй ответы и предложи 5 идей в JSON.";

    try {
      const promptText = allFlatAnswers.map((text, idx) => `Ответ ${idx + 1}: ${text}`).join("\n");
      const response = await callClaude(
        [{ role: "user", text: promptText }],
        systemPrompt,
        { temperature: 0.7 }
      );

      const cleaned = response.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const rawIdeas = Array.isArray(parsed) ? parsed.slice(0, 5) : generateFallbackIdeas(profileText, allFlatAnswers);
      // Ensure all ideas have tags property
      const ideas = rawIdeas.map((idea: any) => ({
        title: idea.title || "",
        description: idea.description || "",
        tags: Array.isArray(idea.tags) ? idea.tags : [],
      }));

      // Save analysis to database
      const { data: analysis, error: insertError } = await supabase
        .from("interview_analyses")
        .insert({
          client_uuid: clientUuid,
          interview_session_id: sessions[0].id, // Use first session as reference
          raw_answers: allRawAnswers,
          ideas,
          model_used: "claude",
          answer_count: totalAnswerCount,
        })
        .select()
        .single();

      if (insertError) {
        console.error("[analysis/all-interviews] Failed to save analysis:", insertError);
      }

      return NextResponse.json({ 
        ideas, 
        answerCount: totalAnswerCount,
        analysis_id: analysis?.id || null
      });
    } catch (err) {
      console.error("[analysis/all-interviews] Claude call failed, using fallback:", err);
      const rawIdeas = generateFallbackIdeas(profileText, allFlatAnswers);
      const ideas = rawIdeas.map((idea: any) => ({
        title: idea.title || "",
        description: idea.description || "",
        tags: Array.isArray(idea.tags) ? idea.tags : [],
      }));
      
      // Save fallback analysis to database
      const { data: analysis, error: insertError } = await supabase
        .from("interview_analyses")
        .insert({
          client_uuid: clientUuid,
          interview_session_id: sessions[0].id,
          raw_answers: allRawAnswers,
          ideas,
          model_used: "fallback",
          answer_count: totalAnswerCount,
        })
        .select()
        .single();

      if (insertError) {
        console.error("[analysis/all-interviews] Failed to save fallback analysis:", insertError);
      }

      return NextResponse.json({ 
        ideas, 
        answerCount: totalAnswerCount,
        analysis_id: analysis?.id || null
      });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
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