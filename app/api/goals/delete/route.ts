import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_uuid, goal_id } = body as { client_uuid: string; goal_id: string };

    if (!client_uuid || !goal_id) {
      return NextResponse.json({ error: "client_uuid and goal_id are required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const { error } = await supabase
      .from("goals")
      .update({ status: "trash" })
      .eq("id", goal_id)
      .eq("client_uuid", client_uuid);

    if (error) {
      return NextResponse.json({ error: error.message || "Failed to delete goal" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
