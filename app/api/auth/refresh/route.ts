import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const refreshToken: string | undefined = body?.refresh_token;

    if (!refreshToken) {
      return NextResponse.json({ error: "refresh_token обязателен" }, { status: 400 });
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      return NextResponse.json(
        { error: error?.message || "Не удалось обновить сессию" },
        { status: 401 }
      );
    }

    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Неверный запрос" }, { status: 400 });
  }
}
