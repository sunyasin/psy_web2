import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { InitClientResponse } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { display_name } = body as { display_name?: string };

    const supabase = getSupabaseServerClient();
    const clientUuid = crypto.randomUUID();

    const { data, error } = await supabase
      .from("clients")
      .upsert({
        client_uuid: clientUuid,
        display_name: display_name || null,
      })
      .select("client_uuid, display_name, login, created_at")
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to create client" },
        { status: 500 }
      );
    }

    const response: InitClientResponse = {
      client_uuid: data.client_uuid,
      display_name: data.display_name,
      login: data.login,
    };

    return NextResponse.json(response, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
