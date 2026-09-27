import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { ClientRow } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const displayName = request.nextUrl.searchParams.get("display_name");
    const email = request.nextUrl.searchParams.get("email");

    if (!displayName || !email) {
      return NextResponse.json(
        { error: "display_name и email обязательны" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    const { data: client, error } = await supabase
      .from("clients")
      .select("client_uuid, display_name, email, created_at")
      .eq("display_name", displayName)
      .eq("email", email)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to lookup client" },
        { status: 500 }
      );
    }

    if (!client) {
      return NextResponse.json({ found: false }, { status: 404 });
    }

    const response: ClientRow & { found: true } = {
      client_uuid: client.client_uuid,
      display_name: client.display_name,
      email: client.email,
      created_at: client.created_at,
      found: true,
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
