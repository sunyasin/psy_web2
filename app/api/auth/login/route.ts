import { NextResponse } from "next/server";
import { getSupabaseServerClient, supabase } from "@/lib/supabase";
import type { ClientRow } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email и пароль обязательны" },
        { status: 400 }
      );
    }

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: "Неверный email или пароль" },
        { status: 401 }
      );
    }

    const supabaseAdmin = getSupabaseServerClient();
    const client = await supabaseAdmin
      .from("clients")
      .select("client_uuid, display_name, email, created_at")
      .eq("email", email)
      .single();

    if (client.error || !client.data) {
      const clientUuid = crypto.randomUUID();
      const { data: newClient, error: insertError } = await supabaseAdmin
        .from("clients")
        .insert({
          client_uuid: clientUuid,
          email,
        })
        .select("client_uuid, display_name, email, created_at")
        .single();

      if (insertError || !newClient) {
        return NextResponse.json(
          { error: insertError?.message || "Не удалось создать профиль" },
          { status: 500 }
        );
      }

      const response: ClientRow & { access_token: string } = {
        client_uuid: newClient.client_uuid,
        display_name: newClient.display_name,
        email: newClient.email,
        created_at: newClient.created_at,
        access_token: authData.session.access_token,
      };

      return NextResponse.json(response);
    }

    const response: ClientRow & { access_token: string } = {
      client_uuid: client.data.client_uuid,
      display_name: client.data.display_name,
      email: client.data.email,
      created_at: client.data.created_at,
      access_token: authData.session.access_token,
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Неверный запрос" },
      { status: 400 }
    );
  }
}
