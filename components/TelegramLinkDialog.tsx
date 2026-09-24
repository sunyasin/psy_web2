"use client";

interface TelegramLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  botUrl: string | null;
  loginWidgetAuthUrl: string | null;
  expiresAt: string | null;
}

export function TelegramLinkDialog({
  open,
  onOpenChange,
  botUrl,
  loginWidgetAuthUrl,
  expiresAt,
}: TelegramLinkDialogProps) {
  if (!open) return null;

  const expiryText = expiresAt ? `Ссылка действительна до ${new Date(expiresAt).toLocaleTimeString()}` : "";

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
        onClick={(event) => event.stopPropagation()}
      >
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px", color: "#18181b" }}>
          Привязка Telegram
        </h2>
        <p style={{ fontSize: "14px", color: "#71717a", marginBottom: "16px" }}>
          сейчас откроется окно Telegram-бота. нажмите в окне Start
        </p>
        {expiryText && <p style={{ fontSize: "12px", color: "#71717a", marginBottom: "16px" }}>{expiryText}</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px" }}>
          {botUrl && (
            <a
              href={botUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                padding: "10px 14px",
                borderRadius: "6px",
                border: "none",
                background: "#000",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Открыть Telegram-бота
            </a>
          )}
          {loginWidgetAuthUrl && (
            <a
              href={loginWidgetAuthUrl}
              style={{
                padding: "10px 14px",
                borderRadius: "6px",
                border: "1px solid #e4e4e7",
                background: "#fff",
                color: "#18181b",
                fontSize: "14px",
                cursor: "pointer",
                textAlign: "center",
                textDecoration: "none",
              }}
            >
              Привязать через Telegram
            </a>
          )}
          {!botUrl && !loginWidgetAuthUrl && (
            <p style={{ fontSize: "13px", color: "#ef4444" }}>Ссылка для привязки не настроена.</p>
          )}
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
        </div>
      </div>
    </div>
  );
}
