import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { InitClientResponse } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { display_name, email } = body as { display_name?: string; email?: string };

    const supabase = getSupabaseServerClient();

    let clientUuid = crypto.randomUUID();

    if (email) {
      const existing = await supabase
        .from("clients")
        .select("client_uuid")
        .eq("email", email)
        .maybeSingle();

      if (existing.data?.client_uuid) {
        clientUuid = existing.data.client_uuid;
      }
    }

    const { data, error } = await supabase
      .from("clients")
      .upsert({
        client_uuid: clientUuid,
        display_name: display_name || null,
        email: email || null,
      })
      .select("client_uuid, display_name, email, created_at")
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
      email: data.email,
    };

    return NextResponse.json(response, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
