"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { subscriptionsApi } from "@/lib/subscriptionsApi";

interface SubscriptionPurchaseButtonProps {
  subscriptionTierId: string;
  tierName: string;
  price: number;
  clientUuid: string;
  telegramLinked: boolean;
  telegramBotUrl?: string;
  onSuccess?: () => void;
}

export function SubscriptionPurchaseButton({
  subscriptionTierId,
  tierName,
  price,
  clientUuid,
  telegramLinked,
  telegramBotUrl,
  onSuccess,
}: SubscriptionPurchaseButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleSubscribe = async () => {
    if (!telegramLinked && telegramBotUrl) {
      window.open(telegramBotUrl, "_blank", "noopener,noreferrer");
      return;
    }

    try {
      setIsLoading(true);

      const result = await subscriptionsApi.createSubscription({
        client_uuid: clientUuid,
        subscriptionTierId,
      });

      if ("error" in result) {
        console.error("Subscription error:", result.error);
        return;
      }

      try {
        localStorage.setItem("subscription_tier", "paid");
      } catch { /* ignore */ }

      if (onSuccess) {
        onSuccess();
      } else {
        router.push("/results");
      }
    } catch (error) {
      console.error("Error creating subscription:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
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
      {isLoading ? "Обработка..." : `Оплатить ${price} ₽`}
    </button>
  );
}
