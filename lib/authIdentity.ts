import { createHash } from "node:crypto";

const SYNTHETIC_EMAIL_DOMAIN =
  process.env.AUTH_SYNTHETIC_EMAIL_DOMAIN || "login.qwiz-goal.local";

const CONTROL_CHARS_PATTERN = /[\u0000-\u001f\u007f]/;

export const LOGIN_MIN_LENGTH = 3;
export const LOGIN_MAX_LENGTH = 64;

/** Логины сравниваются без учёта регистра и лишних пробелов. */
export function normalizeLogin(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isValidLogin(login: string): boolean {
  return (
    login.length >= LOGIN_MIN_LENGTH &&
    login.length <= LOGIN_MAX_LENGTH &&
    !CONTROL_CHARS_PATTERN.test(login)
  );
}

/**
 * Supabase Auth работает только с email, поэтому произвольный логин
 * преобразуется в служебный email. Значение детерминированное и однозначное
 * (в логин входит sha256-хвост), поэтому восстанавливать логин из email не нужно —
 * он хранится в user_metadata авторизации и в clients.login.
 */
export function loginToAuthEmail(login: string): string {
  const normalized = normalizeLogin(login);
  const digest = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  const slug = normalized
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  return `${slug ? `${slug}-` : "u-"}${digest}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
