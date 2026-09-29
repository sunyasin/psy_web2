"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StrategyDetails } from "@/components/strategy-details";
import type { NewStrategy } from "@/lib/types";

type Step = {
  number: number;
  title: string;
  duration: string;
  estimated_days: number;
  description: string;
};

type Resource = {
  category: string;
  items: string[];
  rationale: string;
};

type Support = {
  who: string;
  needed: boolean;
  description: string;
};

type TimeToLaunch = {
  days_to_first_step: number;
  days_to_result: number;
  note: string;
};

type Avoid = {
  rule: string;
  reason: string;
};

type Strategy = {
  id: string;
  stage_index: number;
  strategy_index: number;
  name: string;
  approach: string;
  resources: Resource[];
  support: Support[];
  steps: Step[];
  time_to_launch: TimeToLaunch;
  timeline: string;
  budget: string;
  investment: string;
  avoid: Avoid[];
  assumptions: string[];
  is_selected: boolean;
};

type Stage = {
  id: string;
  stage_index: number;
  number: number;
  name: string;
  description: string;
  is_planned: boolean;
  planner_goal_id: string | null;
  planner_stage_id: string | null;
  strategies: Strategy[];
};

type AnalysisData = {
  analysis: {
    id: string;
    goal_answer?: string | null;
    answer_count?: number;
  } | null;
  response: {
    title: string;
    description: string;
  } | null;
  stages: Stage[];
};

