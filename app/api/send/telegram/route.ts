import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

async function sendTelegramMessage(botToken: string, chatId: number | string, text: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });

    if (!response.ok) {
      return false;
    }

    return true;
  } catch {
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
    const clientUuid = typeof body?.client_uuid === "string" ? body.client_uuid : "";
    const results = body?.results;

    if (!clientUuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("telegram_chat_id, telegram_user_id")
      .eq("client_uuid", clientUuid)
      .maybeSingle();

    if (clientError || !client?.telegram_chat_id) {
      return NextResponse.json({ error: "Telegram account is not linked" }, { status: 409 });
    }

    const text = results ? JSON.stringify(results, null, 2).slice(0, 4000) : "Результаты анкеты";
    const success = await sendTelegramMessage(BOT_TOKEN, client.telegram_chat_id, `📋 Результаты анкеты:\n\n${text}`);

    if (!success) {
      return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 }
    );
  }
}
