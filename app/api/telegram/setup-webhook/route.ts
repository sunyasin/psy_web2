import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
      return NextResponse.json({ error: "BOT_TOKEN not configured" }, { status: 500 });
    }

    const body = await request.json();
    const { webhook_url } = body as { webhook_url: string };

    if (!webhook_url) {
      return NextResponse.json({ error: "webhook_url is required" }, { status: 400 });
    }

    const response = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhook_url)}`
    );

    const data = await response.json();

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
