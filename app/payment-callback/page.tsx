"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const transactionId = searchParams.get("transactionId");

  const [status, setStatus] = useState<"loading" | "success" | "failed">("loading");
  const [transaction, setTransaction]: any = useState(null);

  useEffect(() => {
    if (!transactionId) {
      setStatus("failed");
      return;
    }

    const checkStatus = async () => {
      try {
        const { data, error } = await supabase
          .from("transactions")
          .select("*, subscription_tier:subscription_tiers(name)")
          .eq("id", transactionId)
          .single();

        if (error) throw error;

        setTransaction(data);

        if (data.status === "paid") {
          setStatus("success");
        } else if (data.status === "failed" || data.status === "canceled") {
          setStatus("failed");
        }
      } catch (err) {
        console.error("Error checking transaction:", err);
        setStatus("failed");
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, [transactionId]);

  const handleGoBack = () => {
    router.push("/results");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#fafafa", padding: "16px" }}>
      <div style={{ width: "100%", maxWidth: "448px", backgroundColor: "#fff", borderRadius: "12px", border: "1px solid #e4e4e7", padding: "24px" }}>
        <div style={{ textAlign: "center", marginBottom: "24px" }}>
          <div style={{ marginBottom: "16px" }}>
            {status === "loading" && (
              <div style={{ width: "64px", height: "64px", border: "3px solid #e5e7eb", borderTopColor: "#000", borderRadius: "50%", margin: "0 auto", animation: "spin 1s linear infinite" }} />
            )}
            {status === "success" && (
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto" }}>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            )}
            {status === "failed" && (
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto" }}>
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            )}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
          <h1 style={{ fontSize: "18px", fontWeight: 600, color: "#18181b", marginBottom: "4px" }}>
            {status === "loading" && "Обработка платежа..."}
            {status === "success" && "Оплата прошла успешно!"}
            {status === "failed" && "Ошибка оплаты"}
          </h1>
          <p style={{ fontSize: "14px", color: "#71717a" }}>
            {status === "loading" && "Подождите, подтверждаем ваш платёж"}
            {status === "success" && "Ваша подписка активирована"}
            {status === "failed" && "Что-то пошло не так"}
          </p>
        </div>

        {transaction && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: "14px", borderBottom: "1px solid #f4f4f5" }}>
              <span style={{ color: "#71717a" }}>Тариф:</span>
              <span style={{ fontWeight: 500, color: "#18181b" }}>{transaction.subscription_tier?.name}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: "14px", borderBottom: "1px solid #f4f4f5" }}>
              <span style={{ color: "#71717a" }}>Сумма:</span>
              <span style={{ fontWeight: 500, color: "#18181b" }}>{transaction.amount} {transaction.currency}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: "14px" }}>
              <span style={{ color: "#71717a" }}>Статус:</span>
              <span style={{ fontWeight: 500, color: "#18181b", textTransform: "capitalize" }}>{transaction.status}</span>
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
          {status === "success" ? "Перейти к результатам" : "Вернуться"}
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
