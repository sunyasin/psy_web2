import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clientUuid = searchParams.get("client_uuid");

    if (!clientUuid) {
      return NextResponse.json({ error: "client_uuid is required" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("*, subscription_tier:subscription_tiers(id, name, price, currency, is_active)")
      .eq("client_uuid", clientUuid)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[subscriptions/memberships] Supabase error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to load memberships" },
        { status: 500 }
      );
    }

    const memberships = (transactions || []).map((t) => ({
      id: t.id,
      client_uuid: t.client_uuid,
      subscription_tier_id: t.subscription_tier_id,
      status: t.status,
      started_at: t.created_at,
      expires_at: t.metadata?.expires_at || null,
      renewal_period: t.metadata?.renewal_period || null,
      external_subscription_id: t.provider_payment_id || null,
      subscription_tier: t.subscription_tier || null,
    }));

    return NextResponse.json({ memberships });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
