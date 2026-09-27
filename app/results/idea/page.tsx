"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Idea, GoalRow } from "@/lib/types";

type DecomposeStep = {
  step: number;
  title: string;
  description: string;
  estimated_days: number;
};

type DecomposeStrategy = {
  id: string;
  idea_index: number;
  strategy_index: number;
  title: string;
  steps: DecomposeStep[];
};

type DecomposeIdea = {
  id: string;
  idea_index: number;
  title: string;
  description: string | null;
  strategies: DecomposeStrategy[];
};

type DecomposePayload = {
  analysis: { id: string; goal_answer: string | null; answer_count: number } | null;
  ideas: DecomposeIdea[];
  plannedIdeas: PlannedIdeaInfo[];
};

type PlannedIdeaInfo = { title: string; stageCount: number };

type PlanSelection = { idea_index: number; strategy_index: number };

type PlannedGoal = { id: string; title: string; stepCount: number };

function getSubscriptionTier(): string {
  const is_paid = "nopaid"; //paid
  try {
    return typeof window !== "undefined" ? (localStorage.getItem("subscription_tier") || is_paid) : is_paid;
  } catch {
    return is_paid;
  }
}

export default function IdeaPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const goalId = searchParams.get("goal_id") || "";

  const [idea, setIdea] = useState<Idea | null>(null);
  const [goal, setGoal] = useState<GoalRow | null>(null);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [sabotageLoading, setSabotageLoading] = useState(false);
  const [sabotageResult, setSabotageResult] = useState<string | null>(null);
  const [sabotageError, setSabotageError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showBookingPopup, setShowBookingPopup] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [hasDefaultInterview, setHasDefaultInterview] = useState(false);
  const [decomposeLoading, setDecomposeLoading] = useState(false);
  const [decomposeIdeas, setDecomposeIdeas] = useState<DecomposeIdea[]>([]);
  const [decomposeAnalysisId, setDecomposeAnalysisId] = useState<string | null>(null);
  const [decomposeError, setDecomposeError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [planLoading, setPlanLoading] = useState(false);
  const [plannedGoals, setPlannedGoals] = useState<PlannedGoal[] | null>(null);
  const [plannedIdeas, setPlannedIdeas] = useState<PlannedIdeaInfo[]>([]);
  const [pendingSelections, setPendingSelections] = useState<PlanSelection[] | null>(null);

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) {
      router.push("/");
      return;
    }

    if (!goalId) {
      return;
    }

    (async () => {
      try {
        const res = await fetch(`/api/goals/get?id=${encodeURIComponent(goalId)}&client_uuid=${encodeURIComponent(clientUuid)}`);
        const data = await res.json();
        if (res.ok && data.goal) {
          const match = data.goal as GoalRow;
          setGoal(match);
          setHasDefaultInterview(Boolean(match.has_default_interview));
          const smart = match.smart_json || {};
          setIdea({
            title: match.title,
            description: typeof smart.description === "string" ? smart.description : "",
            tags: Array.isArray(smart.tags) ? smart.tags : [],
          });
          if (match.conflict_analysis) {
            setSabotageResult(match.conflict_analysis);
          }
        }
      } catch (err) {
        console.error("Failed to load goal:", err);
      } finally {
        setGoalsLoading(false);
      }
    })();

    (async () => {
      try {
        const res = await fetch(
          `/api/analysis/decompose?client_uuid=${encodeURIComponent(clientUuid)}&goal_id=${encodeURIComponent(goalId)}`
        );
        if (!res.ok) return;
        const payload = (await res.json()) as DecomposePayload;
        setDecomposeAnalysisId(payload.analysis?.id ?? null);
        setDecomposeIdeas(Array.isArray(payload.ideas) ? payload.ideas : []);
        setPlannedIdeas(Array.isArray(payload.plannedIdeas) ? payload.plannedIdeas : []);
        setPlannedGoals(null);
      } catch (err) {
        console.error("Failed to load decomposition:", err);
      }
    })();
  }, [goalId, router]);

  const handleWithSubscription = useCallback((action: () => void) => {
    const tier = getSubscriptionTier();
    if (tier !== "paid") {
      router.push("/tariffs");
      return;
    }
    action();
  }, [router]);

  const handleSabotage = useCallback(async () => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    if (!goal) {
      setSabotageError("Нет выбранной цели");
      return;
    }

    setSabotageLoading(true);
    setSabotageError(null);
    setSabotageResult(null);

    try {
      const res = await fetch("/api/analysis/sabotage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_uuid: clientUuid, goal_id: goal.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ошибка анализа");
      }

      setSabotageResult(data.analysis || "");
      setGoal((prev) => (prev ? { ...prev, conflict_analysis: data.analysis } : prev));
    } catch (err) {
      setSabotageError(err instanceof Error ? err.message : "Ошибка соединения");
    } finally {
      setSabotageLoading(false);
    }
  }, [goal]);

  const handleDelete = async () => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid || !goal) return;

    setDeleteLoading(true);
    setShowDeleteConfirm(false);

    try {
      const res = await fetch("/api/goals/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_uuid: clientUuid, goal_id: goal.id }),
      });

      if (!res.ok) {
        throw new Error("Не удалось удалить цель");
      }

      router.push("/results");
    } catch (err) {
      setSabotageError(err instanceof Error ? err.message : "Ошибка удаления");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleVariant1 = () => {
    const tier = getSubscriptionTier();
    if (tier !== "paid") {
      router.push("/tariffs");
      return;
    }
    if (!goal) return;
    router.push(`/problem?goal_id=${encodeURIComponent(goal.id)}`);
  };

  // Подписка пока считается оплаченной на сервере, поэтому handleWithSubscription
  // здесь намеренно не используется.
  const handleDecompose = async () => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid || !goal) return;

    setDecomposeLoading(true);
    setDecomposeError(null);
    setPlannedGoals(null);

    try {
      const res = await fetch("/api/analysis/decompose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_uuid: clientUuid, goal_id: goal.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ошибка декомпозиции");
      }

      const payload = data as DecomposePayload;
      setDecomposeAnalysisId(payload.analysis?.id ?? null);
      setDecomposeIdeas(Array.isArray(payload.ideas) ? payload.ideas : []);
      setPlannedIdeas(Array.isArray(payload.plannedIdeas) ? payload.plannedIdeas : []);
      setSelected({});
    } catch (err) {
      setDecomposeError(err instanceof Error ? err.message : "Ошибка соединения");
    } finally {
      setDecomposeLoading(false);
    }
  };

  const handleSelectStrategy = (ideaIndex: number, strategyIndex: number) => {
    setSelected((prev) => ({ ...prev, [ideaIndex]: strategyIndex }));
  };

  const handleDecomposePlan = async () => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid || !decomposeAnalysisId) return;

    const selections: PlanSelection[] = Object.entries(selected).map(([ideaIndex, strategyIndex]) => ({
      idea_index: Number(ideaIndex),
      strategy_index: strategyIndex,
    }));
    if (selections.length === 0) return;

    // Предупреждаем только когда этапы действительно есть и будут перезаписаны.
    const withStages = new Set(plannedIdeas.filter((item) => item.stageCount > 0).map((item) => item.title));
    const risky = selections.filter((item) => withStages.has(decomposeIdeas[item.idea_index]?.title));

    if (risky.length > 0) {
      setPendingSelections(selections);
      return;
    }

    await submitPlan(selections);
  };

  const confirmOverwrite = async () => {
    const selections = pendingSelections;
    setPendingSelections(null);
    if (selections) await submitPlan(selections);
  };

  const submitPlan = async (selections: PlanSelection[]) => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid || !decomposeAnalysisId) return;

    setPlanLoading(true);
    setDecomposeError(null);

    try {
      const res = await fetch("/api/analysis/decompose/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_uuid: clientUuid,
          analysis_id: decomposeAnalysisId,
          selections,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Не удалось разложить в план");
      }

      setPlannedGoals(Array.isArray(data.goals) ? data.goals : []);
      setPlannedIdeas([]);
      await reloadPlannedIdeas();
    } catch (err) {
      setDecomposeError(err instanceof Error ? err.message : "Ошибка соединения");
    } finally {
      setPlanLoading(false);
    }
  };

  const handleBookingOk = async () => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    setBookingLoading(true);
    try {
      const res = await fetch("/api/booking/consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_uuid: clientUuid }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка записи");
      }
      setShowBookingPopup(false);
    } catch (err) {
      setSabotageError(err instanceof Error ? err.message : "Ошибка записи");
    } finally {
      setBookingLoading(false);
    }
  };

  const handleBookingCancel = () => {
    setShowBookingPopup(false);
  };

  const isIdeaPlanned = (item: DecomposeIdea) =>
    plannedIdeas.some((planned) => planned.title === item.title);

  const reloadPlannedIdeas = async () => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid || !goalId) return;
    try {
      const res = await fetch(
        `/api/analysis/decompose?client_uuid=${encodeURIComponent(clientUuid)}&goal_id=${encodeURIComponent(goalId)}`
      );
      if (!res.ok) return;
      const payload = (await res.json()) as DecomposePayload;
      setPlannedIdeas(Array.isArray(payload.plannedIdeas) ? payload.plannedIdeas : []);
    } catch (err) {
      console.error("Failed to reload planned ideas:", err);
    }
  };

  const ideaDescription = idea?.description || "";

  if (goalsLoading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Загружаю...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full flex-1 flex-col">
        <div className="flex flex-col md:flex-row flex-1">
          <aside className="sticky top-0 self-start w-full md:w-64 flex-shrink-0 overflow-y-auto border-b md:border-b-0 md:border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
            <nav className="flex flex-row flex-wrap gap-2 p-4">
              <button
                onClick={() => router.push("/results")}
                className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                ← К списку идей
              </button>
              <button
                onClick={() => router.push("/")}
                className="whitespace-nowrap rounded-md px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                Главное меню
              </button>
            </nav>
          </aside>

          <section className="flex flex-1 flex-col bg-white dark:bg-black">
            <div className="p-6">
              {idea ? (
                <div className="max-w-2xl space-y-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
                        {idea.title}
                      </h1>
                      <p className="mt-3 text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {ideaDescription}
                      </p>
                    </div>
                  </div>

                  {goal && goal.status !== "trash" && (
                    <div className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                      Статус цели: {goal.status === "trash" ? "🗑 Корзина" : "Активная"}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => handleWithSubscription(handleSabotage)}
                      disabled={sabotageLoading || !goal}
                      className="flex-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                    >
                      {sabotageLoading
                        ? "Анализирую..."
                        : goal?.conflict_analysis && goal.status !== "trash"
                          ? "Перезапустить анализ саботажа"
                          : "Анализ саботажа"}
                    </button>

                    <button
                      onClick={handleDecompose}
                      disabled={decomposeLoading || !goal || goal.status === "trash" || !hasDefaultInterview}
                      className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                    >
                      {decomposeLoading
                        ? "Декомпозирую..."
                        : decomposeAnalysisId
                          ? "Перезапустить декомпозицию"
                          : "Декомпозиция"}
                    </button>

                    <button
                      onClick={() => {
                        if (!goal) return;
                        handleWithSubscription(() =>
                          router.push(
                            `/brainstorm?goal_id=${encodeURIComponent(goal.id)}&title=${encodeURIComponent(idea.title)}&description=${encodeURIComponent(idea.description || "")}&tags=${encodeURIComponent(JSON.stringify(idea.tags))}`
                          )
                        );
                      }}
                      className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                    >
                      Брейншторм-чат
                    </button>

                    {goal && goal.status !== "trash" && (
                      <button
                        onClick={() => handleWithSubscription(() => setShowDeleteConfirm(true))}
                        className="flex-1 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:border-red-400 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                      >
                        Забыть идею
                      </button>
                    )}
                  </div>

                  {!hasDefaultInterview && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Чтобы разложить цель, сначала пройдите полное интервью.
                    </p>
                  )}

                  {decomposeError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                      {decomposeError}
                    </div>
                  )}

                  {sabotageLoading && (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="flex items-center gap-3">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent dark:border-white dark:border-t-transparent" />
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">
                          Анализ саботажа в процессе...
                        </span>
                      </div>
                    </div>
                  )}

                  {sabotageError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                      {sabotageError}
                    </div>
                  )}

                  {sabotageResult && !sabotageLoading && (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                      <h3 className="mb-2 text-sm font-semibold text-black dark:text-zinc-50">
                        Результат анализа саботажа
                      </h3>
                      <div className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {sabotageResult.split("\n").map((line, idx) => {
                          if (line.startsWith("## ")) {
                            return (
                              <h4 key={idx} className="mt-3 mb-1 text-base font-semibold text-black dark:text-zinc-50">
                                {line.replace("## ", "")}
                              </h4>
                            );
                          }
                          if (line.startsWith("- ")) {
                            return (
                              <li key={idx} className="ml-4 list-disc">
                                {line.replace("- ", "")}
                              </li>
                            );
                          }
                          if (line.trim() === "") {
                            return <br key={idx} />;
                          }
                          return (
                            <p key={idx} className="mb-1">
                              {line}
                            </p>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {decomposeLoading && (
                    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="flex items-center gap-3">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent dark:border-white dark:border-t-transparent" />
                        <span className="text-sm text-zinc-600 dark:text-zinc-400">
                          Декомпозиция цели в процессе...
                        </span>
                      </div>
                    </div>
                  )}

                  {decomposeIdeas.length > 0 && !decomposeLoading && (
                    <div className="space-y-4">
                      <div className="space-y-3">
{decomposeIdeas.map((item) => {
                                const planned = isIdeaPlanned(item);
                                return (
                                  <div
                                    key={item.id}
                                    className={`rounded-xl border-2 p-4 transition-colors ${
                                      planned
                                        ? "border-green-500 bg-green-50 dark:border-green-400 dark:bg-green-950/40"
                                        : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
                                        {item.title}
                                      </h3>
                                      {planned && (
                                        <span className="shrink-0 rounded-full bg-green-500 px-2 py-0.5 text-[10px] font-medium text-white dark:bg-green-400">
                                          В плане
                                        </span>
                                      )}
                                    </div>
                                    {item.description && (
                                      <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                                        {item.description}
                                      </p>
                                    )}
                                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                                      {item.strategies.map((strategy) => {
                                        const isSelected = selected[item.idea_index] === strategy.strategy_index;
                                        return (
                                          <button
                                            key={strategy.id}
                                            type="button"
                                            onClick={() =>
                                              handleSelectStrategy(item.idea_index, strategy.strategy_index)
                                            }
                                            className={`rounded-xl border-2 p-4 text-left transition-colors hover:border-zinc-500 ${
                                              isSelected
                                                ? "border-black dark:border-white"
                                                : "border-zinc-200 dark:border-zinc-700"
                                            }`}
                                          >
                                            <div className="flex items-start justify-between gap-2">
                                              <h4 className="text-sm font-medium text-black dark:text-zinc-50">
                                                {strategy.title}
                                              </h4>
                                              {isSelected && (
                                                <span className="shrink-0 rounded-full bg-black px-2 py-0.5 text-[10px] font-medium text-white dark:bg-white dark:text-black">
                                                  Выбрана
                                                </span>
                                              )}
                                            </div>
                                            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                                              Шагов: {strategy.steps.length}
                                            </p>
                                            <div className="mt-3 space-y-2">
                                              {strategy.steps.map((step, stepIndex) => (
                                                <div
                                                  key={`${strategy.id}-${stepIndex}`}
                                                  className={`flex items-start gap-2 rounded-lg border-2 p-2 transition-colors ${
                                                    planned
                                                      ? "border-green-500 bg-green-50 dark:border-green-400 dark:bg-green-950/40"
                                                      : "border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                                                  }`}
                                                >
                                                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-300 text-xs text-zinc-500 dark:border-zinc-600 dark:text-zinc-400">
                                                    {stepIndex + 1}
                                                  </span>
                                                  <span className="min-w-0 flex-1">
                                                    <span className="block text-sm text-zinc-700 dark:text-zinc-200">
                                                      {step.title}
                                                    </span>
                                                    {step.description && (
                                                      <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                                                        {step.description}
                                                      </span>
                                                    )}
                                                    {step.estimated_days > 0 && (
                                                      <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                                                        Срок: {step.estimated_days} дн.
                                                      </span>
                                                    )}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                      </div>

                      <div className="sticky bottom-4 rounded-xl border border-zinc-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
                        {plannedGoals ? (
                          <div className="space-y-2">
                            <p className="text-sm font-medium text-black dark:text-zinc-50">
                              Создано целей: {plannedGoals.length}
                            </p>
                            {plannedGoals.map((planned) => (
                              <a
                                key={planned.id}
                                href={`/planner/goal?id=${encodeURIComponent(planned.id)}`}
                                className="block rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:border-black dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-white"
                              >
                                {planned.title} · шагов: {planned.stepCount}
                              </a>
                            ))}
                            <a
                              href="/planner"
                              className="block text-center text-xs text-zinc-500 underline dark:text-zinc-400"
                            >
                              Ко всем целям
                            </a>
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={handleDecomposePlan}
                              disabled={
                                planLoading || Object.keys(selected).length === 0 || !decomposeAnalysisId
                              }
                              className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                            >
                              {planLoading ? "Разкладываю..." : "Разложить в план"}
                            </button>
                            <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
                              Выбрано идей: {Object.keys(selected).length}. Для каждой идеи можно выбрать
                              только одну стратегию.
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {sabotageResult && !sabotageLoading && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        onClick={handleVariant1}
                        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                      >
                        Вариант 1 - Чат с ИИ
                      </button>
                      <button
                        onClick={() => setShowBookingPopup(true)}
                        className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                      >
                        Вариант 2 - онлайн консультация
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Идея не найдена.
                  </p>
                  <button
                    onClick={() => router.push("/results")}
                    className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    Вернуться к результатам
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        {pendingSelections && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="mb-2 text-lg font-semibold text-black dark:text-zinc-50">
                Перезаписать план?
              </h3>
              <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                Эти идеи уже разложены в планировщик. Повторная раскладка полностью удалит их этапы и шаги
                вместе с отметками о выполнении:
              </p>
              <ul className="mb-4 space-y-1">
                {pendingSelections.map((item) => {
                  const idea = decomposeIdeas[item.idea_index];
                  if (!idea) return null;
                  return (
                    <li key={`${item.idea_index}-${item.strategy_index}`} className="text-sm text-zinc-700 dark:text-zinc-200">
                      — {idea.title}
                    </li>
                  );
                })}
              </ul>
              <div className="flex gap-3">
                <button
                  onClick={() => setPendingSelections(null)}
                  className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                  disabled={planLoading}
                >
                  Отмена
                </button>
                <button
                  onClick={confirmOverwrite}
                  className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={planLoading}
                >
                  {planLoading ? "Перезаписываю..." : "ОК, перезаписать"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showDeleteConfirm && goal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="mb-2 text-lg font-semibold text-black dark:text-zinc-50">
                Забыть идею?
              </h3>
              <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
                Цель «{goal.title}» будет перемещена в корзину. Это действие можно отменить в разделе «Мои цели».
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                  disabled={deleteLoading}
                >
                  Отмена
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={deleteLoading}
                >
                  {deleteLoading ? "Удаляю..." : "Удалить в корзину"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showBookingPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
              <p className="mb-4 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                Записываясь на бесплатную консультацию я даю согласие на ознакомление специалиста с моими ответами на вопросы интервью и анализом от ИИ, кроме чат-сессий брейншторма по конкретным идеям.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleBookingCancel}
                  className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                  disabled={bookingLoading}
                >
                  Отмена
                </button>
                <button
                  onClick={handleBookingOk}
                  className="flex-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  disabled={bookingLoading}
                >
                  {bookingLoading ? "Записываю..." : "ОК"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
