"use client";

import { useState, useEffect } from "react";
import { loadUserGoals } from "../interview/actions";
import type { GoalRow } from "@/lib/types";

export default function GoalsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [goals, setGoals] = useState<GoalRow[]>([]);

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) {
      window.location.href = "/";
      return;
    }

    (async () => {
      try {
        const data = await loadUserGoals(clientUuid);
        setGoals(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки целей");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Загружаю цели...</p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button
            onClick={() => (window.location.href = "/")}
            className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            На главную
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col items-center py-16 px-6 bg-white dark:bg-black">
        <div className="w-full space-y-6">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Мои цели</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {goals.length === 0
                ? "Пока нет выбранных целей. Пройди интервью и выбери идеи, которые хочешь превратить в цели."
                : `У тебя ${goals.length} ${goals.length === 1 ? "цель" : goals.length < 5 ? "цели" : "целей"}`}
            </p>
          </div>

          <div className="space-y-4">
            {goals.map((goal) => (
              <div
                key={goal.id}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="text-sm font-semibold text-black dark:text-zinc-50 mb-2">
                  {goal.title}
                </div>
                {goal.smart_json?.description && (
                  <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap mb-3">
                    {goal.smart_json.description}
                  </p>
                )}
                {goal.smart_json?.tags && Array.isArray(goal.smart_json.tags) && (
                  <div className="flex flex-wrap gap-2">
                    {goal.smart_json.tags.map((tag: string) => (
                      <span
                        key={tag}
                        className="rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                  Статус: {goal.status === "active" ? "Активная" : goal.status || "Неизвестно"}
                  {goal.horizon && ` · Горизонт: ${goal.horizon}`}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => (window.location.href = "/")}
              className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
            >
              На главную
            </button>
            <button
              onClick={() => (window.location.href = "/interview")}
              className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
            >
              Пройти интервью заново
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
