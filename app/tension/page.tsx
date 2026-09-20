"use client";

import { useState, useEffect } from "react";

export default function TensionPage() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tensions, setTensions] = useState<{ id: string; description: string; evidence?: any }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) {
      window.location.href = "/";
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/tension/list?client_uuid=${clientUuid}`);
        if (!res.ok) {
          throw new Error("Не удалось загрузить противоречия");
        }
        const data = await res.json();
        setTensions(data.tensions || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки противоречий");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleConfirm(confirmed: boolean) {
    if (!tensions[currentIndex]) return;

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/tension/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_uuid: clientUuid,
          tension_id: tensions[currentIndex].id,
          confirmed,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Не удалось сохранить выбор");
      }

      if (currentIndex + 1 >= tensions.length) {
        setFinished(true);
        setTimeout(() => {
          window.location.href = "/intent";
        }, 1500);
      } else {
        setCurrentIndex((i) => i + 1);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка соединения");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Загружаю противоречия...</p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => (window.location.href = "/")}
            className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            На главную
          </button>
        </main>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <div className="w-full space-y-4 text-center">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">Готово</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Я записал твои ответы. Теперь перейдём к следующему шагу.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const current = tensions[currentIndex];

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col items-center py-16 px-6 bg-white dark:bg-black">
        <div className="w-full space-y-6">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
              Проверка противоречий
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Я заметил возможный конфликт в твоих ответах. Покажу его и спрошу: это действительно противоречие, или я не так понял?
            </p>
          </div>

          {current && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-sm font-semibold text-black dark:text-zinc-50 mb-2">
                Противоречие {currentIndex + 1} из {tensions.length}
              </div>
              <p className="text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap">
                {current.description}
              </p>
              {current.evidence && (
                <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {JSON.stringify(current.evidence, null, 2)}
                </pre>
              )}
            </div>
          )}

          <div className="grid gap-3">
            <button
              onClick={() => handleConfirm(true)}
              disabled={sending}
              className="w-full rounded-xl border border-zinc-200 bg-white px-5 py-4 text-left transition-colors hover:border-black hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-white"
            >
              <div className="text-sm font-semibold text-black dark:text-zinc-50">
                Да, это конфликт — я это чувствую
              </div>
            </button>
            <button
              onClick={() => handleConfirm(false)}
              disabled={sending}
              className="w-full rounded-xl border border-zinc-200 bg-white px-5 py-4 text-left transition-colors hover:border-black hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-white"
            >
              <div className="text-sm font-semibold text-black dark:text-zinc-50">
                Нет, это одно и то же — я просто выразился нечётко
              </div>
            </button>
          </div>

          {sending && (
            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">Сохраняю...</p>
          )}
        </div>
      </main>
    </div>
  );
}
