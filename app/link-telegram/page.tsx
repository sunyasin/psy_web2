"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TelegramLinkDialog } from "@/components/TelegramLinkDialog";
import { subscriptionsApi, SubscriptionSession } from "@/lib/subscriptionsApi";

function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

export default function LinkTelegramPage() {
  const router = useRouter();
  const [clientUuid, setClientUuid] = useState<string | null>(null);
  const [session, setSession] = useState<SubscriptionSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [binding, setBinding] = useState<{ botUrl: string | null; loginWidgetAuthUrl: string | null; expiresAt: string } | null>(null);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    const uuid = readStorage("client_uuid");
    if (!uuid) {
      router.push("/");
      return;
    }
    setClientUuid(uuid);
    (async () => {
      try {
        const result = await subscriptionsApi.getSession(uuid);
        if (result && "error" in result) {
          setSession(null);
        } else {
          setSession(result);
          if (result?.telegramLinked) setLinked(true);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  useEffect(() => {
    if (!dialogOpen || !clientUuid || linked) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await subscriptionsApi.getSession(clientUuid);
        if (result && "error" in result) return;
        setSession(result);
        if (result?.telegramLinked) {
          setLinked(true);
          window.clearInterval(timer);
        }
      } catch { }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [dialogOpen, clientUuid, linked]);

  useEffect(() => {
    if (linked) {
      const t = window.setTimeout(() => router.push("/"), 1500);
      return () => window.clearTimeout(t);
    }
  }, [linked, router]);

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

  if (loading || !clientUuid || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-md flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Загружаю...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-md flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
        <div className="w-full space-y-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Подтвердите свой Telegram
          </h1>
          <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            подтвердите свой Telegram чтобы получать и сохранять результаты работы.
          </p>

          {linked ? (
            <p className="text-sm text-green-600 dark:text-green-400">
              Telegram успешно привязан. Перенаправляю на главную...
            </p>
          ) : (
            <>
              {bindingError && (
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  {bindingError}
                </p>
              )}
              <button
                type="button"
                onClick={openBindingDialog}
                className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Привязать Telegram
              </button>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
              >
                Пропустить
              </button>
            </>
          )}
        </div>
      </main>

      <TelegramLinkDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        botUrl={binding?.botUrl ?? null}
        loginWidgetAuthUrl={binding?.loginWidgetAuthUrl ?? null}
        expiresAt={binding?.expiresAt ?? null}
      />
    </div>
  );
}