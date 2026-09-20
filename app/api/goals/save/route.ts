import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_uuid, title, description, tags, source_analysis_id } = body as {
      client_uuid: string;
      title: string;
      description?: string;
      tags?: string[];
      source_analysis_id?: string | null;
    };

    if (!client_uuid || !title) {
      return NextResponse.json({ error: "client_uuid and title are required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const smartJson: Record<string, any> = {};
    if (description) smartJson.description = description;
    if (Array.isArray(tags)) smartJson.tags = tags;

    // Проверяем, не существует ли уже цели с тем же (client_uuid, title).
    // UNIQUE constraint (client_uuid, title) предотвращает дубли.
    const { data: existing, error: selectError } = await supabase
      .from("goals")
      .select("id, status")
      .eq("client_uuid", client_uuid)
      .eq("title", title)
      .maybeSingle();

    if (selectError) {
      return NextResponse.json({ error: selectError.message }, { status: 500 });
    }

    if (existing) {
      // Цель уже есть — возвращаем её id. Обновляем smart_json и source_analysis_id,
      // если они были переданы и отличаются.
      const updatePayload: Record<string, any> = {};
      if (Object.keys(smartJson).length > 0) updatePayload.smart_json = smartJson;
      if (source_analysis_id) updatePayload.source_analysis_id = source_analysis_id;

      if (Object.keys(updatePayload).length > 0) {
        await supabase
          .from("goals")
          .update(updatePayload)
          .eq("id", existing.id)
          .eq("client_uuid", client_uuid);
      }

      return NextResponse.json({ success: true, goal: { id: existing.id }, existed: true });
    }

    // Новая цель.
    const { data, error } = await supabase
      .from("goals")
      .insert({
        client_uuid,
        title,
        smart_json: smartJson,
        status: "active",
        source_analysis_id: source_analysis_id || null,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message || "Failed to save goal" }, { status: 500 });
    }

    return NextResponse.json({ success: true, goal: data ? { id: data.id } : null, existed: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}