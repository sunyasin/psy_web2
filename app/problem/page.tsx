"use client";

import { useState, useEffect } from "react";
import { startProblemDiagnosis, submitProblemMessage } from "./actions";
import type { ProblemPhase } from "@/lib/types";

type PhaseTitle = Record<ProblemPhase, string>;

const PHASE_TITLES: PhaseTitle = {
  point_a: "Точка А — что происходит сейчас",
  point_b: "Точка Б — идеальный результат",
  clarify: "Проверяю, правильно ли понял",
  choice: "Что дальше?",
};

const ROUTED_LABELS: Record<string, string> = {
  free_diagnosis: "🏠 Бесплатная диагностика в чате",
  paid_booking: "📅 Записаться на консультацию",
  dismiss: "⬇️ Не сейчас",
};

export default function ProblemPage() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<{
    sessionId: string;
    phase: ProblemPhase;
    prompt: string;
    choices?: { value: string; label: string }[];
    completed: boolean;
    routedTo?: string;
  } | null>(null);
  const [messages, setMessages] = useState<{ role: "agent" | "user"; text: string }[]>([]);
  const [answer, setAnswer] = useState("");

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) {
      window.location.href = "/";
      return;
    }

    const goalId = new URLSearchParams(window.location.search).get("goal_id") || undefined;

    (async () => {
      try {
        const s = await startProblemDiagnosis(clientUuid, goalId);
        setState(s);
        setMessages((m) => [...m, { role: "agent", text: s.prompt }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка запуска диагностики");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!state || sending) return;

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid || !answer.trim()) return;

    setSending(true);
    const userAnswer = answer.trim();
    setAnswer("");

    try {
      const next = await submitProblemMessage(clientUuid, userAnswer);
      setState(next);
      setMessages((m) => [...m, { role: "user", text: userAnswer }]);

      if (next.completed) {
        setMessages((m) => [...m, { role: "agent", text: `Выбор сохранён: ${ROUTED_LABELS[next.routedTo || 'free_diagnosis']}` }]);
        if (next.routedTo === "free_diagnosis") {
          setTimeout(() => {
            window.location.href = "/cbt";
          }, 1500);
        }
      } else {
        setMessages((m) => [...m, { role: "agent", text: next.prompt }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка соединения");
      setAnswer(userAnswer);
    } finally {
      setSending(false);
    }
  }

  async function handleChoice(value: string) {
    if (!state || sending) return;

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    const label = ROUTED_LABELS[value] || value;

    setSending(true);
    try {
      const next = await submitProblemMessage(clientUuid, value);
      setState(next);
      setMessages((m) => [...m, { role: "user", text: label }]);

      if (next.completed) {
        setMessages((m) => [...m, { role: "agent", text: `Выбор сохранён: ${ROUTED_LABELS[next.routedTo || 'free_diagnosis']}` }]);
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
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Загружаю диагностику...</p>
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

  const isChoicePhase = state?.phase === "choice";
  const isCompleted = state?.completed;

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col items-center py-16 px-6 bg-white dark:bg-black">
        <div className="w-full space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
              Диагностика проблемы
            </h1>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {state && !isCompleted ? PHASE_TITLES[state.phase] : "Завершено"}
            </span>
          </div>

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

          {isChoicePhase && !isCompleted && state?.choices && (
            <div className="grid gap-3">
              {state.choices.map((c) => (
                <button
                  key={c.value}
                  onClick={() => handleChoice(c.value)}
                  disabled={sending}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-5 py-4 text-left transition-colors hover:border-black hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-white"
                >
                  <div className="text-sm font-semibold text-black dark:text-zinc-50">{c.label}</div>
                </button>
              ))}
            </div>
          )}

          {!isChoicePhase && !isCompleted && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={3}
                className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white"
                placeholder="Твой ответ..."
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !answer.trim()}
                className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {sending ? "Отправляю..." : "Отправить"}
              </button>
            </form>
          )}

          {isCompleted && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              Результат диагностики сохранён. Далее —{" "}
              {state?.routedTo === "goal_agent"
                ? "переход к целеполаганию"
                : state?.routedTo === "paid_booking"
                  ? "запись на консультацию"
                  : "следующий шаг по выбранному варианту"}
              .
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
