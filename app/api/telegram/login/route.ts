import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { hashBindingToken, verifyTelegramLoginWidget } from "@/lib/telegram";

export async function GET(request: NextRequest) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    return NextResponse.redirect("/tariffs?telegram=error");
  }

  const token = request.nextUrl.searchParams.get("binding_token") || request.nextUrl.searchParams.get("state");
  const hash = request.nextUrl.searchParams.get("hash");
  if (!token || !hash) {
    return NextResponse.redirect("/tariffs?telegram=error");
  }

  const widgetData: Record<string, string> = {};
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (key !== "binding_token" && key !== "state" && typeof value === "string") {
      widgetData[key] = value;
    }
  }

  if (!verifyTelegramLoginWidget(widgetData, BOT_TOKEN)) {
    return NextResponse.redirect("/tariffs?telegram=error");
  }

  const telegramUserId = Number(widgetData.id);
  if (!Number.isSafeInteger(telegramUserId) || telegramUserId <= 0) {
    return NextResponse.redirect("/tariffs?telegram=error");
  }

  try {
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
      return NextResponse.redirect("/tariffs?telegram=expired");
    }

    const { data: existingClient, error: existingClientError } = await supabase
      .from("clients")
      .select("client_uuid, telegram_user_id")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle();

    if (existingClientError) throw existingClientError;
    if (existingClient && existingClient.client_uuid !== binding.client_uuid) {
      return NextResponse.redirect("/tariffs?telegram=conflict");
    }

    const { error: updateError } = await supabase
      .from("clients")
      .update({
        telegram_user_id: telegramUserId,
        telegram_username: widgetData.username || null,
        telegram_first_name: widgetData.first_name || null,
        updated_at: now,
      })
      .eq("client_uuid", binding.client_uuid);

    if (updateError) throw updateError;

    return NextResponse.redirect("/tariffs?telegram=linked");
  } catch {
    return NextResponse.redirect("/tariffs?telegram=error");
  }
}
