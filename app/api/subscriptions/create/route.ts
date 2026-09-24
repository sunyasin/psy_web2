import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { isValidUuid } from "@/lib/subscription";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientUuid = body?.client_uuid;
    const subscriptionTierId = body?.subscriptionTierId || body?.subscription_tier_id;

    if (!isValidUuid(clientUuid) || !isValidUuid(subscriptionTierId)) {
      return NextResponse.json(
        { error: "Valid client_uuid and subscriptionTierId are required" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("client_uuid, telegram_user_id")
      .eq("client_uuid", clientUuid)
      .maybeSingle();

    if (clientError || !client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    if (!client.telegram_user_id) {
      return NextResponse.json({ error: "Telegram account is not linked" }, { status: 409 });
    }

    const { data: tier, error: tierError } = await supabase
      .from("subscription_tiers")
      .select("id, name, price, currency, payment_url")
      .eq("id", subscriptionTierId)
      .eq("is_active", true)
      .maybeSingle();

    if (tierError || !tier) {
      return NextResponse.json({ error: "Subscription tier not found or not active" }, { status: 404 });
    }

    if (!tier.payment_url) {
      return NextResponse.json({ error: "Payment URL is not configured for this tier" }, { status: 409 });
    }

    const idempotencyKey = `tribute:${clientUuid}:${subscriptionTierId}`;
    const { data: existing, error: existingError } = await supabase
      .from("transactions")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .eq("status", "pending")
      .maybeSingle();

    if (existingError && existingError.code !== "PGRST116") {
      throw existingError;
    }

    const transactionId = existing?.id || crypto.randomUUID();
    if (!existing) {
      const { error: insertError } = await supabase.from("transactions").insert({
        id: transactionId,
        client_uuid: clientUuid,
        subscription_tier_id: subscriptionTierId,
        amount: tier.price,
        currency: tier.currency || "RUB",
        status: "pending",
        provider: "tribute",
        idempotency_key: idempotencyKey,
        description: `Подписка: ${tier.name}`,
        metadata: { tier_name: tier.name, tier_price: tier.price },
        telegram_user_id: client.telegram_user_id,
        updated_at: new Date().toISOString(),
      });

      if (insertError) throw insertError;
    }

    return NextResponse.json({
      confirmationUrl: tier.payment_url,
      transactionId,
      paymentId: transactionId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create payment" },
      { status: 500 }
    );
  }
}
