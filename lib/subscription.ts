import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

export interface MembershipResponse {
  id: string;
  clientUuid: string;
  subscriptionTierId: string | null;
  status: string;
  period: string | null;
  startedAt: string;
  expiresAt: string | null;
  renewalPeriod: string | null;
  externalSubscriptionId: string | null;
  isPaid: boolean;
  tier: Row | null;
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function dateValue(value: unknown): string | null {
  const text = stringValue(value);
  return text && Number.isFinite(Date.parse(text)) ? text : null;
}

export function isPaidMembership(membership: Row | null): boolean {
  if (!membership || stringValue(membership.status) !== "active") return false;
  const expiresAt = dateValue(membership.expires_at);
  return !expiresAt || Date.parse(expiresAt) > Date.now();
}

function toMembershipResponse(row: Row | null): MembershipResponse | null {
  if (!row) return null;

  const expiresAt = dateValue(row.expires_at);
  const renewalPeriod = stringValue(row.renewal_period);
  const status = stringValue(row.status) || "";
  const subscriptionPeriod = stringValue(row.subscription_period);

  return {
    id: stringValue(row.id) || "",
    clientUuid: stringValue(row.client_uuid) || "",
    subscriptionTierId: stringValue(row.subscription_tier_id),
    status,
    period: renewalPeriod || subscriptionPeriod,
    startedAt: stringValue(row.started_at) || "",
    expiresAt,
    renewalPeriod,
    externalSubscriptionId: stringValue(row.external_subscription_id),
    isPaid: isPaidMembership({ ...row, expires_at: expiresAt, status }),
    tier: (row.subscription_tier as Row | undefined) || null,
  };
}

export function isTableMissing(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === "PGRST205" || code === "42P01";
}

export async function getSubscriptionSession(clientUuid: string) {
  if (!isValidUuid(clientUuid)) return null;

  const supabase = getSupabaseServerClient();
  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("client_uuid, telegram_user_id, telegram_username, telegram_first_name")
    .eq("client_uuid", clientUuid)
    .maybeSingle();

  if (clientError || !client) return null;

  let membership: Row | null = null;
  try {
    const { data, error: membershipError } = await supabase
      .from("memberships")
      .select("*, subscription_tier:subscription_tiers(id, name, description, price, currency)")
      .eq("client_uuid", clientUuid)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (membershipError && !isTableMissing(membershipError)) {
      throw membershipError;
    }
    membership = data;
  } catch {
    // memberships table may not exist yet; continue without it
  }

  return {
    clientUuid: client.client_uuid,
    telegramUserId: client.telegram_user_id ?? null,
    telegramLinked: Boolean(client.telegram_user_id),
    telegramUsername: client.telegram_username ?? null,
    telegramFirstName: client.telegram_first_name ?? null,
    membership: toMembershipResponse(membership),
  };
}

export async function getSubscriptionStatus(clientUuid: string) {
  const session = await getSubscriptionSession(clientUuid);
  if (!session) return null;

  return {
    clientUuid: session.clientUuid,
    telegramLinked: session.telegramLinked,
    membership: session.membership,
    isPaid: Boolean(session.membership?.isPaid),
  };
}

export function verifyTributeSignature(rawBody: string, signatureHeader: string | null, apiKey: string): boolean {
  if (!signatureHeader || !apiKey) return false;

  const supplied = signatureHeader.replace(/^sha256=/i, "").trim();
  const expected = createHmac("sha256", apiKey).update(rawBody).digest("hex");
  const suppliedBuffer = Buffer.from(supplied, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export function getTributePeriod(period: unknown): { renewalPeriod: string; days?: number } {
  switch (String(period || "").toLowerCase()) {
    case "weekly":
      return { renewalPeriod: "еженедельно", days: 7 };
    case "monthly":
      return { renewalPeriod: "ежемесячно", days: 30 };
    case "3months":
    case "quarter":
    case "quarterly":
      return { renewalPeriod: "раз в 3 месяца", days: 90 };
    case "6month":
    case "semiannual":
      return { renewalPeriod: "раз в 6 месяцев", days: 180 };
    case "yearly":
    case "annual":
      return { renewalPeriod: "ежегодно", days: 365 };
    case "once":
    case "onetime":
    case "one_time":
      return { renewalPeriod: "единоразово" };
    default:
      return { renewalPeriod: "ежемесячно", days: 30 };
  }
}

export function getTributeExpiry(payload: Row, paidAt: Date): string | null {
  const payloadExpiresAt = dateValue(payload.expires_at);
  if (payloadExpiresAt) return payloadExpiresAt;

  const period = getTributePeriod(payload.period);
  if (!period.days) return null;
  return new Date(paidAt.getTime() + period.days * 24 * 60 * 60 * 1000).toISOString();
}

export async function findActiveTierByTributePayload(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  payload: Row
) {
  const { data: tiers, error } = await supabase
    .from("subscription_tiers")
    .select("id, name, tribute_subscription_id, tribute_tier_id")
    .eq("is_active", true);

  if (error) throw error;

  const subscriptionId = Number(payload.subscription_id);
  const exact = (tiers || []).find((tier: Row) => Number(tier.tribute_subscription_id) === subscriptionId);
  if (exact) return exact;

  const subscriptionName = stringValue(payload.subscription_name) || "";
  const legacyId = Number(subscriptionName.split("_")[0]);
  if (!Number.isFinite(legacyId)) return null;
  return (tiers || []).find((tier: Row) => Number(tier.tribute_tier_id) === legacyId) || null;
}

export async function upsertPaidMembership(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  input: {
    clientUuid: string;
    tierId: string;
    startedAt: string;
    expiresAt: string | null;
    renewalPeriod: string;
    externalSubscriptionId: string;
  }
) {
  const { data: existing, error: existingError } = await supabase
    .from("memberships")
    .select("id")
    .eq("client_uuid", input.clientUuid)
    .eq("status", "active")
    .maybeSingle();

  if (existingError) throw existingError;

  const row = {
    client_uuid: input.clientUuid,
    subscription_tier_id: input.tierId,
    status: "active",
    started_at: input.startedAt,
    expires_at: input.expiresAt,
    renewal_period: input.renewalPeriod,
    external_subscription_id: input.externalSubscriptionId,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase
      .from("memberships")
      .update(row)
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase
    .from("memberships")
    .insert({ ...row, id: crypto.randomUUID() })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}
