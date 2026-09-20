import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

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
      console.error("[telegram/webhook] Failed to send message:", await response.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error("[telegram/webhook] Error sending message:", err);
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
    const message = body?.message;

    if (!message || !message?.from?.id) {
      return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
    }

    const telegramUserId = message.from.id;
    const username = message.from.username || null;
    const firstName = message.from.first_name || null;
    const chatId = message.chat?.id;
    const text = (message.text || "").trim();

    const supabase = getSupabaseServerClient();

    // Handle /start command
    if (text === "/start") {
      if (chatId) {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          `👋 Привет! Для привязки Telegram аккаунта, пришли свой client_uuid.

🔍 Твой client_uuid можно найти в настройках приложения или скопировать из URL.

Пример: 550e8400-e29b-41d4-a716-446655440000`
        );
      }

      return NextResponse.json({ success: true, needsClientUuid: true });
    }

    // Handle /help command
    if (text === "/help") {
      if (chatId) {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          `🤖 Бот привязки Telegram

📝 Отправь свой client_uuid для привязки.

📍 Где взять client_uuid:
• Настройки → Профиль
• Или скопируй из приложения`
        );
      }

      return NextResponse.json({ success: true });
    }

    // Check if text is a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(text)) {
      if (chatId) {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          `❌ Не удалось распознать client_uuid.

Отправь /start для инструкции или пришли свой UUID в правильном формате.`
        );
      }

      return NextResponse.json({ success: true, needsClientUuid: true });
    }

    const clientUuid = text.toLowerCase();

    // Find client by UUID
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, client_uuid, telegram_user_id")
      .eq("client_uuid", clientUuid)
      .single();

    if (clientError || !client) {
      if (chatId) {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          `❌ Клиент с UUID <code>${clientUuid}</code> не найден.

Проверь правильность UUID и попробуй снова.`
        );
      }

      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // Check if already linked
    if (client.telegram_user_id && client.telegram_user_id !== telegramUserId) {
      if (chatId) {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          `⚠️ Этот Telegram ID уже привязан к другому аккаунту.`
        );
      }

      return NextResponse.json({ error: "Already linked" }, { status: 409 });
    }

    // Link telegram_user_id to client
    const { error: updateError } = await supabase
      .from("clients")
      .update({
        telegram_user_id: telegramUserId,
        telegram_username: username,
        telegram_first_name: firstName,
        telegram_chat_id: chatId,
        updated_at: new Date().toISOString(),
      })
      .eq("client_uuid", clientUuid);

    if (updateError) {
      console.error("[telegram/webhook] Update error:", updateError);

      if (chatId) {
        await sendTelegramMessage(
          BOT_TOKEN,
          chatId,
          "❌ Ошибка при привязке. Попробуйте позже."
        );
      }

      return NextResponse.json({ error: "Failed to link" }, { status: 500 });
    }

    // Send confirmation
    if (chatId) {
      await sendTelegramMessage(
        BOT_TOKEN,
        chatId,
        `✅ Telegram успешно привязан!

🔗 Client UUID: <code>${clientUuid}</code>
🆔 Telegram ID: <code>${telegramUserId}</code>
${username ? `👤 @${username}` : ""}`
      );
    }

    return NextResponse.json({
      success: true,
      client_uuid: clientUuid,
      telegramUserId,
    });
  } catch (error) {
    console.error("[telegram/webhook] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 400 }
    );
  }
}
