import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { ClientRow } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, display_name } = body as {
      email?: string;
      password?: string;
      display_name?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email и пароль обязательны" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Пароль должен быть не менее 6 символов" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseServerClient();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || "Не удалось создать пользователя" },
        { status: 400 }
      );
    }

    const { data: signInData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData.session) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: signInError?.message || "Не удалось войти в созданный аккаунт" },
        { status: 500 }
      );
    }

    const clientUuid = crypto.randomUUID();

    const { data: clientData, error: clientError } = await supabaseAdmin
      .from("clients")
      .insert({
        client_uuid: clientUuid,
        email,
        display_name: display_name || null,
      })
      .select("client_uuid, display_name, email, created_at")
      .single();

    if (clientError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: clientError.message || "Не удалось создать профиль" },
        { status: 500 }
      );
    }

    const response: ClientRow & { access_token: string } = {
      client_uuid: clientData.client_uuid,
      display_name: clientData.display_name,
      email: clientData.email,
      created_at: clientData.created_at,
      access_token: signInData.session.access_token,
    };

    return NextResponse.json(response, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Неверный запрос" },
      { status: 400 }
    );
  }
}
