import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { ClassifyIntentResponse } from "@/lib/types";
import type { IntentPath } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_uuid, raw_answer, classified_path } = body as {
      client_uuid: string;
      raw_answer?: string;
      classified_path: IntentPath;
    };

    if (!client_uuid || !classified_path) {
      return NextResponse.json(
        { error: "client_uuid and classified_path are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from("entry_intent")
      .insert({
        client_uuid,
        raw_answer: raw_answer || null,
        classified_path,
        confirmed: true,
      })
      .select("id, classified_path, confirmed, created_at")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to save intent" },
        { status: 500 }
      );
    }

    const response: ClassifyIntentResponse = {
      id: data.id,
      classified_path: data.classified_path as IntentPath,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
