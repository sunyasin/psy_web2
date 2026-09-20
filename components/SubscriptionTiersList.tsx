"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { subscriptionsApi, SubscriptionTierRow } from "@/lib/subscriptionsApi";
import { SubscriptionPurchaseButton } from "./SubscriptionPurchaseButton";

interface SubscriptionTiersListProps {
  clientUuid: string;
  telegramLinked: boolean;
  telegramBotUrl?: string;
}

export function SubscriptionTiersList({
  clientUuid,
  telegramLinked,
  telegramBotUrl,
}: SubscriptionTiersListProps) {
  const router = useRouter();
  const [tiers, setTiers] = useState<SubscriptionTierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTiers = async () => {
      try {
        const response = await fetch("/api/subscriptions/tiers");
        if (response.ok) {
          const result = await response.json();
          setTiers(result.tiers || []);
        }
      } catch (err) {
        console.error("Error loading tiers:", err);
        setError("Не удалось загрузить тарифы");
      } finally {
        setLoading(false);
      }
    };

    loadTiers();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "48px 0" }}>
        <div style={{ width: "32px", height: "32px", border: "3px solid #e5e7eb", borderTopColor: "#000", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return <div style={{ textAlign: "center", padding: "32px 0", color: "#ef4444" }}>{error}</div>;
  }

  if (tiers.length === 0) {
    return <div style={{ textAlign: "center", padding: "48px 0", color: "#71717a" }}>Тарифы пока недоступны</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "24px" }}>
      {tiers.map((tier) => (
        <div
          key={tier.id}
          style={{
            borderRadius: "12px",
            border: "1px solid #e4e4e7",
            backgroundColor: "#fff",
            padding: "24px",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#71717a" }}>
            {tier.name}
          </div>
          <div style={{ marginTop: "8px", fontSize: "30px", fontWeight: "bold", color: "#000" }}>
            {tier.price} {tier.currency}
          </div>
          {tier.description && (
            <p style={{ marginTop: "8px", fontSize: "14px", color: "#71717a" }}>{tier.description}</p>
          )}
          <div style={{ marginTop: "24px" }}>
            <SubscriptionPurchaseButton
              subscriptionTierId={tier.id}
              tierName={tier.name}
              price={tier.price}
              clientUuid={clientUuid}
              telegramLinked={telegramLinked}
              telegramBotUrl={telegramBotUrl}
              onSuccess={() => router.push("/results")}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
