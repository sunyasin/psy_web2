"use client";

import { useState, useEffect } from "react";
import { saveSelectedIdeasAsGoals, loadUserGoals } from "../interview/actions";
import type { Idea, SelectedIdea, GoalRow } from "@/lib/types";

export default function AnalysisPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [answerCount, setAnswerCount] = useState(0);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clientUuid = params.get("client_uuid");
    const analyzeAll = localStorage.getItem("analyze_all_interviews") === "true";

    if (!clientUuid) {
      window.location.href = "/";
      return;
    }

    (async () => {
      try {
        const cached = localStorage.getItem("interview_analysis");
        if (cached) {
          try {
            const data = JSON.parse(cached);
            const ideas = Array.isArray(data.ideas) ? data.ideas : [];
            setIdeas(ideas);
            setAnswerCount(typeof data.answerCount === "number" ? data.answerCount : ideas.length);
            setAnalysisId(data.analysisId || null);
          } catch (parseError) {
            console.error("Failed to parse cached analysis:", parseError);
          }
          localStorage.removeItem("interview_analysis");
          if (analyzeAll) {
            localStorage.removeItem("analyze_all_interviews");
          }
          setLoading(false);
          return;
        }

        const apiEndpoint = analyzeAll ? "/api/analysis/all-interviews" : "/api/analysis/ideas";
        const res = await fetch(`${apiEndpoint}?client_uuid=${clientUuid}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Не удалось получить идеи");
        }
        const data = await res.json();
        const ideas = Array.isArray(data.ideas) ? data.ideas : [];
        setIdeas(ideas);
        setAnswerCount(typeof data.answerCount === "number" ? data.answerCount : ideas.length);
        if (data.analysis_id) {
          setAnalysisId(data.analysis_id);
        }
        if (analyzeAll) {
          localStorage.removeItem("analyze_all_interviews");
        }
      } catch (err) {
        console.error("Analysis error:", err);
        setError(err instanceof Error ? err.message : "Ошибка анализа");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleIdea = (idx: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(String(idx))) {
        next.delete(String(idx));
      } else {
        next.add(String(idx));
      }
      return next;
    });
  };

  const handleSaveGoals = async () => {
    if (!analysisId || selectedIds.size === 0) return;
    
    const clientUuid = new URLSearchParams(window.location.search).get("client_uuid");
    if (!clientUuid) return;

    setSaving(true);
    try {
      const selectedIdeas: SelectedIdea[] = Array.from(selectedIds)
        .map((idx) => ideas[Number(idx)])
        .filter(Boolean)
        .map((idea) => ({
          analysisId,
          title: idea.title,
          description: idea.description,
          tags: idea.tags,
        }));

      await saveSelectedIdeasAsGoals(clientUuid, analysisId, selectedIdeas);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения целей");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <div className="w-full space-y-4 text-center">
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Анализирую ответы...</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Ищу паттерны в твоей биографии и подбираю подходящие идеи.</p>
            <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-black dark:bg-white" />
            </div>
          </div>
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
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Подобрал идеи под твою биографию</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              На основе {answerCount} {answerCount === 1 ? "ответа" : "ответов"} интервью я выделил паттерны и подобрал направления, где твои опыт и интересы совпадают.
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Выбери одну или несколько идей, чтобы превратить их в цели для дальнейшей работы.
            </p>
          </div>

          <div className="space-y-4">
            {ideas.length === 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                Идеи не были сгенерированы. Попробуй перезапустить анализ или проверь, что ответы заполнены.
              </div>
            ) : (
              ideas.map((idea, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border p-5 transition-colors ${
                    selectedIds.has(String(idx))
                      ? "border-black dark:border-white"
                      : "border-zinc-200 dark:border-zinc-800"
                  } bg-zinc-50 dark:bg-zinc-900`}
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(String(idx))}
                      onChange={() => toggleIdea(idx)}
                      className="mt-1 h-4 w-4 rounded border-zinc-300 text-black focus:ring-black dark:border-zinc-700 dark:bg-zinc-900"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-black dark:text-zinc-50 mb-2">
                        {idx + 1}. {idea.title}
                      </div>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                        {idea.description}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {idea.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </label>
                </div>
              ))
            )}
          </div>

          {ideas.length > 0 && (
            <div className="flex gap-3">
              <button
                onClick={handleSaveGoals}
                disabled={saving || selectedIds.size === 0 || saved}
                className="flex-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {saving ? "Сохраняю..." : saved ? "Цели сохранены" : `Сохранить выбранные идеи как цели (${selectedIds.size})`}
              </button>
              <button
                onClick={() => (window.location.href = "/goals")}
                className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
              >
                Мои цели
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
