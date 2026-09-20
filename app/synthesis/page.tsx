"use client";

import { useState, useEffect } from "react";

export default function SynthesisPage() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [result, setResult] = useState<{ profileId?: string; tensionsDetected: boolean; tensionCount: number } | null>(null);

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) {
      window.location.href = "/";
      return;
    }

    (async () => {
      try {
        await runSynthesis(clientUuid);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка синтеза профиля");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function runSynthesis(clientUuid: string) {
    setRunning(true);
    setError(null);

    const res = await fetch("/api/synthesis/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_uuid: clientUuid }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Не удалось создать профиль");
    }

    const data = await res.json();
    setResult(data);
    setCompleted(true);
    setRunning(false);

    setTimeout(() => {
      if (data.tensionsDetected) {
        window.location.href = "/tension";
      } else {
        window.location.href = "/intent";
      }
    }, 2000);
  }

  if (loading || running) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <div className="w-full space-y-4 text-center">
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Синтезирую твой профиль...</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Анализирую ответы интервью, вычленяю ценности, ограничения и возможные противоречия.
            </p>
            <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-black dark:bg-white" />
            </div>
          </div>
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

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
        <div className="w-full space-y-4 text-center">
          <h2 className="text-xl font-semibold text-black dark:text-zinc-50">Профиль готов</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Я собрал твой Икигай-профиль на основе ответов.
            {result?.tensionsDetected
              ? ` Найдено противоречий: ${result.tensionCount}. Сначала проверим их.`
              : " Противоречий не найдено."}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Сейчас перенаправляю на следующий шаг...
          </p>
        </div>
      </main>
    </div>
  );
}
