"use client";

import { useState, useEffect } from "react";
import { getScreeningQuestions, submitScreeningAnswers } from "./actions";
import type { DomainKey } from "@/lib/types";

const DOMAINS: { key: DomainKey; label: string; emoji: string }[] = [
  { key: "relationships", label: "Отношения", emoji: "💬" },
  { key: "money", label: "Деньги", emoji: "💰" },
  { key: "health", label: "Здоровье", emoji: "🏃" },
  { key: "purpose", label: "Призвание", emoji: "🎯" },
  { key: "safety", label: "Безопасность", emoji: "🛡️" },
  { key: "belonging", label: "Принадлежность", emoji: "🤝" },
];

export default function DomainScreeningPage() {
  const [questions, setQuestions] = useState<{ id: string; domain: DomainKey; question: string; order: number }[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"questions" | "selection" | "result">("questions");
  const [flaggedDomains, setFlaggedDomains] = useState<DomainKey[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<DomainKey[]>([]);

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) {
      window.location.href = "/";
      return;
    }

    (async () => {
      try {
        const q = await getScreeningQuestions();
        setQuestions(q);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки скрининга");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggleDomain(domain: DomainKey) {
    setSelectedDomains((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  }

  async function handleSubmitQuestions(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) {
      setError("Нет client_uuid");
      setSending(false);
      return;
    }

    try {
      const formatted = questions.map((q) => ({
        questionId: q.id,
        answer: answers[q.id] || "нет",
        domain: q.domain,
      }));

      const result = await submitScreeningAnswers(clientUuid, formatted);
      setFlaggedDomains(result.flagged);
      setStep("selection");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения скрининга");
    } finally {
      setSending(false);
    }
  }

  async function handleContinueToQuestionnaire() {
    if (selectedDomains.length === 0) {
      setError("Выбери хотя бы одну область");
      return;
    }
    const domainsParam = selectedDomains.join(",");
    window.location.href = `/domain?domains=${domainsParam}`;
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Загружаю скрининг...</p>
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

  if (step === "questions") {
    const grouped = questions.reduce<Record<string, { domain: DomainKey; question: string; order: number; id: string }[]>>((acc, q) => {
      if (!acc[q.domain]) acc[q.domain] = [];
      acc[q.domain].push(q);
      return acc;
    }, {});

    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center py-16 px-6 bg-white dark:bg-black">
          <div className="w-full space-y-6">
            <div className="text-center">
              <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Короткий скрининг по 6 областям жизни</h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Ответь «да», если похоже на твою ситуацию. Это не диагноз, только направление для разговора.</p>
            </div>

            <form onSubmit={handleSubmitQuestions} className="space-y-6">
              {DOMAINS.map((domain) => (
                <div key={domain.key} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <h2 className="text-sm font-semibold text-black dark:text-zinc-50 mb-3">
                    {domain.emoji} {domain.label}
                  </h2>
                  <div className="space-y-3">
                    {(grouped[domain.key] || []).map((q) => (
                      <div key={q.id} className="flex items-start gap-3">
                        <span className="mt-1 text-xs text-zinc-500 w-5 text-right">{q.order}.</span>
                        <label className="flex flex-1 items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                          <input
                            type="radio"
                            name={q.id}
                            value="да"
                            checked={answers[q.id] === "да"}
                            onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                            className="h-4 w-4 rounded border-zinc-300 text-black focus:ring-black dark:border-zinc-700"
                          />
                          Да
                          <input
                            type="radio"
                            name={q.id}
                            value="нет"
                            checked={answers[q.id] === "нет"}
                            onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                            className="h-4 w-4 rounded border-zinc-300 text-black focus:ring-black dark:border-zinc-700"
                          />
                          Нет
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {error && <p className="text-center text-sm text-red-600 dark:text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={sending}
                className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {sending ? "Обрабатываю..." : "Продолжить"}
              </button>
            </form>
          </div>
        </main>
      </div>
    );
  }

  if (step === "selection") {
    const flagged = DOMAINS.filter((d) => flaggedDomains.includes(d.key));
    const clean = DOMAINS.filter((d) => !flaggedDomains.includes(d.key));

    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center py-16 px-6 bg-white dark:bg-black">
          <div className="w-full space-y-6">
            <div className="text-center">
              <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Выбери, с какими областями поработать</h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Похоже, есть над чем поработать в отмеченных областях. Ты можешь выбрать любые домены, не только подсвеченные.</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="col-span-full text-xs font-semibold uppercase tracking-wider text-zinc-500">Похоже на проблему</div>
              {flagged.map((d) => (
                <button
                  key={d.key}
                  onClick={() => toggleDomain(d.key)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    selectedDomains.includes(d.key)
                      ? "border-black dark:border-white"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <div className="text-sm font-semibold text-black dark:text-zinc-50">
                    {d.emoji} {d.label}
                  </div>
                  {selectedDomains.includes(d.key) && (
                    <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Выбрано</div>
                  )}
                </button>
              ))}

              <div className="col-span-full mt-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">Другие области</div>
              {clean.map((d) => (
                <button
                  key={d.key}
                  onClick={() => toggleDomain(d.key)}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    selectedDomains.includes(d.key)
                      ? "border-black dark:border-white"
                      : "border-zinc-200 dark:border-zinc-800"
                  }`}
                >
                  <div className="text-sm font-semibold text-black dark:text-zinc-50">
                    {d.emoji} {d.label}
                  </div>
                  {selectedDomains.includes(d.key) && (
                    <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">Выбрано</div>
                  )}
                </button>
              ))}
            </div>

            <button
              onClick={handleContinueToQuestionnaire}
              disabled={selectedDomains.length === 0}
              className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Продолжить ({selectedDomains.length})
            </button>
          </div>
        </main>
      </div>
    );
  }

  return null;
}
