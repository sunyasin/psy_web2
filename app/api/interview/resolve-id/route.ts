import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const { data: interview, error } = await supabase
      .from("interview")
      .select("id")
      .eq("code", code)
      .eq("visible", true)
      .single();

    if (error || !interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    return NextResponse.json({ interview_id: interview.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}