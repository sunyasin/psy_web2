"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SubscriptionTiersList } from "@/components/SubscriptionTiersList";
import { TelegramLinkDialog } from "@/components/TelegramLinkDialog";
import { subscriptionsApi, SubscriptionSession } from "@/lib/subscriptionsApi";

interface ClientProfile {
  display_name: string;
  email: string;
}

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

  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [credentialsSaved, setCredentialsSaved] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);

  const loadSession = async (uuid: string) => {
    const result = await subscriptionsApi.getSession(uuid);
    if (!result || "error" in result) return;
    setSession(result);
  };

  const loadProfile = async (uuid: string) => {
    try {
      const res = await fetch(`/api/client/profile?client_uuid=${encodeURIComponent(uuid)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCredentialsError(data.error || "Не удалось загрузить данные для входа");
        return;
      }
      const data = await res.json();
      setProfile({ display_name: data.display_name ?? "", email: data.email ?? "" });
      setLogin(data.email ?? "");
    } catch {
      setCredentialsError("Не удалось загрузить данные для входа");
    }
  };

  useEffect(() => {
    const uuid = getClientUuid();
    if (!uuid) {
      router.push("/");
      return;
    }

    window.setTimeout(() => {
      setClientUuid(uuid);
      loadSession(uuid);
      loadProfile(uuid).finally(() => setLoading(false));
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

  const saveCredentials = async () => {
    if (!clientUuid || !login.trim() || !password) return;

    setCredentialsError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/client/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_uuid: clientUuid, login: login.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCredentialsError(data.error || "Не удалось сохранить данные для входа");
        return;
      }
      setCredentialsSaved(true);
      setLogin(data.email ?? login.trim());
    } catch {
      setCredentialsError("Не удалось сохранить данные для входа");
    } finally {
      setSaving(false);
    }
  };

  const telegramLinked = Boolean(session?.telegramLinked);

  const canPurchase = credentialsSaved;
  const allFieldsFilled = Boolean(login.trim()) && Boolean(password);

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

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#18181b" }}>Данные для входа:</div>
            {profile ? (
              <div style={{ fontSize: "14px", color: "#18181b" }}>
                Ранее введённое имя: <span style={{ fontWeight: 600 }}>{profile.display_name || "(не задано)"}</span>
              </div>
            ) : (
              <div style={{ fontSize: "14px", color: "#71717a" }}>Ранее введённое имя: ...</div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#3f3f46" }>Логин</label>
              <input
                type="email"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="email@example.com"
                required
                style={{
                  width: "100%",
                  borderRadius: "6px",
                  border: "1px solid #d4d4d7",
                  backgroundColor: "#fff",
                  padding: "8px 12px",
                  fontSize: "14px",
                  color: "#18181b",
                  outline: "none",
                }}
                disabled={saving || credentialsSaved}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: "#3f3f46" }}>Пароль</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Не менее 6 символов"
                required
                minLength={6}
                style={{
                  width: "100%",
                  borderRadius: "6px",
                  border: "1px solid #d4d4d7",
                  backgroundColor: "#fff",
                  padding: "8px 12px",
                  fontSize: "14px",
                  color: "#18181b",
                  outline: "none",
                }}
                disabled={saving}
              />
            </div>

            {credentialsError && <p style={{ fontSize: "13px", color: "#ef4444" }}>{credentialsError}</p>}
            {credentialsSaved && <p style={{ fontSize: "13px", color: "#16a34a" }}>Сохранено в БД</p>}

            <button
              onClick={saveCredentials}
              disabled={saving || !allFieldsFilled}
              style={{
                marginTop: "8px",
                borderRadius: "6px",
                backgroundColor: "#000",
                padding: "10px 24px",
                fontSize: "14px",
                fontWeight: 500,
                color: "#fff",
                border: "none",
                cursor: saving || !allFieldsFilled ? "not-allowed" : "pointer",
                opacity: saving || !allFieldsFilled ? 0.5 : 1,
              }}
            >
              {saving ? "Сохраняю..." : "Ok"}
            </button>
          </div>

          {telegramLinked ? (
            <SubscriptionTiersList
              clientUuid={clientUuid}
              canPurchase={canPurchase}
              purchaseDisabledReason={canPurchase ? undefined : "Сохраните данные для входа, чтобы оформить подписку"}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "32px 0" }}>
              <p style={{ fontSize: "14px", color: "#71717a", textAlign: "center", maxWidth: "512px" }}>
                Для оформления подписки необходимо привязать Telegram аккаунт.
              </p>
              {bindingError && <p style={{ fontSize: "13px", color: "#ef4444" }}>{bindingError}</p>}
              <button
                onClick={openBindingDialog}
                disabled={!canPurchase}
                style={{
                  borderRadius: "6px",
                  backgroundColor: "#000",
                  padding: "10px 24px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#fff",
                  border: "none",
                  cursor: !canPurchase ? "not-allowed" : "pointer",
                  opacity: !canPurchase ? 0.5 : 1,
                }}
              >
                Привязать Telegram
              </button>
              {!canPurchase && (
                <p style={{ fontSize: "12px", color: "#71717a", textAlign: "center" }}>
                  Сначала сохраните данные для входа
                </p>
              )}
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
