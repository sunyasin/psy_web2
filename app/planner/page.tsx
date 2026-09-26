"use client";

import { useEffect, useState } from "react";

type PlannerStep = {
  id: string;
  title: string;
  description: string | null;
  status: "planned" | "in_progress" | "finished" | "canceled" | "deleted";
  notes: string | null;
  result: string | null;
  planned_days: number | null;
  model_comments: string | null;
  order_index: number;
};

type PlannerStage = {
  id: string;
  goal_id: string;
  title: string;
  description: string | null;
  status: "planned" | "in_progress" | "finished" | "canceled" | "deleted";
  result: string | null;
  planned_days: number | null;
  steps: PlannerStep[];
};

const statusLabels: Record<string, string> = {
  planned: "Запланирован",
  in_progress: "В работе",
  finished: "Завершён",
  canceled: "Отменён",
  deleted: "Удалён",
};

export default function PlannerPage() {
  const [clientUuid] = useState<string | null>(() => typeof window === "undefined" ? null : localStorage.getItem("client_uuid"));
  const [stages, setStages] = useState<PlannerStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientUuid) {
      queueMicrotask(() => {
        setError("Сессия не найдена. Вернитесь на главную.");
        setLoading(false);
      });
      return;
    }
    fetch(`/api/short-analysis/plan?client_uuid=${encodeURIComponent(clientUuid)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Не удалось загрузить планировщик");
        setStages(payload.stages || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Не удалось загрузить планировщик"))
      .finally(() => setLoading(false));
  }, [clientUuid]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-600 dark:bg-black dark:text-zinc-400">Загружаю планировщик...</main>;

  return (
    <div className="min-h-screen bg-zinc-50 px-6 py-10 font-sans dark:bg-black">
      <main className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Планировщик</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">Цели, этапы и шаги</h1>
          </div>
          <button type="button" onClick={() => (window.location.href = "/")} className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-black hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white">На главную</button>
        </div>
        {error && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">{error}</p>}
        {stages.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">В планировщике пока нет этапов.</p>
            <a href="/short-analysis" className="mt-4 inline-block rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">Перейти к анализу</a>
          </div>
        ) : stages.map((stage) => (
          <section key={stage.id} className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-black dark:text-zinc-50">{stage.title}</h2>
                {stage.description && <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{stage.description}</p>}
              </div>
              <span className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">{statusLabels[stage.status] || stage.status}</span>
            </div>
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">План: {stage.planned_days || "—"} дней</p>
            {stage.result && <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-200">Результат: {stage.result}</p>}
            <div className="mt-4 space-y-2">
              {stage.steps.map((step) => (
                <div key={step.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{step.title}</p>
                      {step.description && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{step.description}</p>}
                    </div>
                    <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">{statusLabels[step.status] || step.status}</span>
                  </div>
                  {step.result && <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">Результат: {step.result}</p>}
                  {step.notes && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">Заметки: {step.notes}</p>}
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
