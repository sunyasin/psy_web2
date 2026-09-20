"use client";

import { useState, useEffect } from "react";
import { loadLastSessionSummary, submitLastSessionMessage, type LastSessionMessage, type LastSessionSummary } from "./actions";

export default function LastSessionPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<LastSessionSummary | null>(null);
  const [messages, setMessages] = useState<LastSessionMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) {
      window.location.href = "/";
      return;
    }

    (async () => {
      try {
        const data = await loadLastSessionSummary(clientUuid);
        if (!data) {
          setError("Сессий не найдено. Пройди интервью, чтобы появился контекст.");
          setLoading(false);
          return;
        }
        setSummary(data);
        setMessages([
          {
            role: "assistant",
            text: `Привет! Я помню твою последнюю сессию интервью. Ты ответил на ${data.answerCount} вопросов и reached блок ${data.currentBlock}. ${data.completed ? "Интервью завершено." : "Сессия ещё не завершена."} О чём хочешь поговорить?`,
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки сессии");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    const userMessage = input.trim();
    setInput("");
    setSending(true);

    const userMsg: LastSessionMessage = { role: "user", text: userMessage };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);

    try {
      const response = await submitLastSessionMessage(clientUuid, userMessage, updatedHistory);
      setMessages((prev) => [...prev, response]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка отправки");
      setMessages((prev) => [...prev, { role: "assistant", text: "Произошла ошибка. Попробуй ещё раз." }]);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Загружаю последнюю сессию...</p>
        </main>
      </div>
    );
  }

  if (error && !summary) {
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
      <main className="flex flex-1 w-full max-w-2xl flex-col items-center py-16 px-6 bg-white dark:bg-black">
        <div className="w-full space-y-6">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Моя последняя сессия</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {summary
                ? `Ответов: ${summary.answerCount} · Статус: ${summary.completed ? "Завершена" : "В процессе"}`
                : "Загрузка..."}
            </p>
          </div>

          {summary && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50 mb-3">Краткое резюме</h2>
              {summary.keyThemes.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {summary.keyThemes.map((theme) => (
                    <span
                      key={theme}
                      className="rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                    >
                      {theme}
                    </span>
                  ))}
                </div>
              )}
              {summary.profileSnapshot && (
                <div className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">
                  <div className="font-medium mb-1">Профиль:</div>
                  <div className="whitespace-pre-wrap">
                    {JSON.stringify(summary.profileSnapshot, null, 2)}
                  </div>
                </div>
              )}
              {summary.ideas && summary.ideas.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-black dark:text-zinc-50 mb-2">Идеи из интервью:</div>
                  <div className="space-y-2">
                    {summary.ideas.map((idea, idx) => (
                      <div key={idx} className="text-sm text-zinc-700 dark:text-zinc-300">
                        <span className="font-medium">{idx + 1}. {idea.title}</span>
                        {idea.description && <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{idea.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "assistant"
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                      : "bg-black text-white dark:bg-white dark:text-black"
                  }`}
                >
                  {msg.text}
                </div>
              ))}
              {sending && (
                <div className="rounded-xl px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                  Печатаю...
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Напиши сообщение..."
                disabled={sending}
                className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Отправить
              </button>
            </form>

            <div className="flex justify-center">
              <button
                onClick={() => (window.location.href = "/goals")}
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
              >
                Перейти к целям
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
