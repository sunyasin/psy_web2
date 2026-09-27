"use client";

import { useEffect, useMemo, useState } from "react";

type Tracking = {
  id: string;
  step_index: number;
  step_title: string;
  status: "pending" | "selected";
};

type Step = {
  title: string;
  description?: string;
  estimated_days?: number;
};

type Strategy = {
  id: string;
  idea_index: number;
  strategy_index: number;
  title: string;
  description: string | null;
  steps: Step[];
  is_selected: boolean;
  tracking: Tracking[];
};

type Idea = {
  id: string;
  idea_index: number;
  title: string;
  description: string | null;
  strategies: Strategy[];
};

type AnalysisData = {
  analysis: {
    id: string;
    goal_answer?: string | null;
    answer_count?: number;
  } | null;
  ideas: Idea[];
};

export default function ShortAnalysisPage() {
  const [clientUuid] = useState<string | null>(() => typeof window === "undefined" ? null : localStorage.getItem("client_uuid"));
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!clientUuid) {
      queueMicrotask(() => {
        setError("Сессия не найдена. Вернитесь на главную.");
        setLoading(false);
      });
      return;
    }
    fetch(`/api/short-analysis?client_uuid=${encodeURIComponent(clientUuid)}`)
      .then(async (response) => {
        const payload = (await response.json()) as AnalysisData & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Не удалось загрузить анализ");
        setData({
          ...payload,
          ideas: payload.ideas.map((idea) => ({
            ...idea,
            strategies: idea.strategies.map((strategy) => ({
              ...strategy,
              tracking: strategy.steps.map((step, stepIndex) => ({
                id: `${strategy.id}:${stepIndex}`,
                step_index: stepIndex,
                step_title: step.title,
                status: "pending" as const,
              })),
            })),
          })),
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Не удалось загрузить анализ"))
      .finally(() => setLoading(false));
  }, [clientUuid]);

  const selectedCount = useMemo(
    () => data?.ideas.filter((idea) => idea.strategies.some((strategy) => strategy.is_selected)).length || 0,
    [data],
  );

  function updateStep(strategy: Strategy, tracking: Tracking) {
    const nextStatus = tracking.status === "selected" ? "pending" : "selected";
    setData((current) => current ? {
      ...current,
      ideas: current.ideas.map((idea) => ({
        ...idea,
        strategies: idea.strategies.map((item) => ({
          ...item,
          is_selected: item.id === strategy.id ? true : item.is_selected,
          tracking: item.tracking.map((step) => step.id === tracking.id ? { ...step, status: nextStatus } : step),
        })),
      })),
    } : current);
  }

  function toggleStrategy(strategy: Strategy) {
    const willSelect = !strategy.is_selected;
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        ideas: current.ideas.map((idea) => ({
          ...idea,
          strategies: idea.strategies.map((item) => {
            if (item.id === strategy.id) {
              return {
                ...item,
                is_selected: willSelect,
                tracking: willSelect ? item.tracking : item.tracking.map((step) => ({ ...step, status: "pending" })),
              };
            }
            if (willSelect && item.is_selected) {
              return {
                ...item,
                is_selected: false,
                tracking: item.tracking.map((step) => ({ ...step, status: "pending" })),
              };
            }
            return item;
          }),
        })),
      };
    });
  }

  async function loadIntoPlanner() {
    if (!clientUuid || !data?.analysis) return;
    setBusy(true);
    setError(null);
    setPlanMessage(null);
    try {
      const selections = data.ideas.flatMap((idea) => idea.strategies
        .filter((strategy) => strategy.is_selected)
        .map((strategy) => ({ ideaIndex: idea.idea_index, strategyIndex: strategy.strategy_index })));
      const response = await fetch("/api/short-analysis/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientUuid, analysisId: data.analysis.id, selections }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось загрузить в планировщик");
      setPlanMessage("Выбранные идеи и стратегии загружены в планировщик.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить в планировщик");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600 dark:bg-black dark:text-zinc-400">Загружаю анализ...</main>;

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Анализ цели</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">Стратегии и шаги</h1>
          </div>
          <button type="button" onClick={() => (window.location.href = "/")} className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-black hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white">На главную</button>
        </div>

        {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</p>}
        {planMessage && <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">{planMessage} <a href="/planner" className="underline">Открыть планировщик</a></p>}

        {!data?.analysis || data.ideas.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Анализ пока не найден.</p>
            <button type="button" onClick={() => (window.location.href = "/interview-select")} className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">Пройти короткое интервью</button>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Моя цель</p>
              <p className="mt-2 text-lg leading-7 text-black dark:text-zinc-50">{data.analysis.goal_answer || "Ответ на первый вопрос не найден"}</p>
            </section>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Проанализировано ответов: {data.analysis.answer_count || 0}. Выберите стратегию для этой цели.</p>
            {data.ideas.map((idea) => (
              <section key={idea.id} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
                <div>
                  <h2 className="text-lg font-semibold text-black dark:text-zinc-50">{idea.title}</h2>
                  {idea.description && <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{idea.description}</p>}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {idea.strategies.map((strategy) => {
                    const completed = strategy.tracking.filter((item) => item.status === "selected").length;
                    return (
                      <div key={strategy.id} className={`rounded-xl border-2 p-4 cursor-pointer ${strategy.is_selected ? "border-black dark:border-white" : "border-zinc-200 dark:border-zinc-700"}`} onClick={() => toggleStrategy(strategy)}>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-medium text-black dark:text-zinc-50">{strategy.title}</h3>
                          {strategy.is_selected && <span className="rounded-full bg-black px-2 py-1 text-[10px] font-medium text-white dark:bg-white dark:text-black">Выбрана</span>}
                        </div>
                        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Шагов: {strategy.steps.length} · Выбрано: {completed}</p>
                        <div className="mt-4 space-y-2">
                          {strategy.steps.map((step, index) => {
                            const tracking = strategy.tracking.find((item) => item.step_index === index);
                            const status = tracking?.status || "pending";
                            return (
                              <button key={`${strategy.id}-${index}`} type="button" onClick={(e) => { e.stopPropagation(); if (tracking) updateStep(strategy, tracking); }} className={`flex w-full cursor-pointer items-start gap-3 rounded-lg border-2 p-3 text-left ${strategy.is_selected ? "border-black dark:border-white" : "border-zinc-200 dark:border-zinc-700"} ${status === "selected" ? "bg-green-50 dark:bg-green-950" : ""} hover:border-zinc-500`}>
                                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${status === "selected" ? "border-green-600 bg-green-600 text-white" : "border-zinc-400 text-zinc-400"}`}>{status === "selected" ? "✓" : index + 1}</span>
                                <span className="min-w-0 flex-1"><span className={`block text-sm ${status === "selected" ? "text-zinc-800 dark:text-zinc-200" : "text-zinc-700 dark:text-zinc-200"}`}>{step.title}</span>{step.description && <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{step.description}</span>}<span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{status === "selected" ? "Выбран" : "Не выбран"}</span></span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            <div className="sticky bottom-4 rounded-xl border border-zinc-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
              <button type="button" onClick={loadIntoPlanner} disabled={selectedCount === 0 || busy} className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200">{busy ? "Загружаю..." : "Загрузить выбранное в планировщик"}</button>
              <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">Выбрано идей: {selectedCount}. Для каждой идеи можно выбрать только одну стратегию.</p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
