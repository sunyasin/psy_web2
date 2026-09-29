"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SubscriptionTiersList } from "@/components/SubscriptionTiersList";
import { TelegramLinkDialog } from "@/components/TelegramLinkDialog";
import { subscriptionsApi, SubscriptionSession } from "@/lib/subscriptionsApi";
import {
  enterWithCredentials,
  getAccessToken,
  getRefreshToken,
  restoreSession,
  saveSession,
} from "@/lib/authSession";
import type { ClientRow } from "@/lib/types";

function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function getClientUuid(): string | null {
  return readStorage("client_uuid") || null;
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
  const [profile, setProfile] = useState<ClientRow | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [binding, setBinding] = useState<{ botUrl: string | null; loginWidgetAuthUrl: string | null; expiresAt: string } | null>(null);
  const [bindingError, setBindingError] = useState<string | null>(null);

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [credentialsError, setCredentialsError] = useState<string | null>(null);

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
      setLogin(readStorage("login"));
      loadSession(uuid);

      restoreSession()
        .then((client) => {
          if (!client) return;

          if (client.client_uuid !== uuid) {
            saveSession({
              client_uuid: client.client_uuid,
              display_name: client.display_name ?? "",
              login: client.login ?? "",
              access_token: getAccessToken(),
              refresh_token: getRefreshToken(),
            });
            window.location.reload();
            return;
          }

          setProfile(client);
          setAuthorized(true);
        })
        .finally(() => setLoading(false));
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

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientUuid || !login.trim() || !password) return;

    setCredentialsError(null);
    setSubmitting(true);
    try {
      const result = await enterWithCredentials({
        client_uuid: clientUuid,
        login: login.trim(),
        password,
      });

      saveSession(result);
      window.location.reload();
    } catch (err) {
      setCredentialsError(err instanceof Error ? err.message : "Не удалось войти");
      setSubmitting(false);
    }
  };

  const telegramLinked = Boolean(session?.telegramLinked);
  const canPurchase = authorized;
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

          {!authorized ? (
            <form onSubmit={submitCredentials} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#18181b" }}>Войдите или зарегистрируйтесь:</div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#3f3f46" }}>Логин</label>
                <input
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="Любая строка"
                  autoComplete="username"
                  minLength={3}
                  maxLength={64}
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
                  disabled={submitting}
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
                  disabled={submitting}
                />
              </div>

              {credentialsError && <p style={{ fontSize: "13px", color: "#ef4444" }}>{credentialsError}</p>}

              <button
                type="submit"
                disabled={submitting || !allFieldsFilled}
                style={{
                  marginTop: "8px",
                  borderRadius: "6px",
                  backgroundColor: "#000",
                  padding: "10px 24px",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#fff",
                  border: "none",
                  cursor: submitting || !allFieldsFilled ? "not-allowed" : "pointer",
                  opacity: submitting || !allFieldsFilled ? 0.5 : 1,
                }}
              >
                {submitting ? "Проверяю..." : "Ok"}
              </button>
            </form>
          ) : (
            <div style={{ fontSize: "14px", color: "#18181b" }}>
              Вы вошли как <span style={{ fontWeight: 600 }}>{profile?.login || login}</span>
            </div>
          )}

          {telegramLinked ? (
            <SubscriptionTiersList
              clientUuid={clientUuid}
              canPurchase={canPurchase}
              purchaseDisabledReason={canPurchase ? undefined : "Войдите или зарегистрируйтесь, чтобы оформить подписку"}
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
                  Сначала войдите или зарегистрируйтесь
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
