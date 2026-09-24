"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SubscriptionTiersList } from "@/components/SubscriptionTiersList";
import { TelegramLinkDialog } from "@/components/TelegramLinkDialog";
import { subscriptionsApi, SubscriptionSession } from "@/lib/subscriptionsApi";

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
  const [session, setSession] = useState<SubscriptionSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [binding, setBinding] = useState<{ botUrl: string | null; loginWidgetAuthUrl: string | null; expiresAt: string } | null>(null);
  const [bindingError, setBindingError] = useState<string | null>(null);

  const loadSession = async (uuid: string) => {
    const result = await subscriptionsApi.getSession(uuid);
    if (!result || "error" in result) return;
    setSession(result);
  };

  useEffect(() => {
    const uuid = getClientUuid();
    if (!uuid) {
      router.push("/");
      return;
    }

    window.setTimeout(() => {
      setClientUuid(uuid);
      loadSession(uuid).finally(() => setLoading(false));
    }, 0);
  }, [router]);

  useEffect(() => {
    if (!dialogOpen || !clientUuid || session?.telegramLinked) return;

    const timer = window.setInterval(() => {
      loadSession(clientUuid);
    }, 2500);

    return () => window.clearInterval(timer);
  }, [dialogOpen, clientUuid, session?.telegramLinked]);

  const openBindingDialog = async () => {
    if (!clientUuid) return;

    setBindingError(null);
    const result = await subscriptionsApi.createBinding(clientUuid);
    if (!result || "error" in result) {
      setBindingError(result?.error || "Не удалось создать ссылку для привязки");
      return;
    }

    setBinding(result);
    setDialogOpen(true);
    if (result.botUrl) window.open(result.botUrl, "_blank", "noopener,noreferrer");
  };

  const telegramLinked = Boolean(session?.telegramLinked);

  if (loading || !clientUuid || !session) {
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
            <h1 style={{ fontSize: "24px", fontWeight: 600, color: "#000" }}>Выберите тариф</h1>
            <p style={{ marginTop: "8px", fontSize: "14px", color: "#71717a" }}>Подписка открывает все функции приложения</p>
          </div>

          {telegramLinked ? (
            <SubscriptionTiersList clientUuid={clientUuid} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "32px 0" }}>
              <p style={{ fontSize: "14px", color: "#71717a", textAlign: "center", maxWidth: "512px" }}>
                Для оформления подписки необходимо привязать Telegram аккаунт.
              </p>
              {bindingError && <p style={{ fontSize: "13px", color: "#ef4444" }}>{bindingError}</p>}
              <button
                onClick={openBindingDialog}
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
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        botUrl={binding?.botUrl || null}
        loginWidgetAuthUrl={binding?.loginWidgetAuthUrl || null}
        expiresAt={binding?.expiresAt || null}
      />
    </div>
  );
}
