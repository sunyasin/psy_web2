import { NextResponse } from "next/server";
import { getSupabaseServerClient, supabase } from "@/lib/supabase";
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

    const supabaseAdmin = getSupabaseServerClient();
    const client = await supabaseAdmin
      .from("clients")
      .select("client_uuid, display_name, email, created_at")
      .eq("email", user.email)
      .single();

    if (client.error || !client.data) {
      return NextResponse.json(
        { error: "Профиль не найден" },
        { status: 404 }
      );
    }

    const response: ClientRow = {
      client_uuid: client.data.client_uuid,
      display_name: client.data.display_name,
      email: client.data.email,
      created_at: client.data.created_at,
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json(
      { error: "Неверный запрос" },
      { status: 400 }
    );
  }
}
