"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadPlannerGoals, deleteGoal } from "./actions";
import type { PlannerGoalSummary } from "@/lib/types";

function TrashIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  );
}

export default function PlannerPage() {
  const router = useRouter();
  const [clientUuid] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem("client_uuid")
  );
  const [goals, setGoals] = useState<PlannerGoalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!clientUuid) {
      router.push("/");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await loadPlannerGoals(clientUuid);
        if (!cancelled) setGoals(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Ошибка загрузки целей");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientUuid, router]);

  async function handleDeleteClick(goalId: string) {
    setDeletingGoalId(goalId);
    // Check for started steps by calling deleteGoal which returns warning
    // We'll do a quick check first
    setDeleteConfirmOpen(true);
  }

  async function handleConfirmDelete() {
    if (!clientUuid || !deletingGoalId) return;
    
    setError(null);
    try {
      const result = await deleteGoal(clientUuid, deletingGoalId);
      if (result.success) {
        // Remove goal from local state
        setGoals((prev) => prev.filter((g) => g.id !== deletingGoalId));
      }
      if (result.warning) {
        setDeleteWarning(result.warning);
        // Show warning briefly then close
        setTimeout(() => {
          setDeleteWarning(null);
        }, 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления");
    } finally {
      setDeleteConfirmOpen(false);
      setDeletingGoalId(null);
    }
  }

  function handleCancelDelete() {
    setDeleteConfirmOpen(false);
    setDeletingGoalId(null);
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-1 flex-col items-center px-6 py-16 dark:bg-black">
        <div className="w-full space-y-6">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Планировщик моих целей</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {loading
                ? "Загружаю цели..."
                : goals.length === 0
                  ? "Пока нет ни одной цели. Сначала пройди интервью или сформулируй свою идею."
                  : `Выбери цель, чтобы открыть её этапы и шаги`}
            </p>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="space-y-4">
            {goals.map((goal) => (
              <div
                key={goal.id}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-5 transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-white"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => router.push(`/planner/goal?id=${encodeURIComponent(goal.id)}`)}
                    className="flex-1 text-left text-sm font-semibold text-black dark:text-zinc-50"
                  >
                    {goal.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteClick(goal.id, goal.title)}
                    disabled={loading}
                    className="shrink-0 rounded-md p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 dark:text-zinc-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Удалить цель"
                  >
                    <TrashIcon />
                  </button>
                </div>

                {goal.description && (
                  <p className="mb-3 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{goal.description}</p>
                )}

                {goal.strategy_title && (
                  <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">Стратегия: {goal.strategy_title}</p>
                )}

                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-zinc-900 transition-all dark:bg-zinc-100"
                    style={{ width: `${goal.progress_percent}%` }}
                  />
                </div>

                <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Прогресс: {goal.progress_percent}% · этапов: {goal.stages_count} · шагов:{" "}
                  {goal.finished_steps_count}/{goal.steps_count}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => (window.location.href = "/")}
              className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
            >
              На главную
            </button>
          </div>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && deletingGoalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50 mb-4">Удалить цель?</h2>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-4">
              Эта цель будет удалена вместе со всеми этапами и шагами. Это действие нельзя отменить.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Warning Toast */}
      {deleteWarning && (
        <div className="fixed bottom-6 right-6 z-50 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 shadow-lg animate-in fade-in slide-in-from-bottom-2">
          {deleteWarning}
        </div>
      )}
    </div>
  );
}
