import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { client_uuid, status } = body as {
      client_uuid: string;
      status: string;
    };

    if (!client_uuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from("transactions")
      .update({ status: status || "paid", updated_at: new Date().toISOString() })
      .eq("client_uuid", client_uuid)
      .order("created_at", { ascending: false })
      .limit(1)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to update transaction" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, transaction: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
