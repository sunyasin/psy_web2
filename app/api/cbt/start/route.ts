import { NextResponse } from "next/server";
import { startCbtSession } from "@/app/cbt/actions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_uuid, related_flag_id, domain } = body as {
      client_uuid: string;
      related_flag_id?: string;
      domain?: string;
    };

    if (!client_uuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const state = await startCbtSession(client_uuid, related_flag_id, domain);

    return NextResponse.json({
      sessionId: state.sessionId,
      messages: state.messages,
      crisisDetected: state.crisisDetected,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
