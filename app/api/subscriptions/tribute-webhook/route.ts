import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  findActiveTierByTributePayload,
  getTributeExpiry,
  getTributePeriod,
  upsertPaidMembership,
  verifyTributeSignature,
} from "@/lib/subscription";

interface TributePayload {
  telegram_user_id?: unknown;
  amount?: unknown;
  price?: unknown;
  currency?: unknown;
  subscription_id?: unknown;
  subscription_name?: unknown;
  payment_id?: unknown;
  created_at?: unknown;
  sent_at?: unknown;
  period?: unknown;
  expires_at?: unknown;
  [key: string]: unknown;
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("trbt-signature");
  const apiKey = process.env.TRIBUTE_API_KEY;

  if (!verifyTributeSignature(rawBody, signature, apiKey || "")) {
    return NextResponse.json({ error: "Invalid Tribute signature" }, { status: 401 });
  }

  let body: { name?: unknown; payload?: TributePayload };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (body?.name !== "new_subscription" || !body.payload) {
    return NextResponse.json({ error: "Unsupported Tribute event" }, { status: 400 });
  }

  const payload = body.payload;
  const telegramUserId = asNumber(payload.telegram_user_id);
  const amount = asNumber(payload.amount ?? payload.price);
  const currency = typeof payload.currency === "string" ? payload.currency : null;
  const subscriptionId = asNumber(payload.subscription_id);

  if (
    telegramUserId === null ||
    amount === null ||
    !currency ||
    (!subscriptionId && !payload.subscription_name)
  ) {
    return NextResponse.json({ error: "Invalid Tribute payload" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("client_uuid, telegram_user_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (clientError || !client) {
    return NextResponse.json({ error: "Telegram account is not linked" }, { status: 404 });
  }

  let tier: { id: string; name: string } | null = null;
  try {
    tier = await findActiveTierByTributePayload(supabase, payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to resolve subscription tier" },
      { status: 500 }
    );
  }

  if (!tier) {
    return NextResponse.json({ error: "Subscription tier not found" }, { status: 404 });
  }

  const providerEventId = `new_subscription:${payload.subscription_id ?? ""}:${payload.period_id ?? ""}`;
  const providerPaymentId = String(payload.payment_id ?? payload.subscription_id ?? providerEventId);
  const paidAt = asDate(payload.created_at ?? payload.sent_at) || new Date();
  const expiresAt = getTributeExpiry(payload, paidAt);
  const period = getTributePeriod(payload.period);

  const existingByEvent = await supabase
    .from("transactions")
    .select("id, status")
    .eq("provider_event_id", providerEventId)
    .maybeSingle();

  if (existingByEvent.error && existingByEvent.error.code !== "PGRST116") {
    return NextResponse.json({ error: "Failed to verify transaction" }, { status: 500 });
  }

  const existingByPayment = existingByEvent.data
    ? null
    : await supabase
        .from("transactions")
        .select("id, status")
        .eq("provider_payment_id", providerPaymentId)
        .maybeSingle();

  if (existingByPayment?.error && existingByPayment.error.code !== "PGRST116") {
    return NextResponse.json({ error: "Failed to verify transaction" }, { status: 500 });
  }

  const existing = existingByEvent.data || existingByPayment?.data || null;
  if (existing?.status === "paid") {
    return NextResponse.json({ success: true, duplicate: true });
  }

  const transactionId = existing?.id || crypto.randomUUID();
  const transaction = {
    id: transactionId,
    client_uuid: client.client_uuid,
    subscription_tier_id: tier.id,
    amount,
    currency,
    status: "paid",
    provider: "tribute",
    provider_payment_id: providerPaymentId,
    idempotency_key: providerEventId,
    description: `Подписка: ${tier.name}`,
    metadata: payload,
    telegram_user_id: telegramUserId,
    subscription_period: String(payload.period || period.renewalPeriod),
    paid_amount: amount,
    paid_currency: currency,
    paid_at: paidAt.toISOString(),
    expires_at: expiresAt,
    provider_event_id: providerEventId,
    updated_at: new Date().toISOString(),
  };

  let transactionError: { code?: string; message?: string } | null = null;
  if (existing) {
    const result = await supabase
      .from("transactions")
      .update(transaction)
      .eq("id", transactionId);
    transactionError = result.error;
  } else {
    const result = await supabase.from("transactions").insert(transaction);
    transactionError = result.error;
  }

  if (transactionError) {
    if (transactionError.code === "23505") {
      return NextResponse.json({ success: true, duplicate: true });
    }
    return NextResponse.json({ error: "Failed to save transaction", details: transactionError.message }, { status: 500 });
  }

  try {
    await upsertPaidMembership(supabase, {
      clientUuid: client.client_uuid,
      tierId: tier.id,
      startedAt: paidAt.toISOString(),
      expiresAt,
      renewalPeriod: period.renewalPeriod,
      externalSubscriptionId: providerPaymentId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to activate membership" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}