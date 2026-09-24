"use client";

import { useState, useEffect } from "react";

type PageState = "welcome" | "check" | "menu";

export default function Home() {
  const [pageState, setPageState] = useState<PageState>("check");
  const [hasCompleted, setHasCompleted] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const clientUuid = document.cookie
      .split("; ")
      .find((row) => row.startsWith("client_uuid="))
      ?.split("=")[1];
    const name = document.cookie
      .split("; ")
      .find((row) => row.startsWith("display_name="))
      ?.split("=")[1];

    if (!clientUuid || !name) {
      setPageState("welcome");
      setLoading(false);
      return;
    }

    localStorage.setItem("client_uuid", clientUuid);
    localStorage.setItem("display_name", name);
    setDisplayName(name);

    (async () => {
      try {
        const sessionsRes = await fetch(`/api/interview/has-completed?client_uuid=${clientUuid}`);
        const sessionsData = await sessionsRes.json();
        setHasCompleted(sessionsData.completed);
      } catch (err) {
        console.error("Failed to load data:", err);
      } finally {
        setLoading(false);
        setPageState("menu");
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-md flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Загружаю...</p>
        </main>
      </div>
    );
  }

  if (pageState === "welcome") {
    window.location.href = "/welcome";
    return null;
  }

  if (pageState === "menu") {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-md flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <div className="w-full space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
                {displayName ? `${displayName}. ` : ""}Расскажи, что привело тебя сюда сегодня
              </h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Выбери, что ближе, или опиши своими словами
              </p>
            </div>

            <div className="space-y-3">
              {hasCompleted ? (
                <>
                  {/* <button
                    onClick={() => (window.location.href = "/last-session")}
                    className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                  >
                    <span className="block text-base font-semibold">Моя последняя сессия</span>
                    <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Продолжить разговор, подвести промежуточные итоги
                    </span>
                  </button>

                  <button
                    onClick={() => (window.location.href = "/goals")}
                    className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                  >
                    <span className="block text-base font-semibold">Хочу поработать с одной из моих целей</span>
                    <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Посмотреть список целей, добавить новую или обсудить прогресс
                    </span>
                  </button> */}

                  <button
                    onClick={() => (window.location.href = "/results")}
                    className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                  >
                    <span className="block text-base font-semibold">Все идеи из моего интервью</span>
                    <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Мнение ИИ - какое дело/проект могли бы стать моим настоящим призванием
                    </span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => (window.location.href = "/interview")}
                  className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                >
                  <span className="block text-base font-semibold">Пройти интервью</span>
                  <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Начать или продолжить интервью — ИИ найдёт твоё призвание
                  </span>
                </button>
              )}

              <button
                onClick={() => (window.location.href = "/problem")}
                className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
              >
                <span className="block text-base font-semibold">У меня есть конкретная проблема</span>
                <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  В жизни или в текущем проекте, хочу разобраться и найти решение
                </span>
              </button>

              <button
                onClick={() => (window.location.href = "/domain-screening")}
                className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
              >
                <span className="block text-base font-semibold">Хочу проверить и наладить области жизни</span>
                <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Отношения, деньги, здоровье, самореализация и т.д.
                </span>
              </button>

              {/* {hasCompleted && (
                <button
                  onClick={() => (window.location.href = "/results")}
                  className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                >
                  Посмотреть ответы
                </button>
              )} */}
            </div>
          </div>
        </main>
      </div>
    );
  }

  return null;
}