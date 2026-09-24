export interface CreateSubscriptionRequest {
  client_uuid: string;
  subscriptionTierId: string;
}

export interface CreateSubscriptionResponse {
  confirmationUrl: string;
  transactionId: string;
  paymentId?: string;
}

export interface SubscriptionTierRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  paymentUrl: string | null;
  tributeSubscriptionId: number | null;
  tributeTierId: number | null;
}

export interface MembershipRow {
  id: string;
  client_uuid: string;
  subscription_tier_id: string | null;
  status: string;
  started_at: string;
  expires_at: string | null;
  renewal_period: string | null;
  external_subscription_id: string | null;
  subscription_tier?: SubscriptionTierRow | null;
  tier?: SubscriptionTierRow | null;
  period?: string | null;
  renewalPeriod?: string | null;
  is_paid?: boolean;
  isPaid?: boolean;
}

export interface SubscriptionSession {
  clientUuid: string;
  telegramUserId: number | null;
  telegramLinked: boolean;
  membership: MembershipRow | null;
}

export interface SubscriptionStatus {
  clientUuid: string;
  telegramLinked: boolean;
  membership: MembershipRow | null;
  isPaid: boolean;
}

export interface TelegramBindingResponse {
  token: string;
  botUrl: string | null;
  loginWidgetAuthUrl: string | null;
  expiresAt: string;
}

export interface SubscriptionApiError {
  error: string;
}

async function readError(response: Response): Promise<SubscriptionApiError> {
  try {
    return (await response.json()) as SubscriptionApiError;
  } catch {
    return { error: "Request failed" };
  }
}

export const subscriptionsApi = {
  async createSubscription(
    data: CreateSubscriptionRequest
  ): Promise<CreateSubscriptionResponse | SubscriptionApiError> {
    const response = await fetch("/api/subscriptions/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) return readError(response);
    return response.json();
  },

  async getTiers(): Promise<SubscriptionTierRow[] | SubscriptionApiError> {
    const response = await fetch("/api/subscriptions/tiers");
    if (!response.ok) return readError(response);
    const data = await response.json();
    return data.tiers || [];
  },

  async getSession(clientUuid: string): Promise<SubscriptionSession | SubscriptionApiError> {
    const response = await fetch(`/api/subscriptions/session?client_uuid=${encodeURIComponent(clientUuid)}`);
    if (!response.ok) return readError(response);
    return response.json();
  },

  async getStatus(clientUuid: string): Promise<SubscriptionStatus | SubscriptionApiError> {
    const response = await fetch(`/api/subscriptions/status?client_uuid=${encodeURIComponent(clientUuid)}`);
    if (!response.ok) return readError(response);
    return response.json();
  },

  async createBinding(clientUuid: string): Promise<TelegramBindingResponse | SubscriptionApiError> {
    const response = await fetch("/api/telegram/bindings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_uuid: clientUuid }),
    });

    if (!response.ok) return readError(response);
    return response.json();
  },

  async getMemberships(clientUuid: string): Promise<MembershipRow[] | SubscriptionApiError> {
    const response = await fetch(`/api/subscriptions/memberships?client_uuid=${encodeURIComponent(clientUuid)}`);
    if (!response.ok) return readError(response);
    const data = await response.json();
    return data.memberships || [];
  },
};
