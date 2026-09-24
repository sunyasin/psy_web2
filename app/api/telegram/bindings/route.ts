import { NextRequest, NextResponse } from "next/server";
import { createBindingToken, getLoginWidgetAuthUrl, getTelegramBotUrl, hashBindingToken } from "@/lib/telegram";
import { getSupabaseServerClient } from "@/lib/supabase";
import { isValidUuid } from "@/lib/subscription";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientUuid = body?.client_uuid;

    if (!isValidUuid(clientUuid)) {
      return NextResponse.json({ error: "Valid client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("client_uuid")
      .eq("client_uuid", clientUuid)
      .maybeSingle();

    if (clientError || !client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const binding = createBindingToken();
    try {
      const { error: insertError } = await supabase.from("telegram_binding_tokens").insert({
        id: crypto.randomUUID(),
        client_uuid: clientUuid,
        token_hash: hashBindingToken(binding.token),
        expires_at: binding.expiresAt,
      });

      if (insertError && insertError.code !== "PGRST205" && insertError.code !== "42P01") {
        throw insertError;
      }
    } catch {
      // telegram_binding_tokens table may not exist yet; return token without persistence
    }

    return NextResponse.json({
      token: binding.token,
      botUrl: getTelegramBotUrl(binding.token),
      loginWidgetAuthUrl: getLoginWidgetAuthUrl(binding.token),
      expiresAt: binding.expiresAt,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Telegram binding" },
      { status: 500 }
    );
  }
}
