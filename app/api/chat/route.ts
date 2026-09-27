import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { callClaude, claudeConfigured } from "@/lib/claude";
import { flattenAnswers, formatNumberedQA, loadQuestionIndex, numberAnswers } from "@/lib/interview-prompt";

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
        .select("id, answers, interview_id")
        .eq("client_uuid", client_uuid)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (session) {
        const answerItems = flattenAnswers(session.answers, session.interview_id as string);
        if (answerItems.length > 0) {
          const questionIndex = await loadQuestionIndex([session.interview_id as string]);
          contextText =
            "Вопросы и ответы пользователя на интервью:\n" +
            formatNumberedQA(numberAnswers(answerItems, questionIndex));
        }

        const { data: analyses } = await supabase
          .from("interview_analyses")
          .select("model_json")
          .eq("interview_session_id", session.id)
          .eq("kind", "short")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const modelJson = analyses?.model_json;
        let ideaList: Array<{ title: string; description: string; tags: string[] }> = [];
        
        if (modelJson?.raw_response) {
          try {
            const cleaned = modelJson.raw_response.replace(/```json\n?|\n?```/g, "").trim();
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed)) {
              ideaList = parsed.slice(0, 5).map((idea: any) => ({
                title: idea.title || "",
                description: idea.description || "",
                tags: Array.isArray(idea.tags) ? idea.tags : [],
              }));
            }
          } catch (err) {
            console.error("Failed to parse model_json raw_response:", err);
          }
        } else if (Array.isArray(modelJson?.ideas)) {
          ideaList = modelJson.ideas.map((idea: any) => ({
            title: idea.title || "",
            description: idea.description || "",
            tags: Array.isArray(idea.tags) ? idea.tags : [],
          }));
        }

        if (ideaList.length > 0) {
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
