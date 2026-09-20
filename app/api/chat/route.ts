import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { callClaude, claudeConfigured } from "@/lib/claude";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_uuid, message, history = [], selected_indices = [] } = body;

    if (!client_uuid || !message || typeof message !== "string") {
      return NextResponse.json({ error: "client_uuid and message are required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    let contextText = "";

    if (history.length === 0) {
      const { data: session } = await supabase
        .from("interview_sessions")
        .select("id, answers")
        .eq("client_uuid", client_uuid)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (session) {
        const answers = (session.answers as Record<string, Record<string, string>>) || {};
        const lines: string[] = [];
        for (const [block, blockAnswers] of Object.entries(answers)) {
          if (block === "block4_trigger") continue;
          if (typeof blockAnswers !== "object" || blockAnswers === null) continue;
          for (const [order, text] of Object.entries(blockAnswers)) {
            lines.push(`Блок ${block}, вопрос ${order}: ${text}`);
          }
        }
        if (lines.length > 0) {
          contextText = "Ответы пользователя на интервью:\n" + lines.join("\n");
        }

        const { data: analyses } = await supabase
          .from("interview_analyses")
          .select("ideas")
          .eq("interview_session_id", session.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (analyses?.ideas && Array.isArray(analyses.ideas) && analyses.ideas.length > 0) {
          const ideaList = analyses.ideas as Array<{ title: string; description: string; tags: string[] }>;
          const ideasToInclude =
            selected_indices.length > 0
              ? selected_indices
                  .map((idx: number) => ideaList[idx])
                  .filter(Boolean)
              : ideaList;

          contextText += "\n\nАнализ ответов (идеи):\n";
          ideasToInclude.forEach((idea: { title: string; description: string; tags: string[] }, idx: number) => {
            contextText += `${idx + 1}. ${idea.title}: ${idea.description}\n`;
          });
        }
      }
    }

    const systemPrompt = `Ты — карьерный и жизненный стратег. Ты говоришь по-русски. Отвечай на вопросы пользователя, опираясь на его интервью и анализ. Будь конкретным и практичным.${
      contextText ? `\n\nКонтекст:\n${contextText}` : ""
    }`;

    const messages: { role: "user" | "assistant"; text: string }[] = [];

    for (const msg of history) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role, text: msg.text });
      }
    }

    // Разговор должен заканчиваться user-сообщением — текущий запрос идёт в конец.
    messages.push({ role: "user", text: message });

    if (!claudeConfigured()) {
      return NextResponse.json({
        response: "Извини, модель временно недоступна. Попробуй позже.",
      });
    }

    const response = await callClaude(messages, systemPrompt, { max_tokens: 4096, temperature: 0.7 });

    return NextResponse.json({ response });
  } catch (err) {
    console.error("[chat] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat error" },
      { status: 500 }
    );
  }
}
