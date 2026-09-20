import { NextRequest, NextResponse } from "next/server";

async function sendTelegramMessage(botToken: string, chatId: number | string, text: string): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      console.error("[send/telegram] Failed to send message:", await response.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error("[send/telegram] Error sending message:", err);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
      return NextResponse.json({ error: "BOT_TOKEN not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { client_uuid, results, recipient_chat_id } = body as {
      client_uuid: string;
      results?: unknown;
      recipient_chat_id?: number | string;
    };

    if (!client_uuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const chatId = recipient_chat_id || process.env.TELEGRAM_CHAT_ID;
    if (!chatId) {
      return NextResponse.json(
        { error: "recipient_chat_id or TELEGRAM_CHAT_ID not configured" },
        { status: 400 }
      );
    }

    const text = results ? JSON.stringify(results, null, 2).slice(0, 4000) : "Результаты анкеты";

    const success = await sendTelegramMessage(BOT_TOKEN, chatId, `📋 Результаты анкеты (${client_uuid}):

${text}`);

    if (!success) {
      return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
