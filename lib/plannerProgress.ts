import type { PlannerStatus } from "./types";

/**
 * Правило расчёта прогресса, общее для списка целей (/planner) и страницы цели
 * (/planner/goal). Живёт в lib/, а не в app/planner/actions.ts, потому что actions.ts
 * помечен "use server" и не импортируется в клиентские компоненты.
 *
 * Завершённый шаг всегда считается за 100%, даже если progress_percent не дотянул:
 * статус «finished» — явное решение пользователя, ползунок мог остаться на 60.
 * Остальные шаги дают свой progress_percent, поэтому незавершённая работа видна.
 */
export function computeProgress(
  steps: Array<{ status: PlannerStatus; progress_percent: number | null }>
): number {
  if (steps.length === 0) return 0;
  const total = steps.reduce(
    (sum, step) =>
      sum +
      (step.status === "finished"
        ? 100
        : Math.min(100, Math.max(0, step.progress_percent ?? 0))),
    0
  );
  return Math.round(total / steps.length);
}
