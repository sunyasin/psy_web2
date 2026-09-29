import { NextResponse } from "next/server";
import { getSupabaseServerClient, supabase } from "@/lib/supabase";
import { normalizeLogin } from "@/lib/authIdentity";
import type { ClientRow } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Не авторизован" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Неверный токен" },
        { status: 401 }
      );
    }

    const rawLogin = user.user_metadata?.login;
    if (typeof rawLogin !== "string" || !rawLogin) {
      return NextResponse.json(
        { error: "У аккаунта не задан логин" },
        { status: 404 }
      );
    }

    const supabaseAdmin = getSupabaseServerClient();
    const { data: client, error: clientError } = await supabaseAdmin
      .from("clients")
      .select("client_uuid, display_name, login, created_at")
      .eq("login", normalizeLogin(rawLogin))
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

    const response: ClientRow = {
      client_uuid: client.client_uuid,
      display_name: client.display_name,
      login: client.login,
      created_at: client.created_at,
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Неверный запрос" },
      { status: 400 }
    );
  }
}
