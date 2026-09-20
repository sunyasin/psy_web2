import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { client_uuid, email, results } = body as {
      client_uuid: string;
      email: string;
      results?: unknown;
    };

    if (!client_uuid || !email) {
      return NextResponse.json({ error: "client_uuid and email are required" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    console.log("[send/email] STUB: would send questionnaire results to email:", email);
    console.log("[send/email] client_uuid:", client_uuid);
    console.log("[send/email] results:", JSON.stringify(results));

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
