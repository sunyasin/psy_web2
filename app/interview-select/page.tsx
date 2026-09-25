"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function InterviewSelectPage() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullCompleted, setFullCompleted] = useState(false);
  const [shortCompleted, setShortCompleted] = useState(false);
  const [fullInProgress, setFullInProgress] = useState(false);
  const [shortInProgress, setShortInProgress] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<"both" | "single">("single");
  const [completedInterviewCode, setCompletedInterviewCode] = useState<"default" | "short" | null>(null);

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");
    const name = localStorage.getItem("display_name");

    if (!clientUuid) {
      window.location.href = "/";
      return;
    }

    setDisplayName(name);

    (async () => {
      try {
        const [fullRes, shortRes] = await Promise.all([
          fetch(`/api/interview/has-completed?client_uuid=${clientUuid}&interview_code=default`),
          fetch(`/api/interview/has-completed?client_uuid=${clientUuid}&interview_code=short`),
        ]);

        const fullData = await fullRes.json();
        const shortData = await shortRes.json();

        setFullCompleted(fullData.completed || false);
        setShortCompleted(shortData.completed || false);
        setFullInProgress(fullData.in_progress || false);
        setShortInProgress(shortData.in_progress || false);
      } catch (err) {
        console.error("Failed to load interview status:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function goHome() {
    window.location.href = "/";
  }

  function handleInterviewClick(interviewCode: "default" | "short") {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    const isFull = interviewCode === "default";
    const isCompleted = isFull ? fullCompleted : shortCompleted;
    const otherCompleted = isFull ? shortCompleted : fullCompleted;

    if (isCompleted) {
      // Show modal
      setCompletedInterviewCode(interviewCode);
      if (fullCompleted && shortCompleted) {
        setModalType("both");
      } else {
        setModalType("single");
      }
      setShowModal(true);
    } else if (isFull ? fullInProgress : shortInProgress) {
      // Resume in-progress interview
      localStorage.setItem("selected_interview_code", interviewCode);
      window.location.href = "/interview";
    } else {
      // Start new interview
      startInterview(interviewCode);
    }
  }

  function handleAnalyzeAll() {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    // If both completed, start analysis directly
    if (fullCompleted && shortCompleted) {
      localStorage.setItem("analyze_all_interviews", "true");
      window.location.href = `/analysis?client_uuid=${clientUuid}`;
    } else if (fullCompleted || shortCompleted) {
      // Only one completed - show modal
      setShowModal(true);
      if (fullCompleted && shortCompleted) {
        setModalType("both");
      } else {
        setModalType("single");
      }
    }
  }

  function startInterview(interviewCode: string) {
    localStorage.setItem("selected_interview_code", interviewCode);
    window.location.href = "/interview";
  }

  function handleAnalyze() {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;
    // Store that both interviews should be analyzed
    localStorage.setItem("analyze_all_interviews", "true");
    window.location.href = `/analysis?client_uuid=${clientUuid}`;
  }

  function handleStartSecond() {
    if (!completedInterviewCode) return;
    const otherCode = completedInterviewCode === "default" ? "short" : "default";
    localStorage.setItem("selected_interview_code", otherCode);
    window.location.href = "/interview";
  }

  function closeModal() {
    setShowModal(false);
    setCompletedInterviewCode(null);
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-md flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Загружаю...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-md flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
        <div className="w-full space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
              {displayName ? `${displayName}. ` : ""}Выбери формат интервью
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Чтобы советы ИИ-модели были наиболее точными для Вашей ситуации, далее рекомендуется пройти основное интервью о Вашей биографии из 6 блоков и 70 вопросов. Вы также можете пройти сокращенное интервью с вопросами о Вашей желаемой точке Б, текущем положении, ресурсах и ограничениях.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => handleInterviewClick("default")}
              className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
            >
              <div className="flex items-center justify-between">
                <span className="block text-base font-semibold">Полное интервью (6 блоков, 70 вопросов)</span>
                {fullCompleted && (
                  <svg className="h-5 w-5 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                {fullInProgress && !fullCompleted && (
                  <span className="text-xs text-blue-600 dark:text-blue-400">в процессе</span>
                )}
              </div>
              <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Глубокое исследование биографии, экспертизы, проблем и проверки
              </span>
            </button>

            <button
              onClick={() => handleInterviewClick("short")}
              className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
            >
              <div className="flex items-center justify-between">
                <span className="block text-base font-semibold">Сокращённое интервью (4 вопроса)</span>
                {shortCompleted && (
                  <svg className="h-5 w-5 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                {shortInProgress && !shortCompleted && (
                  <span className="text-xs text-blue-600 dark:text-blue-400">в процессе</span>
                )}
              </div>
              <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Точка Б, текущее положение, ресурсы, ограничения
              </span>
            </button>

            <button
              onClick={handleAnalyzeAll}
              disabled={!fullCompleted && !shortCompleted}
              className="w-full rounded-md bg-black px-4 py-4 text-left text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              <span className="block text-base font-semibold">Анализировать результаты интервью</span>
              <span className="block mt-1 text-xs text-zinc-300 dark:text-zinc-500">
                Максимально точный анализ ИИ для вашей стратегии
              </span>
            </button>
          </div>

          <button
            onClick={goHome}
            className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
          >
            На главную
          </button>
        </div>
      </main>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50 mb-4 text-center">
              Интервью пройдено
            </h2>
            {modalType === "both" ? (
              <div className="space-y-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center">
                  Оба интервью пройдены. Перейти к анализу?
                </p>
                <button
                  onClick={handleAnalyze}
                  className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  Анализ
                </button>
                <button
                  onClick={closeModal}
                  className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                >
                  Закрыть
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400 text-center">
                  Интервью пройдено. Вы можете пройти второе или перейти к анализу.
                </p>
                <button
                  onClick={handleStartSecond}
                  className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  Пройду второе
                </button>
                <button
                  onClick={handleAnalyze}
                  className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                >
                  Анализ
                </button>
                <button
                  onClick={closeModal}
                  className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                >
                  Закрыть
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}