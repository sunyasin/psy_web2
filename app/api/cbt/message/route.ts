import { NextResponse } from "next/server";
import { submitCbtMessage } from "@/app/cbt/actions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_uuid, session_id, message } = body as {
      client_uuid: string;
      session_id: string;
      message: string;
    };

    if (!client_uuid || !session_id || !message) {
      return NextResponse.json({ error: "client_uuid, session_id and message are required" }, { status: 400 });
    }

    const state = await submitCbtMessage(client_uuid, session_id, message);

    return NextResponse.json({
      sessionId: state.sessionId,
      messages: state.messages,
      crisisDetected: state.crisisDetected,
      outcome: state.outcome,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
