import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { hashBindingToken, sendTelegramMessage } from "@/lib/telegram";

function parseStartToken(text: string): string | null {
  const match = text.trim().match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]+)$/);
  return match?.[1] || null;
}

export async function POST(request: NextRequest) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "BOT_TOKEN not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const message = body?.message;
    if (!message?.from?.id || typeof message.text !== "string") {
      return NextResponse.json({ ok: true });
    }

    const token = parseStartToken(message.text);
    if (!token) {
      if ((message.text.trim() === "/start" || message.text.trim() === "/help") && message.chat?.id) {
        await sendTelegramMessage(
          BOT_TOKEN,
          message.chat.id,
          "Для привязки нажмите кнопку в приложении, затем отправьте боту команду /start с предложенной ссылкой."
        );
      }
      return NextResponse.json({ ok: true });
    }

    const supabase = getSupabaseServerClient();
    const now = new Date().toISOString();
    const { data: binding, error: bindingError } = await supabase
      .from("telegram_binding_tokens")
      .update({ used_at: now })
      .eq("token_hash", hashBindingToken(token))
      .is("used_at", null)
      .gt("expires_at", now)
      .select("client_uuid")
      .maybeSingle();

    if (bindingError || !binding) {
      if (message.chat?.id) {
        await sendTelegramMessage(BOT_TOKEN, message.chat.id, "Ссылка привязки истекла или уже использована. Запросите новую ссылку в приложении.");
      }
      return NextResponse.json({ ok: true });
    }

    const telegramUserId = Number(message.from.id);
    const username = typeof message.from.username === "string" ? message.from.username : null;
    const firstName = typeof message.from.first_name === "string" ? message.from.first_name : null;
    const chatId = message.chat?.id;

    const { data: existingClient, error: existingClientError } = await supabase
      .from("clients")
      .select("client_uuid, telegram_user_id")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (existingClientError) {
      if (chatId) await sendTelegramMessage(BOT_TOKEN, chatId, "Не удалось завершить привязки. Попробуйте позже.");
      return NextResponse.json({ ok: true });
    }

    if (existingClient && existingClient.client_uuid !== binding.client_uuid) {
      if (chatId) await sendTelegramMessage(BOT_TOKEN, chatId, "Этот Telegram аккаунт уже привязан к другому профилю.");
      return NextResponse.json({ ok: true, conflict: true });
    }

    const { error: updateError } = await supabase
      .from("clients")
      .update({
        telegram_user_id: telegramUserId,
        telegram_username: username,
        telegram_first_name: firstName,
        telegram_chat_id: chatId ?? null,
        updated_at: now,
      })
      .eq("client_uuid", binding.client_uuid);

    if (updateError) {
      if (chatId) await sendTelegramMessage(BOT_TOKEN, chatId, "Не удалось завершить привязку. Попробуйте позже.");
      return NextResponse.json({ ok: true });
    }

    if (chatId) {
      await sendTelegramMessage(BOT_TOKEN, chatId, "Telegram аккаунт успешно привязан. Теперь можно оформить подписку в приложении.");
    }

    return NextResponse.json({ ok: true, linked: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
