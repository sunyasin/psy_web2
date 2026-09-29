import { NextResponse } from "next/server";
import { getSupabaseServerClient, supabase } from "@/lib/supabase";
import { isValidUuid } from "@/lib/subscription";
import {
  isValidLogin,
  LOGIN_MAX_LENGTH,
  LOGIN_MIN_LENGTH,
  loginToAuthEmail,
  normalizeLogin,
} from "@/lib/authIdentity";
import type { ClientRow } from "@/lib/types";

interface EnterBody {
  client_uuid?: string;
  login?: string;
  password?: string;
}

const ALREADY_EXISTS_CODES = new Set(["email_exists", "user_already_exists", "conflict"]);

function isAlreadyExistsError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code && ALREADY_EXISTS_CODES.has(error.code)) return true;
  const message = (error.message || "").toLowerCase();
  return message.includes("already") || message.includes("duplicate") || message.includes("taken");
}

async function findClientByLogin(login: string): Promise<ClientRow | null> {
  const supabaseAdmin = getSupabaseServerClient();
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select("client_uuid, display_name, login, created_at")
    .eq("login", login)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message || "Failed to load client");
  return (data as ClientRow | null) ?? null;
}

/**
 * Возвращает клиента, которому принадлежит аккаунт с таким логином.
 * Если клиента с таким логином ещё нет — аккаунт привязывается к текущей сессии.
 */
async function resolveClient(login: string, currentUuid: string): Promise<ClientRow> {
  const existing = await findClientByLogin(login);
  if (existing) return existing;

  const supabaseAdmin = getSupabaseServerClient();
  const { data, error } = await supabaseAdmin
    .from("clients")
    .update({ login, updated_at: new Date().toISOString() })
    .eq("client_uuid", currentUuid)
    .select("client_uuid, display_name, login, created_at")
    .maybeSingle();

  if (error) throw new Error(error.message || "Failed to update client");
  if (!data) throw new Error("Client not found");

  return data as ClientRow;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EnterBody;
    const clientUuid = body.client_uuid;
    const password = body.password;

    if (!body.login || !password) {
      return NextResponse.json(
        { error: "Логин и пароль обязательны" },
        { status: 400 }
      );
    }

    const login = normalizeLogin(body.login);

    if (!isValidLogin(login)) {
      return NextResponse.json(
        { error: `Логин должен быть от ${LOGIN_MIN_LENGTH} до ${LOGIN_MAX_LENGTH} символов` },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Пароль должен быть не менее 6 символов" },
        { status: 400 }
      );
    }

    if (!isValidUuid(clientUuid)) {
      return NextResponse.json(
        { error: "Действующая сессия не найдена" },
        { status: 400 }
      );
    }

    const authEmail = loginToAuthEmail(login);
    const supabaseAdmin = getSupabaseServerClient();

    // Аккаунт уже существует — вход, иначе — регистрация.
    const { data: createdUser, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: { login },
      });

    const registered = Boolean(createdUser?.user) && !createError;

    if (createError && !isAlreadyExistsError(createError)) {
      return NextResponse.json(
        { error: createError.message || "Не удалось обработать аккаунт" },
        { status: 400 }
      );
    }

    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password,
    });

    if (signInError || !authData.session) {
      if (registered) {
        await supabaseAdmin.auth.admin.deleteUser(createdUser!.user!.id);
        return NextResponse.json(
          { error: "Не удалось войти в созданный аккаунт" },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: "Неверный логин или пароль" },
        { status: 401 }
      );
    }

    let client: ClientRow;
    try {
      client = await resolveClient(login, clientUuid);
    } catch (error) {
      if (registered) {
        await supabaseAdmin.auth.admin.deleteUser(createdUser!.user!.id);
      }
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Не удалось сохранить профиль" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        status: registered ? "registered" : "login",
        client_uuid: client.client_uuid,
        display_name: client.display_name,
        login: client.login,
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token ?? null,
      },
      { status: registered ? 201 : 200 }
    );
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }
}
