"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { subscriptionsApi, SubscriptionStatus } from "@/lib/subscriptionsApi";

function getClientUuid(): string | null {
  try {
    return localStorage.getItem("client_uuid");
  } catch {
    return null;
  }
}

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const transactionId = searchParams.get("transactionId");
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [state, setState] = useState<"loading" | "success" | "failed">(transactionId ? "loading" : "failed");

  useEffect(() => {
    const clientUuid = getClientUuid();
    if (!clientUuid) {
      window.setTimeout(() => setState("failed"), 0);
      return;
    }

    let active = true;
    const checkStatus = async () => {
      try {
        const result = await subscriptionsApi.getStatus(clientUuid);
        if (!active) return;
        if (!result || "error" in result) {
          setState("failed");
          return;
        }

        setStatus(result);
        setState(result.isPaid ? "success" : "loading");
      } catch {
        if (active) setState("failed");
      }
    };

    checkStatus();
    const timer = window.setInterval(checkStatus, 3000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [transactionId]);

  const handleGoBack = () => {
    router.push(status?.isPaid ? "/results" : "/tariffs");
  };

  const membership = status?.membership;
  const tierName = membership?.tier?.name || "Подписка";
  const period = membership?.renewalPeriod || membership?.period || "";

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fafafa", padding: "16px" }}>
      <div style={{ width: "100%", maxWidth: "448px", backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e4e4e7", padding: "24px" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ marginBottom: "16px" }}>
            {state === "loading" && (
              <div style={{ width: "64px", height: "64px", border: "3px solid #e5e7eb", borderTopColor: "#000", borderRadius: "50%", margin: "0 auto", animation: "spin 1s linear infinite" }} />
            )}
            {state === "success" && (
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto" }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            )}
            {state === "failed" && (
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto" }}>
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
          <h1 style={{ fontSize: "18px", fontWeight: 600, color: "#18181b", marginBottom: "4px" }}>
            {state === "loading" && "Обработка платежа..."}
            {state === "success" && "Оплата прошла успешно!"}
            {state === "failed" && "Ошибка оплаты"}
          </h1>
          <p style={{ fontSize: "14px", color: "#71717a" }}>
            {state === "loading" && "Подождите, подтверждаем ваш платёж"}
            {state === "success" && `Ваша подписка активирована${period ? `: ${period}` : ""}`}
            {state === "failed" && "Не удалось подтвердить платёж"}
          </p>
        </div>

        {membership && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: "14px", borderBottom: "1px solid #f4f4f5" }}>
              <span style={{ color: "#71717a" }}>Тариф:</span>
              <span style={{ fontWeight: 500, color: "#18181b" }}>{tierName}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: "14px" }}>
              <span style={{ color: "#71717a" }}>Статус:</span>
              <span style={{ fontWeight: 500, color: "#18181b", textTransform: "capitalize" }}>{membership.status}</span>
            </div>
          </div>
        )}

        <button
          onClick={handleGoBack}
          style={{
            width: "100%",
            borderRadius: "6px",
            backgroundColor: "#000",
            color: "#fff",
            padding: "10px 16px",
            fontSize: "14px",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
          }}
        >
          {state === "success" ? "Перейти к результатам" : "Вернуться"}
        </button>
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fafafa" }}>Loading...</div>}>
      <PaymentCallbackContent />
    </Suspense>
  );
}
