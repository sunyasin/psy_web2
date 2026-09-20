"use client";

import { useState } from "react";

interface TelegramLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientUuid: string;
  telegramBotUrl: string;
}

export function TelegramLinkDialog({
  open,
  onOpenChange,
  clientUuid,
  telegramBotUrl,
}: TelegramLinkDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(clientUuid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.5)",
        padding: "16px",
      }}
      onClick={() => onOpenChange(false)}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "448px",
          borderRadius: "12px",
          border: "1px solid #e4e4e7",
          backgroundColor: "#fff",
          padding: "24px",
          boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px", color: "#18181b" }}>
          Привязка Telegram
        </h2>
        <p style={{ fontSize: "14px", color: "#71717a", marginBottom: "16px" }}>
          Для оплаты необходимо привязать Telegram аккаунт. Откройте бот, отправьте{" "}
          <code style={{ background: "#f4f4f5", padding: "2px 4px", borderRadius: "4px", fontSize: "12px" }}>/start</code>{" "}
          и следуйте инструкциям.
        </p>

        <div style={{ padding: "16px 0" }}>
          <p style={{ fontSize: "14px", color: "#71717a", marginBottom: "8px" }}>
            Ваш client_uuid для привязки:
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <code
              style={{
                flex: 1,
                borderRadius: "6px",
                backgroundColor: "#f4f4f5",
                padding: "8px 12px",
                fontSize: "13px",
                fontFamily: "monospace",
                wordBreak: "break-all",
                overflow: "hidden",
              }}
            >
              {clientUuid}
            </code>
            <button
              onClick={handleCopy}
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                border: "1px solid #e4e4e7",
                background: "#fff",
                fontSize: "13px",
                cursor: "pointer",
              }}
            >
              {copied ? "Скопировано" : "Копировать"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "16px", justifyContent: "flex-end" }}>
          <button
            onClick={() => onOpenChange(false)}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid #e4e4e7",
              background: "#fff",
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Отмена
          </button>
          <button
            onClick={() => window.open(telegramBotUrl, "_blank", "noopener,noreferrer")}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              background: "#000",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 2L2 12.5l4 1.5L7 22l5.5-3 3 5.5L21 2z" />
            </svg>
            Перейти в бот
          </button>
        </div>
      </div>
    </div>
  );
}
