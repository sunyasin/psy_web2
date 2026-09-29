import type { ClientRow } from "@/lib/types";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

export interface AuthSession {
  client_uuid: string;
  display_name?: string | null;
  login?: string | null;
  access_token: string;
  refresh_token?: string | null;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const row = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${name}=`));
  return row ? row.slice(name.length + 1) : null;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage может быть недоступен — продолжаем с cookie
  }
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; path=/; max-age=31536000; SameSite=Lax`;
}

function readToken(key: string): string {
  return readStorage(key) || readCookie(key) || "";
}

export function getAccessToken(): string {
  return readToken(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string {
  return readToken(REFRESH_TOKEN_KEY);
}

export function saveSession(session: AuthSession) {
  const displayName = session.display_name || "";
  const login = session.login || "";

  writeCookie("client_uuid", session.client_uuid);
  writeCookie("display_name", displayName);
  writeCookie("login", login);
  writeStorage("client_uuid", session.client_uuid);
  writeStorage("display_name", displayName);
  writeStorage("login", login);

  if (session.access_token) {
    writeCookie(ACCESS_TOKEN_KEY, session.access_token);
    writeStorage(ACCESS_TOKEN_KEY, session.access_token);
  }
  if (session.refresh_token) {
    writeCookie(REFRESH_TOKEN_KEY, session.refresh_token);
    writeStorage(REFRESH_TOKEN_KEY, session.refresh_token);
  }
}

export function clearAuthTokens() {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    // игнорируем
  }
  if (typeof document !== "undefined") {
    document.cookie = `${ACCESS_TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
    document.cookie = `${REFRESH_TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`;
  }
}

export interface EnterResult extends AuthSession {
  status: "login" | "registered";
}

interface RefreshResult {
  access_token: string;
  refresh_token: string | null;
}

/** Вход, если аккаунт есть, иначе регистрация. */
export async function enterWithCredentials(input: {
  client_uuid: string;
  login: string;
  password: string;
}): Promise<EnterResult> {
  const response = await fetch("/api/auth/enter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Не удалось войти");
  }

  return data as EnterResult;
}

async function fetchProfile(accessToken: string): Promise<ClientRow | null> {
  const response = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return (await response.json()) as ClientRow;
}

async function refreshTokens(refreshToken: string): Promise<boolean> {
  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) return false;

  const data = (await response.json().catch(() => ({}))) as Partial<RefreshResult>;
  if (!data.access_token) return false;

  writeCookie(ACCESS_TOKEN_KEY, data.access_token);
  writeStorage(ACCESS_TOKEN_KEY, data.access_token);
  if (data.refresh_token) {
    writeCookie(REFRESH_TOKEN_KEY, data.refresh_token);
    writeStorage(REFRESH_TOKEN_KEY, data.refresh_token);
  }
  return true;
}

/**
 * Проверяет, выполнен ли вход по логину и паролю.
 * Возвращает профиль клиента или null, если входа нет.
 */
export async function restoreSession(): Promise<ClientRow | null> {
  const accessToken = getAccessToken();
  if (!accessToken) return null;

  const profile = await fetchProfile(accessToken);
  if (profile) return profile;

  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const refreshed = await refreshTokens(refreshToken);
  if (!refreshed) {
    clearAuthTokens();
    return null;
  }

  return fetchProfile(getAccessToken());
}
