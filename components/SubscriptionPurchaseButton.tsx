"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { subscriptionsApi } from "@/lib/subscriptionsApi";

interface SubscriptionPurchaseButtonProps {
  subscriptionTierId: string;
  price: number;
  currency: string;
  clientUuid: string;
  paymentUrl: string | null;
}

export function SubscriptionPurchaseButton({
  subscriptionTierId,
  price,
  currency,
  clientUuid,
  paymentUrl,
}: SubscriptionPurchaseButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);

  const handleSubscribe = async () => {
    setError(null);
    setIsLoading(true);

    // Open popup immediately to avoid browser popup blocker
    if (paymentUrl) {
      popupRef.current = window.open(paymentUrl, "_blank", "noopener,noreferrer");
    }

    try {
      const result = await subscriptionsApi.createSubscription({
        client_uuid: clientUuid,
        subscriptionTierId,
      });

      if ("error" in result) {
        setError(result.error);
        // Close popup if there was an error
        if (popupRef.current && !popupRef.current.closed) {
          popupRef.current.close();
        }
        return;
      }

      // If the popup was opened and the API returned a confirmation URL,
      // update the popup location (in case it's different from paymentUrl)
      if (popupRef.current && !popupRef.current.closed && result.confirmationUrl) {
        popupRef.current.location.href = result.confirmationUrl;
      }

      router.push(`/payment-callback?transactionId=${encodeURIComponent(result.transactionId)}`);
    } catch {
      setError("Не удалось создать платёж");
      // Close popup on error
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
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
