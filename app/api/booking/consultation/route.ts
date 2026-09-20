import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_uuid } = body as { client_uuid: string };

    if (!client_uuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const { error: bookingError } = await supabase
      .from("booking_requests")
      .insert({
        client_uuid,
        domain: "consultation",
        method_name: "онлайн консультация",
        contact_info: null,
        status: "requested",
      });

    if (bookingError) {
      return NextResponse.json(
        { error: bookingError.message || "Failed to create booking request" },
        { status: 500 }
      );
    }

    console.log("[booking/consultation] Telegram notification: STUB - would send message to specialist");
    console.log("[booking/consultation] Email notification: STUB - would send email to client and specialist");

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
