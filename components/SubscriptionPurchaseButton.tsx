"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { subscriptionsApi } from "@/lib/subscriptionsApi";

interface SubscriptionPurchaseButtonProps {
  subscriptionTierId: string;
  price: number;
  currency: string;
  clientUuid: string;
}

export function SubscriptionPurchaseButton({
  subscriptionTierId,
  price,
  currency,
  clientUuid,
}: SubscriptionPurchaseButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const result = await subscriptionsApi.createSubscription({
        client_uuid: clientUuid,
        subscriptionTierId,
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }

      window.open(result.confirmationUrl, "_blank", "noopener,noreferrer");
      router.push(`/payment-callback?transactionId=${encodeURIComponent(result.transactionId)}`);
    } catch {
      setError("Не удалось создать платёж");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleSubscribe}
        disabled={isLoading}
        style={{
          width: "100%",
          borderRadius: "6px",
          backgroundColor: "#000",
          color: "#fff",
          padding: "10px 16px",
          fontSize: "14px",
          fontWeight: 500,
          cursor: isLoading ? "not-allowed" : "pointer",
          opacity: isLoading ? 0.5 : 1,
          border: "none",
        }}
      >
        {isLoading ? "Создаю платёж..." : `Оплатить ${price} ${currency}`}
      </button>
      {error && <p style={{ marginTop: "8px", fontSize: "12px", color: "#ef4444" }}>{error}</p>}
    </div>
  );
}
