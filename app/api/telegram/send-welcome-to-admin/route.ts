import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { sendTelegramMessage } from "@/lib/telegram";
import { isValidUuid } from "@/lib/subscription";

const ADMIN_CHAT = "@yasinsunny";

export async function POST(request: NextRequest) {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    return NextResponse.json({ error: "BOT_TOKEN not configured" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const clientUuid = typeof body?.client_uuid === "string" ? body.client_uuid : "";

  if (!isValidUuid(clientUuid)) {
    return NextResponse.json({ error: "Valid client_uuid is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("telegram_user_id, telegram_username, telegram_first_name, login")
    .eq("client_uuid", clientUuid)
    .maybeSingle();

  if (clientError || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  if (!client.telegram_user_id) {
    return NextResponse.json({ error: "Telegram account is not linked" }, { status: 409 });
  }

  // Get the welcome interview id
  const { data: welcomeInterview, error: interviewError } = await supabase
    .from("interview")
    .select("id")
    .eq("code", "welcome")
    .maybeSingle();

  if (interviewError || !welcomeInterview) {
    return NextResponse.json({ error: "Welcome interview not found", sent: false });
  }

  // Get the completed welcome interview session
  const { data: session, error: sessionError } = await supabase
    .from("interview_sessions")
    .select("answers, created_at")
    .eq("client_uuid", clientUuid)
    .eq("interview_id", welcomeInterview.id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Welcome interview not completed", sent: false });
  }

  const answers: Record<string, Record<string, string>> = (session.answers as Record<string, Record<string, string>>) ?? {};
  const blocks = Object.entries(answers).sort(([a], [b]) => Number(a) - Number(b));
  if (blocks.length === 0) {
    return NextResponse.json({ error: "No answers found", sent: false });
  }

  interface ConfigQuestion {
    order: number;
    text: string;
  }
  const questions: Record<number, ConfigQuestion[]> = {};
  try {
    const { data: configs } = await supabase
      .from("interview_config")
      .select("block_number, questions")
      .eq("interview_id", welcomeInterview.id)
      .eq("active", true);
    for (const cfg of (configs ?? []) as Array<{ block_number: number; questions: unknown }>) {
      for (const q of (cfg.questions as ConfigQuestion[] | undefined) ?? []) {
        const bucket = questions[Number(cfg.block_number)] || [];
        bucket.push({ order: q.order, text: q.text });
        questions[Number(cfg.block_number)] = bucket;
      }
    }
  } catch {
    // config lookup is best-effort
  }

  const userTag = client.telegram_username
    ? `@${client.telegram_username}`
    : client.telegram_first_name || "—";
  const login = client.login || "—";

  let text = `🎫 Новый пользователь привязал Telegram\n\n`;
  text += `👤 Логин: ${login}\n`;
  text += `🆔 Telegram id: ${client.telegram_user_id}\n`;
  text += `Ник: ${userTag}\n\n`;
  text += `📝 Ответы на входное интервью:\n`;

  let idx = 0;
  for (const [block, blockAnswers] of blocks) {
    const cfgQuestions = questions[Number(block)] || [];
    for (const [order, answer] of Object.entries(blockAnswers)) {
      idx += 1;
      const cfg = cfgQuestions.find((q) => String(q.order) === String(order));
      const qText = cfg?.text ?? `Вопрос ${order}`;
      text += `\n${idx}. ${qText}\n   ${String(answer || "").replace(/\n/g, "\n   ")}`;
    }
  }

  text += `\n\n🕐 ${new Date(session.created_at).toISOString()}`;

  const success = await sendTelegramMessage(BOT_TOKEN, ADMIN_CHAT, text);
  return NextResponse.json({ success });
}