import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientUuid = searchParams.get("client_uuid");

    if (!clientUuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("brainstorm_sessions")
      .select("goal_id, id, messages")
      .eq("client_uuid", clientUuid);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Возвращаем маппинг goal_id -> true, чтобы фронтенд мог проверить,
    // была ли работа по брейншторму для каждой цели.
    const workedGoalIds = new Set((data || []).map((row: any) => row.goal_id));
    return NextResponse.json({ workedGoalIds: Array.from(workedGoalIds) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}