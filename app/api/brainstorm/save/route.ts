import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      client_uuid,
      goal_id,
      idea_title,
      idea_description,
      idea_tags,
      messages,
      session_id,
    } = body as {
      client_uuid: string;
      goal_id?: string | null;
      idea_title?: string;
      idea_description?: string;
      idea_tags?: string[];
      messages: { role: "user" | "assistant"; text: string; favorite?: boolean }[];
      session_id?: string | null;
    };

    if (!client_uuid || !messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "client_uuid and messages are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    // Обновляем существующую сессию или создаём новую.
    if (session_id) {
      const { data, error } = await supabase
        .from("brainstorm_sessions")
        .update({
          messages: messages as any,
          idea_title: idea_title || undefined,
          idea_description: idea_description || undefined,
          idea_tags: Array.isArray(idea_tags) ? idea_tags : undefined,
          goal_id: goal_id || undefined,
        })
        .eq("id", session_id)
        .eq("client_uuid", client_uuid)
        .select("id")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, session_id: data?.id });
    }

    const { data, error } = await supabase
      .from("brainstorm_sessions")
      .insert({
        client_uuid,
        goal_id: goal_id || null,
        idea_title: idea_title || "",
        idea_description: idea_description || null,
        idea_tags: Array.isArray(idea_tags) ? idea_tags : [],
        messages: messages as any,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, session_id: data?.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}