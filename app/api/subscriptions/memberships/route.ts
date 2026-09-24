import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { isValidUuid } from "@/lib/subscription";

interface MembershipRow {
  id: string;
  client_uuid: string;
  subscription_tier_id: string | null;
  status: string;
  started_at: string;
  expires_at: string | null;
  renewal_period: string | null;
  external_subscription_id: string | null;
  subscription_tier: Record<string, unknown> | null;
  is_paid: boolean;
}

export async function GET(request: NextRequest) {
  const clientUuid = request.nextUrl.searchParams.get("client_uuid");
  if (!isValidUuid(clientUuid)) {
    return NextResponse.json({ error: "Valid client_uuid is required" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServerClient();
    const { data: memberships, error } = await supabase
      .from("memberships")
      .select("*, subscription_tier:subscription_tiers(id, name, description, price, currency, is_active)")
      .eq("client_uuid", clientUuid)
      .order("started_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      memberships: (memberships || []).map((membership: Record<string, unknown>): MembershipRow => ({
        id: String(membership.id || ""),
        client_uuid: String(membership.client_uuid || ""),
        subscription_tier_id: typeof membership.subscription_tier_id === "string" ? membership.subscription_tier_id : null,
        status: String(membership.status || ""),
        started_at: String(membership.started_at || ""),
        expires_at: typeof membership.expires_at === "string" ? membership.expires_at : null,
        renewal_period: typeof membership.renewal_period === "string" ? membership.renewal_period : null,
        external_subscription_id: typeof membership.external_subscription_id === "string" ? membership.external_subscription_id : null,
        subscription_tier: (membership.subscription_tier as Record<string, unknown>) || null,
        is_paid: membership.status === "active" && (!membership.expires_at || new Date(membership.expires_at as string).getTime() > Date.now()),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load memberships" },
      { status: 500 }
    );
  }
}