import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";

export async function GET(request: NextRequest) {
  const clientUuid = request.nextUrl.searchParams.get("client_uuid");
  if (!clientUuid) {
    return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
  }

  try {
    const status = await getSubscriptionStatus(clientUuid);
    if (!status) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load subscription status" },
      { status: 500 }
    );
  }
}
