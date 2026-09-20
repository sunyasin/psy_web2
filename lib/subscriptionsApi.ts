import { supabase } from "@/lib/supabase";

export interface CreateSubscriptionRequest {
  client_uuid: string;
  subscriptionTierId: string;
}

export interface CreateSubscriptionResponse {
  confirmationUrl: string;
  transactionId: string;
  paymentId?: string;
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
}

export interface SubscriptionTierRow {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionApiError {
  error: string;
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

    if (!response.ok) {
      const error = await response.json();
      return error as SubscriptionApiError;
    }

    return response.json();
  },

  async getMemberships(client_uuid: string): Promise<MembershipRow[] | SubscriptionApiError> {
    const response = await fetch(`/api/subscriptions/memberships?client_uuid=${client_uuid}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const error = await response.json();
      return error as SubscriptionApiError;
    }

    const data = await response.json();
    return data.memberships || [];
  },

  async getActiveTier(client_uuid: string): Promise<SubscriptionTierRow | null> {
    const result = await this.getMemberships(client_uuid);
    if (!result || "error" in result) return null;

    const active = result.find((m: MembershipRow) => m.status === "active");
    return active?.subscription_tier || null;
  },
};
