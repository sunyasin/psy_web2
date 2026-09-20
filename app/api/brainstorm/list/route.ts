import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientUuid = searchParams.get("client_uuid");
    const goalId = searchParams.get("goal_id");

    if (!clientUuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    let query = supabase
      .from("brainstorm_sessions")
      .select("*")
      .eq("client_uuid", clientUuid)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (goalId) {
      query = query.eq("goal_id", goalId);
    } else {
      // Без goal_id возвращаем последнюю сессию клиента.
      // (query уже содержит limit 1)
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ session: data || null });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}