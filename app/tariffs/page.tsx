"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SubscriptionTiersList } from "@/components/SubscriptionTiersList";
import { TelegramLinkDialog } from "@/components/TelegramLinkDialog";

function getClientUuid(): string | null {
  try {
    return localStorage.getItem("client_uuid");
  } catch {
    return null;
  }
}

function LoadingSpinner() {
  return (
    <div style={{ width: "32px", height: "32px", border: "3px solid #e5e7eb", borderTopColor: "#000", borderRadius: "50%", margin: "0 auto", animation: "spin 1s linear infinite" }} />
  );
}

export default function TariffsPage() {
  const router = useRouter();
  const [clientUuid, setClientUuid] = useState<string | null>(null);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showTelegramDialog, setShowTelegramDialog] = useState(false);

  const telegramBotUrl =
    typeof window !== "undefined"
      ? (localStorage.getItem("telegram_bot_url") || process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL || "https://t.me/psy_goal_bot")
      : "";

  useEffect(() => {
    const uuid = getClientUuid();
    if (!uuid) {
      router.push("/");
      return;
    }

    setClientUuid(uuid);

    const checkTelegram = async () => {
      try {
        const response = await fetch(`/api/subscriptions/memberships?client_uuid=${uuid}`);
        if (response.ok) {
          const data = await response.json();
          const hasActive = (data.memberships || []).some((m: any) => m.status === "active");
          setTelegramLinked(hasActive);
        }
      } catch {
        // Ignore
      } finally {
        setLoading(false);
      }
    };

    checkTelegram();
  }, [router]);

  if (loading || !clientUuid) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fafafa" }}>
        <main style={{ width: "100%", maxWidth: "896px", display: "flex", flexDirection: "column", alignItems: "center", padding: "64px 24px", backgroundColor: "#fff" }}>
          <LoadingSpinner />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fafafa" }}>
      <main style={{ width: "100%", maxWidth: "896px", display: "flex", flexDirection: "column", alignItems: "center", padding: "64px 24px", backgroundColor: "#fff" }}>
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "32px" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "24px", fontWeight: 600, color: "#000" }}>
              Выберите тариф
            </h1>
            <p style={{ marginTop: "8px", fontSize: "14px", color: "#71717a" }}>
              Подписка открывает все функции приложения
            </p>
          </div>

          {telegramLinked ? (
            <SubscriptionTiersList
              clientUuid={clientUuid}
              telegramLinked={telegramLinked}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "32px 0" }}>
              <p style={{ fontSize: "14px", color: "#71717a", textAlign: "center", maxWidth: "512px" }}>
                Для оформления подписки необходимо привязать Telegram аккаунт.
                Нажмите кнопку ниже для перехода в бота.
              </p>
              <button
                onClick={() => setShowTelegramDialog(true)}
                style={{
                  borderRadius: "6px",
                  backgroundColor: "#000",
                  padding: "10px 24px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Привязать Telegram
              </button>
            </div>
          )}
        </div>
      </main>

      <TelegramLinkDialog
        open={showTelegramDialog}
        onOpenChange={setShowTelegramDialog}
        clientUuid={clientUuid}
        telegramBotUrl={telegramBotUrl || "https://t.me/"}
      />
    </div>
  );
}
