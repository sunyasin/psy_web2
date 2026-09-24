import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Use /api/subscriptions/tribute-webhook" }, { status: 404 });
}
