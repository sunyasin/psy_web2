import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_uuid } = body as { client_uuid: string };

    if (!client_uuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const { data: session, error: sessionError } = await supabase
      .from("interview_sessions")
      .select("*")
      .eq("client_uuid", client_uuid)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "No completed interview session found" },
        { status: 404 }
      );
    }

    const answers = (session.answers as Record<string, Record<string, string>>) || {};
    const flatAnswers = Object.values(answers).flatMap((block) => Object.values(block));

    const profile = buildProfile(flatAnswers);
    const tensions = detectTensions(flatAnswers, profile);

    const { data: snapshot, error: snapshotError } = await supabase
      .from("profile_snapshots")
      .insert({
        client_uuid,
        version: 1,
        data: profile,
        source: "initial_interview",
      })
      .select("*")
      .single();

    if (snapshotError || !snapshot) {
      return NextResponse.json(
        { error: snapshotError?.message || "Failed to create profile snapshot" },
        { status: 500 }
      );
    }

    let tensionCount = 0;
    if (tensions.length > 0) {
      const rows = tensions.map((t) => ({
        client_uuid,
        type: t.type,
        description: t.description,
        evidence: t.evidence,
        confidence: t.confidence,
        status: "detected" as const,
      }));

      const { error: tensionError } = await supabase.from("tension_flags").insert(rows);
      if (!tensionError) {
        tensionCount = rows.length;
      }
    }

    return NextResponse.json({
      completed: true,
      profileId: snapshot.id,
      tensionsDetected: tensionCount > 0,
      tensionCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}

function buildProfile(answers: string[]) {
  const text = answers.join(" ").toLowerCase();
  
  const skills: string[] = [];
  const values: string[] = [];
  const constraints: string[] = [];
  
  if (text.includes("автоматиз") || text.includes("инструмент") || text.includes("процесс")) {
    skills.push("Оптимизация процессов");
  }
  if (text.includes("люд") || text.includes("общен") || text.includes("совет")) {
    skills.push("Работа с людьми");
  }
  if (text.includes("стратег") || text.includes("тренд") || text.includes("будущее")) {
    skills.push("Стратегическое мышление");
  }
  if (text.includes("деньги") || text.includes("доход") || text.includes("оплат")) {
    values.push("Финансовая стабильность");
  }
  if (text.includes("свобод") || text.includes("независ") || text.includes("удален")) {
    values.push("Свобода и независимость");
  }
  if (text.includes("призван") || text.includes("смысл") || text.includes("дело")) {
    values.push("Осмысленная работа");
  }
  if (text.includes("время") || text.includes("рутин") || text.includes("не хватает")) {
    constraints.push("Ограниченность времени");
  }
  if (text.includes("ресурс") || text.includes("деньги") || text.includes("нет")) {
    constraints.push("Нехватка ресурсов");
  }

  return {
    skills: skills.length > 0 ? skills : ["Аналитическое мышление", "Решение проблем"],
    values: values.length > 0 ? values : ["Развитие", "Баланс"],
    constraints: constraints.length > 0 ? constraints : [],
    ikigai_map: {
      what_you_love: extractThemes(answers, ["люблю", "нравится", "увлекаюсь", "страсть"]),
      what_you_are_good_at: extractThemes(answers, ["умею", "знаю", "сильный", "опыт"]),
      what_the_world_needs: extractThemes(answers, ["проблема", "нужно", "не хватает", "решить"]),
      what_you_can_be_paid_for: extractThemes(answers, ["деньги", "оплат", "доход", "заплатил"]),
    },
    dreams: extractThemes(answers, ["хочу", "мечта", "цель", "планирую", "желаю"]),
    raw_themes: extractTopThemes(text),
  };
}

function extractThemes(answers: string[], keywords: string[]): string[] {
  const relevant = answers.filter((a) =>
    keywords.some((k) => a.toLowerCase().includes(k))
  );
  return relevant.slice(0, 3);
}

function extractTopThemes(text: string): string[] {
  const themes: { theme: string; count: number }[] = [
    { theme: "работа / проекты", count: (text.match(/\b(проект|работа|задача|бизнес)\b/g) || []).length },
    { theme: "отношения / люди", count: (text.match(/\b(люди|отношения|семья|друзья|общение)\b/g) || []).length },
    { theme: "деньги / доход", count: (text.match(/\b(деньги|доход|зарплата|оплата|бюджет)\b/g) || []).length },
    { theme: "здоровье / энергия", count: (text.match(/\b(здоровье|сон|усталость|энергия|спорт)\b/g) || []).length },
    { theme: "саморазвитие / навыки", count: (text.match(/\b(навык|изучать|учиться|развитие|курс)\b/g) || []).length },
    { theme: "смысл / призвание", count: (text.match(/\b(смысл|призвание|цель|мечта|важно)\b/g) || []).length },
  ];
  
  return themes
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((t) => t.theme);
}

function detectTensions(answers: string[], profile: any): { type: string; description: string; evidence: any; confidence: number }[] {
  const tensions: { type: string; description: string; evidence: any; confidence: number }[] = [];
  const text = answers.join(" ").toLowerCase();

  if (text.includes("хочу") && text.includes("но") && text.includes("не могу")) {
    tensions.push({
      type: "desire_vs_behavior",
      description: "Желание изменить ситуацию противоречит текущему поведению или убеждениям.",
      evidence: { keywords: ["хочу", "но", "не могу"] },
      confidence: 0.6,
    });
  }

  if (text.includes("деньги") && text.includes("страх") || text.includes("боюсь брать")) {
    tensions.push({
      type: "money_vs_meaning",
      description: "Потребность в доходах может конфликтовать с желанием заниматься осмысленной работой.",
      evidence: { themes: ["деньги / доход", "смысл / призвание"] },
      confidence: 0.5,
    });
  }

  if (text.includes("время") && text.includes("семья") || text.includes("отношения")) {
    tensions.push({
      type: "time_conflict",
      description: "Нагрузка по времени может конфликтовать с личными отношениями.",
      evidence: { themes: ["работа / проекты", "отношения / люди"] },
      confidence: 0.5,
    });
  }

  return tensions;
}
