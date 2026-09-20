import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_uuid, tension_id, confirmed } = body as {
      client_uuid: string;
      tension_id: string;
      confirmed: boolean;
    };

    if (!client_uuid || !tension_id) {
      return NextResponse.json({ error: "client_uuid and tension_id are required" }, { status: 400 });
    }

    const newStatus = confirmed ? "user_confirmed" : "dismissed";

    const supabase = getSupabaseServerClient();

    const { error } = await supabase
      .from("tension_flags")
      .update({ status: newStatus })
      .eq("id", tension_id)
      .eq("client_uuid", client_uuid);

    if (error) {
      return NextResponse.json({ error: error.message || "Failed to update tension" }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