export default function ShortAnalysisPage() {
  const [clientUuid] = useState<string | null>(() => typeof window === "undefined" ? null : localStorage.getItem("client_uuid"));
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planMessage, setPlanMessage] = useState<string | null>(null);
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);

  const loadAnalysis = useCallback(async () => {
    if (!clientUuid) {
      setError("Сессия не найдена. Вернитесь на главную.");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch(`/api/short-analysis?client_uuid=${encodeURIComponent(clientUuid)}`);
      const payload = (await response.json()) as AnalysisData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Не удалось загрузить анализ");
      setData({
        ...payload,
        stages: (payload.stages || []).map((stage) => ({
          ...stage,
          is_planned: Boolean(stage.is_planned),
          planner_goal_id: stage.planner_goal_id ?? null,
          planner_stage_id: stage.planner_stage_id ?? null,
          strategies: (stage.strategies || []).map((strategy) => ({
            ...strategy,
            approach: strategy.approach || "",
            resources: strategy.resources || [],
            support: strategy.support || [],
            steps: strategy.steps || [],
            time_to_launch: strategy.time_to_launch || { days_to_first_step: 0, days_to_result: 0, note: "" },
            timeline: strategy.timeline || "",
            budget: strategy.budget || "",
            investment: strategy.investment || "",
            avoid: strategy.avoid || [],
            assumptions: strategy.assumptions || [],
            is_selected: false,
          })),
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить анализ");
    } finally {
      setLoading(false);
    }
  }, [clientUuid]);

  useEffect(() => {
    // Загрузка вне тела эффекта, чтобы обновления состояния не шли синхронно.
    const timer = window.setTimeout(() => {
      void loadAnalysis();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAnalysis]);

  const selectedCount = useMemo(
    () => data?.stages.filter((stage) => stage.strategies.some((strategy) => strategy.is_selected)).length || 0,
    [data],
  );

  function toggleStrategy(strategy: Strategy) {
    const willSelect = !strategy.is_selected;
    setExpandedStrategy(willSelect ? strategy.id : null);
    setData((current) => {
      if (!current) return current;
      return {
        ...current,
        stages: current.stages.map((stage) => ({
          ...stage,
          strategies: stage.strategies.map((item) => {
            if (item.id === strategy.id) return { ...item, is_selected: willSelect };
            if (willSelect && item.is_selected) return { ...item, is_selected: false };
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
      const selections = data.stages.flatMap((stage) => stage.strategies
        .filter((strategy) => strategy.is_selected)
        .map((strategy) => ({ ideaIndex: stage.stage_index, strategyIndex: strategy.strategy_index })));
      const response = await fetch("/api/short-analysis/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientUuid, analysisId: data.analysis.id, selections }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось загрузить в планировщик");
      setPlanMessage("Выбранные идеи и стратегии загружены в планировщик.");
      // Перечитываем анализ, чтобы этапы, попавшие в планировщик, сразу получили рамку и ссылку.
      await loadAnalysis();
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

        {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-zinc-300">{error}</p>}
        {planMessage && <p className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">{planMessage} <a href="/planner" className="underline">Открыть планировщик</a></p>}

        {!data?.analysis || data.stages.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Анализ пока не найден.</p>
            <button type="button" onClick={() => (window.location.href = "/interview-select")} className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">Пройти короткое интервью</button>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Моя цель</p>
              <p className="mt-2 text-lg leading-7 text-black dark:text-zinc-50">{data.analysis.goal_answer || "Ответ на первый вопрос не найден"}</p>
              {data.response && (data.response.title || data.response.description) && (
                <div className="mt-5 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                  {data.response.title && <h2 className="text-lg font-semibold text-black dark:text-zinc-50">{data.response.title}</h2>}
                  {data.response.description && <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{data.response.description}</p>}
                </div>
              )}
            </section>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Проанализировано ответов: {data.analysis.answer_count || 0}. Выберите стратегию для каждого этапа.</p>
            {data.stages.map((stage) => (
              <section
                key={stage.id}
                className={`space-y-4 rounded-2xl border-2 bg-white p-6 dark:bg-zinc-900 ${
                  stage.is_planned
                    ? "border-green-500 dark:border-green-400"
                    : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <div>
                  <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
                    Этап {stage.number}. {stage.name}
                    {stage.is_planned && (
                      <>
                        {" · "}
                        <a
                          href={stage.planner_goal_id ? `/planner/goal?id=${encodeURIComponent(stage.planner_goal_id)}` : "/planner"}
                          className="text-green-600 underline underline-offset-2 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
                        >
                          Уже в планировщике
                        </a>
                      </>
                    )}
                  </h2>
                  {stage.description && <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{stage.description}</p>}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {stage.strategies.map((strategy) => {
                    return (
                      <div key={strategy.id} className={`rounded-xl border-2 p-4 cursor-pointer ${strategy.is_selected ? "border-black dark:border-white" : "border-zinc-200 dark:border-zinc-700"}`} onClick={() => toggleStrategy(strategy)}>
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-medium text-black dark:text-zinc-50">{strategy.name}</h3>
                          {strategy.is_selected && <span className="rounded-full bg-black px-2 py-1 text-[10px] font-medium text-white dark:bg-white dark:text-black">Выбрана</span>}
                        </div>
                        {strategy.approach && <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{strategy.approach}</p>}
                        <div className="mt-3 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {strategy.timeline && <span className="block">Сроки: {strategy.timeline}</span>}
                          {strategy.budget && <span className="block">Бюджет: {strategy.budget}</span>}
                          {strategy.investment && <span className="block">Вложения: {strategy.investment}</span>}
                          {strategy.time_to_launch && (strategy.time_to_launch.days_to_first_step > 0 || strategy.time_to_launch.days_to_result > 0) && (
                            <span className="block">
                              До первого шага: {strategy.time_to_launch.days_to_first_step} дн. · до результата этапа: {strategy.time_to_launch.days_to_result} дн.
                            </span>
                          )}
                          <span className="block">Шагов: {strategy.steps.length}</span>
                        </div>
                        <div className="mt-4 space-y-2">
                          {strategy.steps.map((step, index) => (
                            <div key={`${strategy.id}-${index}`} className="flex w-full items-start gap-3 rounded-lg border-2 border-zinc-200 p-3 text-left dark:border-zinc-700">
                              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-400 text-xs text-zinc-400">{step.number || index + 1}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm text-zinc-700 dark:text-zinc-200">{step.title}</span>
                                {step.duration && <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{step.duration}</span>}
                                {step.description && <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">{step.description}</span>}
                                {step.estimated_days > 0 && <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">Срок: {step.estimated_days} дн.</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                        {expandedStrategy === strategy.id && (
                          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-left dark:border-zinc-800 dark:bg-zinc-950/40" onClick={(e) => e.stopPropagation()}>
                            <StrategyDetails strategy={strategy as NewStrategy} />
                          </div>
                        )}
                        <button
                          type="button"
                          className="mt-4 text-xs font-medium text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedStrategy((current) => (current === strategy.id ? null : strategy.id));
                          }}
                        >
                          {expandedStrategy === strategy.id ? "Скрыть детали" : "Показать детали"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            <div className="sticky bottom-4 rounded-xl border border-zinc-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
              <button type="button" onClick={loadIntoPlanner} disabled={selectedCount === 0 || busy} className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200">{busy ? "Загружаю..." : "Загрузить выбранное в планировщик"}</button>
              <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">Выбрано этапов: {selectedCount}. Для каждого этапа можно выбрать только одну стратегию.</p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
