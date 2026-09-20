import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { client_uuid, subscriptionTierId } = body as {
      client_uuid: string;
      subscriptionTierId: string;
    };

    if (!client_uuid || !subscriptionTierId) {
      return NextResponse.json(
        { error: "client_uuid and subscriptionTierId are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    const { data: tier, error: tierError } = await supabase
      .from("subscription_tiers")
      .select("id, name, price, currency, is_active")
      .eq("id", subscriptionTierId)
      .eq("is_active", true)
      .single();

    if (tierError || !tier) {
      return NextResponse.json(
        { error: "Subscription tier not found or not active" },
        { status: 404 }
      );
    }

    const transactionId = crypto.randomUUID();
    const idempotencyKey = `${client_uuid}-${subscriptionTierId}-${Date.now()}`;

    const { error: insertError } = await supabase.from("transactions").insert({
      id: transactionId,
      client_uuid,
      subscription_tier_id: subscriptionTierId,
      amount: tier.price,
      currency: tier.currency || "RUB",
      status: "paid",
      provider: "internal",
      idempotency_key: idempotencyKey,
      description: `Подписка: ${tier.name}`,
      metadata: { tier_name: tier.name, tier_price: tier.price },
    });

    if (insertError) {
      console.error("[subscriptions/create] Insert error:", insertError);
      return NextResponse.json(
        { error: "Failed to create transaction" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      confirmationUrl: `/results`,
      transactionId,
      paymentId: transactionId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid request" },
      { status: 400 }
    );
  }
}
