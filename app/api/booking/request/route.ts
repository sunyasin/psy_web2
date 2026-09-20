import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_uuid, domain, method_name, contact_info } = body as {
      client_uuid: string;
      domain: string;
      method_name?: string;
      contact_info: string;
    };

    if (!client_uuid || !domain || !contact_info) {
      return NextResponse.json({ error: "client_uuid, domain and contact_info are required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const { error } = await supabase
      .from("booking_requests")
      .insert({
        client_uuid,
        domain,
        method_name: method_name || null,
        contact_info,
        status: "requested",
      });

    if (error) {
      return NextResponse.json({ error: error.message || "Failed to create booking request" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
