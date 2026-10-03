"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { Idea, GoalRow, ModelIdea, NewResponse } from "@/lib/types";

type DecomposeStep = {
  number: number;
  title: string;
  duration: string;
  estimated_days: number;
  description: string;
};

type DecomposeStrategy = {
  id: string;
  idea_index: number;
  strategy_index: number;
  name: string;
  approach: string;
  resources: { category: string; items: string[]; rationale: string }[];
  support: { who: string; needed: boolean; description: string }[];
  steps: DecomposeStep[];
  time_to_launch: { days_to_first_step: number; days_to_result: number; note: string };
  timeline: string;
  budget: string;
  investment: string;
  avoid: { rule: string; reason: string }[];
  assumptions: string[];
};

type DecomposeIdea = {
  id: string;
  idea_index: number;
  title: string;
  description: string | null;
  strategies: DecomposeStrategy[];
};

type PlannedIdeaInfo = { title: string; stageCount: number };

type PlanSelection = { idea_index: number; strategy_index: number };

type PlannedGoal = { id: string; title: string; stepCount: number };

function getSubscriptionTier(): string {
  const is_paid = "paid"; //paid
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
  const [expandedStrategy, setExpandedStrategy] = useState<{ ideaIndex: number; strategyIndex: number } | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [plannedGoals, setPlannedGoals] = useState<PlannedGoal[] | null>(null);
  const [plannedIdeas, setPlannedIdeas] = useState<PlannedIdeaInfo[]>([]);
  const [pendingSelections, setPendingSelections] = useState<PlanSelection[] | null>(null);
  const [modelIdea, setModelIdea] = useState<ModelIdea | null>(null);

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
          // Fetch model idea data from analysis if source_analysis_id exists
          if (match.source_analysis_id) {
            try {
              const analysisRes = await fetch(`/api/analysis/get?id=${encodeURIComponent(match.source_analysis_id)}&client_uuid=${encodeURIComponent(clientUuid)}`);
              if (analysisRes.ok) {
                const analysisData = await analysisRes.json();
                if (analysisData.analysis?.model_json) {
                  const modelJson = analysisData.analysis.model_json;
                  // Parse raw_response if present
                  let ideas: ModelIdea[] = [];
                  if (modelJson.raw_response) {
                    try {
                      const cleaned = modelJson.raw_response.replace(/```json\n?|\n?```/g, "").trim();
                      const parsed = JSON.parse(cleaned);
                      if (Array.isArray(parsed)) {
                        ideas = parsed;
                      }
                    } catch (err) {
                      console.error("Failed to parse model_json raw_response:", err);
                    }
                  } else if (Array.isArray(modelJson.ideas)) {
                    ideas = modelJson.ideas;
                  }
                  // Find the idea matching the goal title
                  const matchedIdea = ideas.find((mi) => mi.title === match.title);
                  if (matchedIdea) {
                    setModelIdea(matchedIdea);
                  }
                }
              }
            } catch (err) {
              console.error("Failed to load model idea:", err);
            }
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
        const newResponse = (await res.json()) as NewResponse;
        setDecomposeAnalysisId(""); // analysis id not in new response
        // Transform new response to UI format: each stage becomes a DecomposeIdea
        const transformedIdeas: DecomposeIdea[] = (newResponse.stages || []).map((stage, stageIndex) => ({
          id: `stage-${stage.number}`,
          idea_index: stageIndex,
          title: stage.name,
          description: stage.description,
          strategies: (stage.strategies || []).map((strategy, strategyIndex) => ({
            id: `stage-${stage.number}-strategy-${strategyIndex}`,
            idea_index: stageIndex,
            strategy_index: strategyIndex,
            name: strategy.name,
            approach: strategy.approach,
            resources: strategy.resources,
            support: strategy.support,
            steps: strategy.steps.map((step) => ({
              number: step.number,
              title: step.title,
              duration: step.duration,
              estimated_days: step.estimated_days,
              description: step.description,
            })),
            time_to_launch: strategy.time_to_launch,
            timeline: strategy.timeline,
            budget: strategy.budget,
            investment: strategy.investment,
            avoid: strategy.avoid,
            assumptions: strategy.assumptions,
          })),
        }));
        setDecomposeIdeas(transformedIdeas);
        setPlannedIdeas([]);
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

      const newResponse = data as NewResponse;
      setDecomposeAnalysisId(""); // analysis id not in new response
      const transformedIdeas: DecomposeIdea[] = (newResponse.stages || []).map((stage, stageIndex) => ({
        id: `stage-${stage.number}`,
        idea_index: stageIndex,
        title: stage.name,
        description: stage.description,
        strategies: (stage.strategies || []).map((strategy, strategyIndex) => ({
          id: `stage-${stage.number}-strategy-${strategyIndex}`,
          idea_index: stageIndex,
          strategy_index: strategyIndex,
          name: strategy.name,
          approach: strategy.approach,
          resources: strategy.resources,
          support: strategy.support,
          steps: strategy.steps.map((step) => ({
            number: step.number,
            title: step.title,
            duration: step.duration,
            estimated_days: step.estimated_days,
            description: step.description,
          })),
          time_to_launch: strategy.time_to_launch,
          timeline: strategy.timeline,
          budget: strategy.budget,
          investment: strategy.investment,
          avoid: strategy.avoid,
          assumptions: strategy.assumptions,
        })),
      }));
      setDecomposeIdeas(transformedIdeas);
      setPlannedIdeas([]);
      setSelected({});
    } catch (err) {
      setDecomposeError(err instanceof Error ? err.message : "Ошибка соединения");
    } finally {
      setDecomposeLoading(false);
    }
  };

  const handleSelectStrategy = (ideaIndex: number, strategyIndex: number) => {
    setSelected((prev) => ({ ...prev, [ideaIndex]: strategyIndex }));
    setExpandedStrategy({ ideaIndex, strategyIndex });
  };

  const handleDecomposePlan = async () => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

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
    if (!clientUuid) return;

    setPlanLoading(true);
    setDecomposeError(null);

    try {
      const res = await fetch("/api/analysis/decompose/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_uuid: clientUuid,
          analysis_id: decomposeAnalysisId || "",
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
      const data = await res.json();
      // Handle both old DecomposePayload and new NewResponse formats
      const plannedIdeas = (data as { plannedIdeas?: PlannedIdeaInfo[] }).plannedIdeas;
      setPlannedIdeas(Array.isArray(plannedIdeas) ? plannedIdeas : []);
    } catch (err) {
      console.error("Failed to reload planned ideas:", err);
    }
  };

  const ideaDescription = idea?.description || "";

  const [expandedModelIdea, setExpandedModelIdea] = useState(false);

  const formatQuotes = (quotes: string[]) => (
    <div className="space-y-2">
      {quotes.map((quote, idx) => (
        <div key={idx} className="border-l-2 border-zinc-300 pl-3 text-sm text-zinc-700 italic dark:border-zinc-600 dark:text-zinc-300">
          «{quote}»
        </div>
      ))}
    </div>
  );

  const formatFirstStep = (firstStep: ModelIdea["first_step"]) => (
    <div className="space-y-3">
      <div>
        <p className="font-medium text-zinc-900 dark:text-zinc-100">Действие</p>
        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{firstStep.action}</p>
      </div>
      <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800 space-y-2">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-medium">Дней до теста:</span> {firstStep.days_to_first_test}
        </p>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-medium">Сложность:</span> {firstStep.difficulty}
        </p>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          <span className="font-medium">Ресурсы:</span> {firstStep.resources.join(", ") || "—"}
        </p>
      </div>
    </div>
  );

  const formatSimilarCases = (cases: ModelIdea["similar_cases"]) => (
    <div className="space-y-3">
      {cases.map((c, idx) => (
        <div key={idx} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">{c.name}</p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300"><span className="font-medium">Похожесть:</span> {c.similarity}</p>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300"><span className="font-medium">Подход:</span> {c.approach}</p>
        </div>
      ))}
    </div>
  );

  const formatMarket = (market: ModelIdea["market"]) => (
    <div className="space-y-4">
      <div>
        <p className="font-medium text-zinc-900 dark:text-zinc-100">Обзор рынка</p>
        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{market.overview}</p>
      </div>
      {market.competitors.length > 0 && (
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">Конкуренты / Альтернативы</p>
          <ul className="mt-2 space-y-1 list-disc list-inside text-sm text-zinc-700 dark:text-zinc-300">
            {market.competitors.map((c, idx) => (
              <li key={idx}><span className="font-medium">{c.name}</span> — {c.note}</li>
            ))}
          </ul>
        </div>
      )}
      {market.helpers.length > 0 && (
        <div>
          <p className="font-medium text-zinc-900 dark:text-zinc-100">Помощники / Провайдеры</p>
          <ul className="mt-2 space-y-1 list-disc list-inside text-sm text-zinc-700 dark:text-zinc-300">
            {market.helpers.map((h, idx) => (
              <li key={idx}><span className="font-medium">{h.name}</span> — {h.how_helps}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  const formatRisks = (risks: ModelIdea["risks"]) => (
    <div className="space-y-4">
      {Object.entries(risks).map(([category, items]) => (
        items.length > 0 && (
          <div key={category} className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
            <p className="font-medium text-zinc-900 dark:text-zinc-100 capitalize">{category}</p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-sm text-zinc-700 dark:text-zinc-300">
              {items.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        )
      ))}
    </div>
  );

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

                  {modelIdea && (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                      <button
                        type="button"
                        onClick={() => setExpandedModelIdea((prev) => !prev)}
                        className="w-full flex items-center justify-between gap-4 p-4 text-left"
                        aria-expanded={expandedModelIdea}
                      >
                        <span className="font-semibold text-black dark:text-zinc-50">Детальный анализ от модели</span>
                        <svg
                          className={`h-5 w-5 text-zinc-500 transition-transform ${expandedModelIdea ? "rotate-180" : ""}`}
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01-.02-1.06z" />
                        </svg>
                      </button>
                      {expandedModelIdea && (
                        <div className="border-t border-zinc-200 p-4 space-y-6 dark:border-zinc-800">
                          {modelIdea.quotes && modelIdea.quotes.length > 0 && (
                            <div>
                              <h3 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Цитаты из интервью</h3>
                              {formatQuotes(modelIdea.quotes)}
                            </div>
                          )}
                          {modelIdea.why_you && (
                            <div>
                              <h3 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Почему это подходит вам</h3>
                              <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{modelIdea.why_you}</p>
                            </div>
                          )}
                          {modelIdea.first_step && (
                            <div>
                              <h3 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Первый шаг</h3>
                              {formatFirstStep(modelIdea.first_step)}
                            </div>
                          )}
                          {modelIdea.market && (
                            <div>
                              <h3 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Рынок и окружение</h3>
                              {formatMarket(modelIdea.market)}
                            </div>
                          )}
                          {modelIdea.risks && (
                            <div>
                              <h3 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Риски</h3>
                              {formatRisks(modelIdea.risks)}
                            </div>
                          )}
                          {modelIdea.similar_cases && modelIdea.similar_cases.length > 0 && (
                            <div>
                              <h3 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Похожие кейсы</h3>
                              {formatSimilarCases(modelIdea.similar_cases)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

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
                                          <>
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
                                                {strategy.name}
                                              </h4>
                                              {isSelected && (
                                                <span className="shrink-0 rounded-full bg-black px-2 py-0.5 text-[10px] font-medium text-white dark:bg-white dark:text-black">
                                                  Выбрана
                                                </span>
                                              )}
                                            </div>
                                            {strategy.approach && (
                                              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2">
                                                {strategy.approach}
                                              </p>
                                            )}
                                            <div className="mt-3 space-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                                              {strategy.timeline && (
                                                <span className="block">📅 {strategy.timeline}</span>
                                              )}
                                              {strategy.budget && (
                                                <span className="block">💰 {strategy.budget}</span>
                                              )}
                                              {strategy.investment && (
                                                <span className="block">⚡ {strategy.investment}</span>
                                              )}
                                              <span className="block">Шагов: {strategy.steps.length}</span>
                                            </div>
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
                                                    {step.number}
                                                  </span>
                                                  <span className="min-w-0 flex-1">
                                                    <span className="block text-sm text-zinc-700 dark:text-zinc-200">
                                                      {step.title}
                                                    </span>
                                                    {step.duration && (
                                                      <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
                                                        {step.duration}
                                                      </span>
                                                    )}
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
                                           {expandedStrategy?.ideaIndex === item.idea_index && expandedStrategy?.strategyIndex === strategy.strategy_index && (
                                             <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 md:col-span-2 dark:border-zinc-800 dark:bg-zinc-900">
                                              <button
                                                type="button"
                                                onClick={() => setExpandedStrategy(null)}
                                                className="mb-3 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                                              >
                                                Скрыть детали ↑
                                              </button>
                                              <div className="space-y-4 text-sm">
                                                <div>
                                                  <h5 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Подход</h5>
                                                  <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{strategy.approach}</p>
                                                </div>
                                                {strategy.resources && strategy.resources.length > 0 && (
                                                  <div>
                                                    <h5 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Ресурсы</h5>
                                                    <div className="space-y-2">
                                                      {strategy.resources.map((res, idx) => (
                                                        <div key={idx} className="rounded bg-white p-3 dark:bg-zinc-800">
                                                          <p className="font-medium text-zinc-900 dark:text-zinc-100">{res.category}</p>
                                                          <ul className="mt-1 list-disc list-inside text-zinc-700 dark:text-zinc-300">
                                                            {res.items.map((item, i) => (
                                                              <li key={i}>{item}</li>
                                                            ))}
                                                          </ul>
                                                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{res.rationale}</p>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                                {strategy.support && strategy.support.length > 0 && (
                                                  <div>
                                                    <h5 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Поддержка</h5>
                                                    <div className="space-y-2">
                                                      {strategy.support.map((sup, idx) => (
                                                        <div key={idx} className="rounded bg-white p-3 dark:bg-zinc-800">
                                                          <p className="font-medium text-zinc-900 dark:text-zinc-100">{sup.who} {sup.needed ? " (нужен на старте)" : ""}</p>
                                                          <p className="mt-1 text-zinc-700 dark:text-zinc-300">{sup.description}</p>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}
                                                {strategy.time_to_launch && (
                                                  <div>
                                                    <h5 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Время до запуска</h5>
                                                    <div className="space-y-1 text-zinc-700 dark:text-zinc-300">
                                                      <p>До первого шага: {strategy.time_to_launch.days_to_first_step} дн.</p>
                                                      <p>До результата этапа: {strategy.time_to_launch.days_to_result} дн.</p>
                                                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{strategy.time_to_launch.note}</p>
                                                    </div>
                                                  </div>
                                                )}
                                                {strategy.timeline && (
                                                  <div>
                                                    <h5 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Временная шкала</h5>
                                                    <p className="text-zinc-700 dark:text-zinc-300">{strategy.timeline}</p>
                                                  </div>
                                                )}
                                                {strategy.budget && (
                                                  <div>
                                                    <h5 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Бюджет</h5>
                                                    <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{strategy.budget}</p>
                                                  </div>
                                                )}
                                                {strategy.investment && (
                                                  <div>
                                                    <h5 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Вложения (нематериальные)</h5>
                                                    <p className="text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">{strategy.investment}</p>
                                                  </div>
                                                )}
                                                {strategy.avoid && strategy.avoid.length > 0 && (
                                                  <div>
                                                    <h5 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Чего избегать</h5>
                                                    <ul className="list-disc list-inside space-y-1 text-zinc-700 dark:text-zinc-300">
                                                      {strategy.avoid.map((av, idx) => (
                                                        <li key={idx}><span className="font-medium">{av.rule}</span> — {av.reason}</li>
                                                      ))}
                                                    </ul>
                                                  </div>
                                                )}
                                                {strategy.assumptions && strategy.assumptions.length > 0 && (
                                                  <div>
                                                    <h5 className="font-medium text-zinc-900 dark:text-zinc-100 mb-2">Допущения</h5>
                                                    <ul className="list-disc list-inside space-y-1 text-zinc-700 dark:text-zinc-300">
                                                      {strategy.assumptions.map((as, idx) => (
                                                        <li key={idx}>{as}</li>
                                                      ))}
                                                    </ul>
                                                  </div>
                                                )}
                                               </div>
                                             </div>
                                           )}
                                           </>
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
                                planLoading || Object.keys(selected).length === 0
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
