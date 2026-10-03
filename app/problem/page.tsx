"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { startProblemDiagnosis, submitProblemMessage, loadProblemHistory } from "./actions";
import type { ProblemPhase, TranscriptTurn } from "@/lib/types";

const ROUTED_LABELS: Record<string, string> = {
  free_diagnosis: "🏠 Бесплатная диагностика в чате",
  paid_booking: "📅 Записаться на консультацию",
  dismiss: "⬇️ Не сейчас",
};

function ProblemPageContent() {
  const searchParams = useSearchParams();
  const goalId = searchParams.get("goal_id");

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
  const [history, setHistory] = useState<TranscriptTurn[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) {
      window.location.href = "/";
      return;
    }

    (async () => {
      try {
        const s = await startProblemDiagnosis(clientUuid, goalId || undefined);
        setState(s);
        // Историю не подгружаем: она лежит в БД, а чат показывает текущий диалог.
        // Полная расшифровка — по кнопке «История», см. handleToggleHistory.
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка запуска диагностики");
      } finally {
        setLoading(false);
      }
    })();
    // goal_id стабилен на всё время жизни страницы.
  }, [goalId]);

  /** Расшифровка из БД грузится только по клику и кешируется до следующей перезагрузки страницы. */
  async function handleToggleHistory() {
    if (history) {
      setHistory(null);
      return;
    }
    if (historyLoading) return;

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await loadProblemHistory(clientUuid, goalId || undefined));
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : "Не удалось загрузить историю");
    } finally {
      setHistoryLoading(false);
    }
  }

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
  const isCbtGate = state?.phase === "cbt_gate";
  const isCompleted = state?.completed;
  const showChoices = (isChoicePhase || isCbtGate) && !isCompleted;

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col items-center py-16 px-6 bg-white dark:bg-black">
        <div className="w-full space-y-4">
          {goalId && (
            <a
              href={`/results/idea?goal_id=${encodeURIComponent(goalId)}`}
              className="inline-block text-xs text-zinc-500 underline dark:text-zinc-400"
            >
              На страницу цели
            </a>
          )}
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
              Хочешь обсудить саботаж или другой вопрос?
            </h1>
          </div>

          <div>
            <button
              type="button"
              onClick={handleToggleHistory}
              disabled={historyLoading}
              className="flex items-center gap-1.5 text-xs text-zinc-500 underline disabled:opacity-50 dark:text-zinc-400"
            >
              {historyLoading ? "Загружаю историю..." : history ? "Скрыть историю" : "История"}
            </button>

            {historyError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{historyError}</p>
            )}

            {history && history.length === 0 && (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Предыдущих бесед по этой цели пока нет.
              </p>
            )}

            {history && history.length > 0 && (
              <div className="mt-2 max-h-80 space-y-2 overflow-y-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                {history.map((turn, idx) => (
                  <div key={idx} className="text-xs leading-relaxed">
                    <div className="text-zinc-400 dark:text-zinc-500">{turn.at}</div>
                    <div className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                      <span className="font-semibold">Q:</span> {turn.question}
                    </div>
                    <div className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                      <span className="font-semibold">A:</span> {turn.answer}
                    </div>
                  </div>
                ))}
              </div>
            )}
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

          {showChoices && state?.choices && (
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

          {!showChoices && !isCompleted && (
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
              {goalId && (
                <a
                  href={`/results/idea?goal_id=${encodeURIComponent(goalId)}`}
                  className="block text-center text-xs text-zinc-500 underline dark:text-zinc-400"
                >
                  На страницу цели
                </a>
              )}
            </form>
          )}

          {isCompleted && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              {isCbtGate ? (
                <>Запускаю бесплатную КПТ-сессию...</>
              ) : (
                <>
                  Результат диагностики сохранён. Далее —{" "}
                  {state?.routedTo === "goal_agent"
                    ? "переход к целеполаганию"
                    : state?.routedTo === "paid_booking"
                      ? "запись на консультацию"
                      : "следующий шаг по выбранному варианту"}
                  .
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ProblemPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
          <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Загружаю диагностику...</p>
          </main>
        </div>
      }
    >
      <ProblemPageContent />
    </Suspense>
  );
}
