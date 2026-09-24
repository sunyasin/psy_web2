import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const BINDING_TOKEN_TTL_MS = 10 * 60 * 1000;

export function hashBindingToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createBindingToken(): { token: string; tokenHash: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + BINDING_TOKEN_TTL_MS).toISOString();

  return {
    token,
    tokenHash: hashBindingToken(token),
    expiresAt,
  };
}

export function getTelegramBotUrl(token?: string): string | null {
  const configuredUrl = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL?.trim();
  if (!configuredUrl) return null;

  const url = new URL(configuredUrl);
  if (token) url.searchParams.set("start", token);
  return url.toString();
}

export function getLoginWidgetAuthUrl(token: string): string | null {
  const botId = process.env.TELEGRAM_BOT_ID?.trim();
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  if (!botId || !frontendUrl) return null;

  const redirectUri = `${frontendUrl.replace(/\/$/, "")}/api/telegram/login?binding_token=${encodeURIComponent(token)}`;
  const url = new URL("https://oauth.telegram.org/auth");
  url.searchParams.set("bot_id", botId);
  url.searchParams.set("origin", frontendUrl.replace(/\/$/, ""));
  url.searchParams.set("request_access", "write");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", token);
  return url.toString();
}

export function verifyTelegramLoginWidget(
  data: Record<string, string>,
  botToken: string
): boolean {
  const { hash, ...fields } = data;
  const authDate = Number(fields.auth_date);
  const now = Math.floor(Date.now() / 1000);

  if (!hash || !Number.isFinite(authDate) || authDate > now || now - authDate > 86400) {
    return false;
  }

  const checkString = Object.entries(fields)
    .filter(([key, value]) => key !== "hash" && typeof value === "string")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(checkString).digest();
  const actual = Buffer.from(hash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: number | string,
  text: string
): Promise<boolean> {
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
      console.error("[telegram] Failed to send message:", response.status);
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
