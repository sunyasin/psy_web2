import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data: tiers, error } = await supabase
      .from("subscription_tiers")
      .select("id, name, description, price, currency, payment_url, tribute_subscription_id, tribute_tier_id, is_active")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      tiers: (tiers || []).map((tier: Record<string, unknown>) => ({
        id: String(tier.id),
        name: String(tier.name || ""),
        description: typeof tier.description === "string" ? tier.description : null,
        price: Number(tier.price || 0),
        currency: String(tier.currency || "RUB"),
        paymentUrl: typeof tier.payment_url === "string" ? tier.payment_url : null,
        tributeSubscriptionId: typeof tier.tribute_subscription_id === "number" ? tier.tribute_subscription_id : null,
        tributeTierId: typeof tier.tribute_tier_id === "number" ? tier.tribute_tier_id : null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load tiers" },
      { status: 500 }
    );
  }
}
