import { NextResponse } from "next/server";
import { getSupabaseServerClient, supabase } from "@/lib/supabase";
import {
  isValidLogin,
  LOGIN_MAX_LENGTH,
  LOGIN_MIN_LENGTH,
  loginToAuthEmail,
  normalizeLogin,
} from "@/lib/authIdentity";
import type { ClientRow } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { login: rawLogin, password } = body as {
      login?: string;
      password?: string;
    };

    if (!rawLogin || !password) {
      return NextResponse.json(
        { error: "Логин и пароль обязательны" },
        { status: 400 }
      );
    }

    const login = normalizeLogin(rawLogin);
    if (!isValidLogin(login)) {
      return NextResponse.json(
        { error: `Логин должен быть от ${LOGIN_MIN_LENGTH} до ${LOGIN_MAX_LENGTH} символов` },
        { status: 400 }
      );
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: loginToAuthEmail(login),
      password,
    });

    if (authError || !authData.session) {
      return NextResponse.json(
        { error: "Неверный логин или пароль" },
        { status: 401 }
      );
    }

    const supabaseAdmin = getSupabaseServerClient();
    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("client_uuid, display_name, login, created_at")
      .eq("login", login)
      .limit(1)
      .maybeSingle();

    if (clientError) {
      return NextResponse.json(
        { error: clientError.message || "Не удалось загрузить профиль" },
        { status: 500 }
      );
    }

    if (!client) {
      return NextResponse.json(
        { error: "Профиль не найден" },
        { status: 404 }
      );
    }

    const response: ClientRow & { access_token: string; refresh_token: string | null } = {
      client_uuid: client.client_uuid,
      display_name: client.display_name,
      login: client.login,
      created_at: client.created_at,
      access_token: authData.session.access_token,
      refresh_token: authData.session.refresh_token ?? null,
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Неверный запрос" },
      { status: 400 }
    );
  }
}
