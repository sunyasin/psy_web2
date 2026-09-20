import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { callClaude, claudeConfigured } from "@/lib/claude";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_uuid, idea_title, idea_description, idea_tags, message, history = [] } = body;

    if (!client_uuid || !message || typeof message !== "string") {
      return NextResponse.json({ error: "client_uuid and message are required" }, { status: 400 });
    }

    const systemPrompt = `Ты — креативный партнёр для брейншторма. Ты говоришь по-русски. Твоя задача — помогать пользователю генерировать идеи, развивать и углублять выбранную идею.

Контекст идеи:
Название: ${idea_title}
Описание: ${idea_description}
Теги: ${Array.isArray(idea_tags) ? idea_tags.join(", ") : ""}

Правила:
1. Будь конкретным и практичным.
2. Предлагай разные направления развития идеи.
3. Задавай уточняющие вопросы, если нужно больше контекста.
4. Помогай с оценкой идей — плюсы, минусы, риски.
5. Не повторяйся, предлагай свежие углы.
6. Отвечай строго на русском.`;

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

    const response = await callClaude(messages, systemPrompt, { max_tokens: 4096, temperature: 0.8 });

    return NextResponse.json({ response });
  } catch (err) {
    console.error("[brainstorm] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat error" },
      { status: 500 }
    );
  }
}
