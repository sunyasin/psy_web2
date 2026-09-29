"use client";

import { useEffect, useState } from "react";

function CompletedCheck() {
  return (
    <span
      aria-label="пройдено"
      title="Пройдено"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
}

function formatAnalysisDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function InterviewSelectPage() {
  const [clientUuid] = useState<string | null>(() => typeof window === "undefined" ? null : localStorage.getItem("client_uuid"));
  const [displayName] = useState<string | null>(() => typeof window === "undefined" ? null : localStorage.getItem("display_name"));
  const [loading, setLoading] = useState(true);
  const [shortCompleted, setShortCompleted] = useState(false);
  const [shortInProgress, setShortInProgress] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState("Собираем ваши ответы");
  const [hasAnalysis, setHasAnalysis] = useState(false);
  const [analysisCreatedAt, setAnalysisCreatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!analyzing) return;
    const timers = [
      window.setTimeout(() => setAnalysisStage("Анализируем ответы и строим стратегии"), 2500),
      window.setTimeout(() => setAnalysisStage("Готовим результат"), 6000),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [analyzing]);

  useEffect(() => {
    if (!clientUuid) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    Promise.all([
      fetch(`/api/interview/has-completed?client_uuid=${clientUuid}&interview_code=short`).then((response) => response.json()),
      fetch(`/api/analysis/exists?client_uuid=${clientUuid}`).then((response) => response.json()),
    ]).then(([shortData, analysisData]) => {
      setShortCompleted(Boolean(shortData.completed));
      setShortInProgress(Boolean(shortData.in_progress));
      setHasAnalysis(Boolean(analysisData.has_analysis));
      setAnalysisCreatedAt(analysisData.created_at ?? null);
    }).catch((err) => setError(err instanceof Error ? err.message : "Не удалось загрузить статус интервью"))
      .finally(() => setLoading(false));
  }, [clientUuid]);

  function startInterview(code: "short") {
    if (!clientUuid) {
      setError("Сессия не найдена. Вернитесь на главную.");
      return;
    }
    localStorage.setItem("selected_interview_code", code);
    localStorage.removeItem("selected_interview_id");
    window.location.href = "/interview";
  }

  function openAnalysisResults() {
    if (!clientUuid) return;
    window.location.href = `/short-analysis?client_uuid=${encodeURIComponent(clientUuid)}`;
  }

  async function analyze() {
    if (!clientUuid || analyzing) return;
    setError(null);
    setAnalyzing(true);
    setAnalysisStage("Собираем ваши ответы");
    const startedAt = Date.now();

    const waitFor = async (targetMs: number) => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < targetMs) {
        await new Promise((resolve) => window.setTimeout(resolve, targetMs - elapsed));
      }
    };

    try {
      if (shortCompleted) {
        const response = await fetch(`/api/analysis/short?client_uuid=${encodeURIComponent(clientUuid)}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Ошибка анализа");
        setAnalysisStage("Готовим результат");
        await waitFor(1500);
        window.location.href = `/short-analysis?client_uuid=${encodeURIComponent(clientUuid)}`;
        return;
      }
      setAnalysisStage("Готовим результат");
      await waitFor(600);
      window.location.href = `/results?client_uuid=${encodeURIComponent(clientUuid)}`;
    } catch (err) {
      setAnalyzing(false);
      setError(err instanceof Error ? err.message : "Ошибка анализа");
    }
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600 dark:bg-black dark:text-zinc-400">Загружаю...</main>;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <main className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">{displayName ? `${displayName}. ` : ""}Выбери формат интервью</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">Короткое интервью исследует одну цель или идею и строит стратегию её достижения.</p>
        </div>
        {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</p>}
        <div className="space-y-3">
          <button type="button" onClick={() => startInterview("short")} className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white">
            <span className="flex items-center gap-2">
              {shortCompleted && <CompletedCheck />}
              <span className="text-base font-semibold">Сокращённое интервью (4 вопроса)</span>
            </span>
            <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">Точка Б, текущее положение, ресурсы, ограничения {shortCompleted ? "· пройдено" : shortInProgress ? "· в процессе" : ""}</span>
          </button>
          <button
            type="button"
            onClick={hasAnalysis ? openAnalysisResults : analyze}
             disabled={analyzing || (!hasAnalysis && !shortCompleted)}
            className="w-full rounded-md bg-black px-4 py-4 text-left text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            <span className="block text-base font-semibold">
              {hasAnalysis ? "Результаты интервью" : "Анализировать результаты интервью"}
            </span>
            <span className="mt-1 block text-xs text-zinc-300 dark:text-zinc-500">
              {hasAnalysis
                ? `Стратегии и шаги по твоим ответам${analysisCreatedAt ? ` от ${formatAnalysisDate(analysisCreatedAt)}` : ""}`
                : "Получить стратегии и шаги"}
            </span>
          </button>
        </div>
        <button type="button" onClick={() => (window.location.href = "/")} disabled={analyzing} className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50">На главную</button>
      </main>
      {analyzing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-zinc-200 border-t-black dark:border-zinc-700 dark:border-t-white" />
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">Идёт анализ</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Это может занять до минуты, не закрывай страницу</p>
            <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-black dark:bg-white" />
            </div>
            <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300">{analysisStage}…</p>
          </div>
        </div>
      )}
    </div>
  );
}
