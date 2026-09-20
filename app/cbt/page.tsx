"use client";

import { useState, useEffect } from "react";

export default function CbtPage() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ role: "agent" | "user"; text: string }[]>([]);
  const [crisisDetected, setCrisisDetected] = useState(false);
  const [answer, setAnswer] = useState("");
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) {
      window.location.href = "/";
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/cbt/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_uuid: clientUuid }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Не удалось запустить КПТ-сессию");
        }

        const data = await res.json();
        setSessionId(data.sessionId);
        setMessages(data.messages || []);
        setCrisisDetected(data.crisisDetected || false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка запуска КПТ-сессии");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId || sending || !answer.trim()) return;

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    setSending(true);
    const userAnswer = answer.trim();
    setAnswer("");

    try {
      const res = await fetch("/api/cbt/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_uuid: clientUuid,
          session_id: sessionId,
          message: userAnswer,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка отправки сообщения");
      }

      const data = await res.json();
      setMessages(data.messages || []);
      setCrisisDetected(data.crisisDetected || false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка соединения");
      setAnswer(userAnswer);
    } finally {
      setSending(false);
    }
  }

  function handleEndSession(outcome: "resolved" | "needs_followup" | "escalated") {
    setCompleted(true);
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Загружаю КПТ-сессию...</p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={() => (window.location.href = "/")} className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
            На главную
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col items-center py-16 px-6 bg-white dark:bg-black">
        <div className="w-full space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
              КПТ-сессия
            </h1>
            {!completed && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                Это не психотерапия. При остром кризисе — ищи профессиональную помощь.
              </span>
            )}
          </div>

          {crisisDetected && !completed && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-center text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
              <div className="font-semibold mb-1">Важно: кризисный ресурс</div>
              {messages[messages.length - 1]?.text}
            </div>
          )}

          <div className="space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "agent"
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                    : "bg-black text-white dark:bg-white dark:text-black"
                }`}
              >
                {msg.text}
              </div>
            ))}
          </div>

          {!completed && !crisisDetected && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={3}
                className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white"
                placeholder="Твой ответ..."
                disabled={sending}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={sending || !answer.trim()}
                  className="flex-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  {sending ? "Отправляю..." : "Отправить"}
                </button>
                <button
                  type="button"
                  onClick={() => handleEndSession("resolved")}
                  disabled={sending}
                  className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                >
                  Завершить
                </button>
              </div>
            </form>
          )}

          {completed && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              Сессия завершена. Итог:{" "}
              {crisisDetected ? "эскалация на специалиста" : "тема проработана"}
              .
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
