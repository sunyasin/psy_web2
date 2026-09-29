"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadPlannerStages, updatePlannerStep } from "../actions";
import { computeProgress } from "@/lib/plannerProgress";
import { extractShortResponse } from "@/lib/short-analysis";
import { hasStrategyDetails, StrategyDetails } from "@/components/strategy-details";
import type { NewStage, NewStrategy, PlannerStageWithSteps, PlannerStatus, PlannerStepRow } from "@/lib/types";

const statusLabels: Record<PlannerStatus, string> = {
  planned: "Запланирован",
  in_progress: "В работе",
  finished: "Завершён",
  canceled: "Отменён",
  deleted: "Удалён",
};

const editableStatuses: PlannerStatus[] = ["planned", "in_progress", "finished"];

const statusBadgeClasses: Record<PlannerStatus, string> = {
  planned: "border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300",
  in_progress: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
  finished: "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300",
  canceled: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  deleted: "border-zinc-200 bg-zinc-100 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
};

function isEditable(step: PlannerStepRow): boolean {
  return editableStatuses.includes(step.status);
}

/** Раскрывающийся блок с деталями выбранной стратегии из анализа модели. */
function AnalysisDetails({ strategy }: { strategy: NewStrategy }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Детали анализа
        </span>
        <span className="flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
          {expanded ? "Скрыть" : "Показать"}
          <svg
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01-.02-1.06z" />
          </svg>
        </span>
      </button>
      {expanded && (
        <div className="border-t border-zinc-200 p-4 dark:border-zinc-700">
          <StrategyDetails strategy={strategy} />
        </div>
      )}
    </div>
  );
}

function PlannerGoalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const goalId = searchParams.get("id") || "";

  const [clientUuid] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem("client_uuid")
  );
  const [stages, setStages] = useState<PlannerStageWithSteps[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeStep, setActiveStep] = useState<PlannerStepRow | null>(null);
  const [draftStatus, setDraftStatus] = useState<PlannerStatus>("planned");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftProgress, setDraftProgress] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Детали стратегии из анализа модели: ключ этапа планировщика.
  const [strategyDetails, setStrategyDetails] = useState<Record<string, NewStrategy | null>>({});
  const analysisCache = useRef<Map<string, NewStage[]>>(new Map());
  const requestedAnalyses = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!clientUuid) {
      router.push("/");
    }
  }, [clientUuid, router]);

  useEffect(() => {
    if (!clientUuid || !goalId) return;

    let cancelled = false;
    (async () => {
      try {
        const data = await loadPlannerStages(clientUuid, goalId);
        if (!cancelled) setStages(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Не удалось загрузить этапы");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientUuid, goalId]);

  // Подтягиваем ответ модели для анализа, из которого собраны этапы,
  // и находим в нём именно ту стратегию, что выбрана для этапа.
  useEffect(() => {
    if (!clientUuid || stages.length === 0) return;

    let cancelled = false;
    const pending = stages.filter(
      (stage) => stage.analysis_id && !(stage.id in strategyDetails)
    );
    if (pending.length === 0) return;

    (async () => {
      const resolved: Record<string, NewStrategy | null> = {};
      for (const stage of pending) {
        const analysisId = stage.analysis_id as string;
        let parsedStages = analysisCache.current.get(analysisId);
        if (!parsedStages) {
          if (requestedAnalyses.current.has(analysisId)) continue;
          requestedAnalyses.current.add(analysisId);
          try {
            const response = await fetch(
              `/api/analysis/get?id=${encodeURIComponent(analysisId)}&client_uuid=${encodeURIComponent(clientUuid)}`
            );
            if (!response.ok) throw new Error("Анализ не найден");
            const payload = await response.json();
            const parsed = extractShortResponse(payload.analysis?.model_json);
            parsedStages = parsed ? parsed.stages : [];
            analysisCache.current.set(analysisId, parsedStages);
          } catch (err) {
            console.error("[planner/goal] не удалось загрузить анализ:", err);
            analysisCache.current.set(analysisId, []);
            parsedStages = [];
          }
        }
        // Сначала ищем стратегию в её этапе, иначе — по названию в любом этапе анализа.
        const inSameStage = parsedStages[stage.idea_index ?? 0]?.strategies
          .find((item) => item.name === stage.strategy_title);
        const anywhere = parsedStages
          .flatMap((item) => item.strategies)
          .find((item) => item.name === stage.strategy_title);
        resolved[stage.id] = inSameStage ?? anywhere ?? null;
      }
      if (!cancelled && Object.keys(resolved).length > 0) {
        setStrategyDetails((prev) => ({ ...prev, ...resolved }));
      }
    })();

    return () => {
      cancelled = true;
    };
    // strategyDetails в зависимостях не нужен: он только защита от повторных запросов,
    // а фактический триггер — список этапов.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientUuid, stages]);

  useEffect(() => {
    if (!activeStep) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setActiveStep(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeStep, saving]);

  const openStep = (step: PlannerStepRow) => {
    setActiveStep(step);
    setDraftStatus(step.status);
    setDraftNotes(step.notes || "");
    setDraftProgress(step.progress_percent ?? 0);
    setSaveError(null);
  };

  const handleStatusChange = (status: PlannerStatus) => {
    setDraftStatus(status);
    if (status === "finished") {
      setDraftProgress(100);
    }
  };

  const handleProgressChange = (value: number) => {
    setDraftProgress(value);
    if (draftStatus === "planned" && value > 0) {
      setDraftStatus("in_progress");
    }
  };

  const saveStep = async () => {
    if (!clientUuid || !activeStep) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updatePlannerStep(clientUuid, activeStep.id, {
        status: draftStatus,
        notes: draftNotes,
        progress_percent: draftProgress,
      });
      setStages((prev) =>
        prev.map((stage) => ({
          ...stage,
          steps: stage.steps.map((step) => (step.id === updated.id ? updated : step)),
        }))
      );
      setActiveStep(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Не удалось сохранить шаг");
    } finally {
      setSaving(false);
    }
  };

  const displayError = error ?? (clientUuid && !goalId ? "Цель не указана" : null);
  const isLoading = loading && Boolean(clientUuid) && Boolean(goalId);

  // Общий прогресс цели — среднее по всем шагам всех этапов, тем же правилом,
  // что и в списке целей. Пересчитывается сразу после сохранения шага.
  const allSteps = useMemo(() => stages.flatMap((stage) => stage.steps), [stages]);
  const goalProgress = useMemo(() => computeProgress(allSteps), [allSteps]);
  const finishedStepsCount = useMemo(
    () => allSteps.filter((step) => step.status === "finished").length,
    [allSteps]
  );

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600 dark:bg-black dark:text-zinc-400">
        Загружаю этапы...
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-3xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Планировщик
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Этапы и шаги
            </h1>
          </div>
          <button
            type="button"
            onClick={() => router.push("/planner")}
            className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-black hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
          >
            К списку целей
          </button>
        </div>

        {displayError && (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {displayError}
          </p>
        )}

        {!displayError && stages.length === 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              По этой цели этапов пока нет. Выбери стратегию в анализе, чтобы собрать план.
            </p>
            <a
              href="/short-analysis"
              className="mt-4 inline-block rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
            >
              Перейти к анализу
            </a>
          </div>
        )}

        {!displayError && allSteps.length > 0 && (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Общий прогресс по цели</h2>
              <span className="text-2xl font-semibold tabular-nums text-black dark:text-zinc-50">
                {goalProgress}%
              </span>
            </div>

            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-zinc-900 transition-[width] dark:bg-zinc-100"
                style={{ width: `${goalProgress}%` }}
              />
            </div>

            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Завершено шагов: {finishedStepsCount} из {allSteps.length} · Этапов: {stages.length}
            </p>
          </section>
        )}

        {stages.map((stage) => (
          <section
            key={stage.id}
            className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-black dark:text-zinc-50">{stage.title}</h2>
                {stage.description && (
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    {stage.description}
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-1 text-xs ${statusBadgeClasses[stage.status]}`}
              >
                {statusLabels[stage.status] || stage.status}
              </span>
            </div>

            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950">
              <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Выбранная стратегия
              </p>
              <p className="mt-1 text-sm font-medium text-black dark:text-zinc-50">
                {stage.strategy_title || "Не выбрана"}
              </p>
            </div>

            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              План: {stage.planned_days || "—"} дней · Шагов: {stage.steps.length}
            </p>

            {strategyDetails[stage.id] && hasStrategyDetails(strategyDetails[stage.id] as NewStrategy) && (
              <AnalysisDetails strategy={strategyDetails[stage.id] as NewStrategy} />
            )}

            <div className="mt-4 space-y-2">
              {stage.steps.length === 0 && (
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Для выбранной стратегии шагов нет.
                </p>
              )}

              {stage.steps.map((step) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => openStep(step)}
                  className="w-full rounded-lg border border-zinc-200 p-3 text-left transition-colors hover:border-black dark:border-zinc-700 dark:hover:border-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                      {step.title}
                    </span>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${statusBadgeClasses[step.status]}`}
                    >
                      {statusLabels[step.status] || step.status}
                    </span>
                  </div>

                  {step.description && (
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{step.description}</p>
                  )}

                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100"
                      style={{ width: `${step.progress_percent ?? 0}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Прогресс: {step.progress_percent ?? 0}%
                  </p>
                </button>
              ))}
            </div>
          </section>
        ))}

        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => (window.location.href = "/")}
            className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
          >
            На главную
          </button>
        </div>
      </main>

      {activeStep && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => {
            if (!saving) setActiveStep(null);
          }}
        >
          <div
            className="w-full max-w-lg space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-base font-semibold text-black dark:text-zinc-50">{activeStep.title}</h3>
              <button
                type="button"
                onClick={() => setActiveStep(null)}
                disabled={saving}
                className="text-sm text-zinc-500 hover:text-black dark:text-zinc-400 dark:hover:text-white"
              >
                Закрыть
              </button>
            </div>

            {isEditable(activeStep) ? (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="step-status" className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Статус
                  </label>
                  <select
                    id="step-status"
                    value={draftStatus}
                    onChange={(event) => handleStatusChange(event.target.value as PlannerStatus)}
                    className="w-full rounded-lg border-2 border-zinc-200 bg-white px-3 py-2 text-sm text-black focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  >
                    {editableStatuses.map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                </div>

                {activeStep.description && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {activeStep.description}
                  </p>
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor="step-notes"
                    className="block text-xs font-medium text-zinc-600 dark:text-zinc-400"
                  >
                    Заметки
                  </label>
                  <textarea
                    id="step-notes"
                    value={draftNotes}
                    onChange={(event) => setDraftNotes(event.target.value)}
                    rows={4}
                    placeholder="Твои заметки по шагу"
                    className="w-full rounded-lg border-2 border-zinc-200 bg-white px-3 py-2 text-sm text-black focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="step-progress"
                    className="flex items-center justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400"
                  >
                    <span>Прогресс шага</span>
                    <span>{draftProgress}%</span>
                  </label>
                  <input
                    id="step-progress"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={draftProgress}
                    onChange={(event) => handleProgressChange(Number(event.target.value))}
                    className="w-full accent-zinc-900 dark:accent-zinc-100"
                  />
                </div>
              </>
            ) : (
              <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                Шаг в статусе «{statusLabels[activeStep.status]}» больше не редактируется.
              </p>
            )}

            {saveError && (
              <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {saveError}
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setActiveStep(null)}
                disabled={saving}
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
              >
                Отмена
              </button>
              {isEditable(activeStep) && (
                <button
                  type="button"
                  onClick={saveStep}
                  disabled={saving}
                  className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  {saving ? "Сохраняю..." : "Сохранить"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlannerGoalPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600 dark:bg-black dark:text-zinc-400">
          Загружаю этапы...
        </main>
      }
    >
      <PlannerGoalContent />
    </Suspense>
  );
}
