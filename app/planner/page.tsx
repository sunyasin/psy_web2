"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadPlannerGoals } from "./actions";
import type { PlannerGoalSummary } from "@/lib/types";

const goalStatusLabels: Record<string, string> = {
  active: "Активная",
  paused: "Приостановлена",
  achieved: "Достигнута",
  abandoned: "Отложена",
};

export default function PlannerPage() {
  const router = useRouter();
  const [clientUuid] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem("client_uuid")
  );
  const [goals, setGoals] = useState<PlannerGoalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
              <button
                key={goal.id}
                type="button"
                onClick={() => router.push(`/planner/goal?id=${encodeURIComponent(goal.id)}`)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-left transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-white"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <span className="text-sm font-semibold text-black dark:text-zinc-50">{goal.title}</span>
                  <span className="shrink-0 rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                    {goalStatusLabels[goal.status || "active"] || goal.status || "Активная"}
                  </span>
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
              </button>
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
    </div>
  );
}
