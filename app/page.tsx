"use client";

import { useState, useEffect } from "react";
import { LoginForm } from "@/components/LoginForm";

type PageState = "check" | "menu";

export default function Home() {
  const [pageState, setPageState] = useState<PageState>("check");
  const [hasCompleted, setHasCompleted] = useState(false);
  const [welcomeCompleted, setWelcomeCompleted] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [isPaid, setIsPaid] = useState(false);
  const [loading, setLoading] = useState(true);

  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showSubscriptionInfo, setShowSubscriptionInfo] = useState(false);

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
      window.location.replace("/welcome");
      return;
    }

    localStorage.setItem("client_uuid", clientUuid);
    localStorage.setItem("display_name", name);
    setDisplayName(name);

    (async () => {
      try {
        const [sessionsRes, welcomeRes, subscriptionRes] = await Promise.all([
          fetch(`/api/interview/has-completed?client_uuid=${clientUuid}`),
          fetch(`/api/interview/has-completed?client_uuid=${clientUuid}&interview_code=welcome`),
          fetch(`/api/subscriptions/status?client_uuid=${clientUuid}`),
        ]);
        const sessionsData = await sessionsRes.json();
        const welcomeData = await welcomeRes.json();
        setHasCompleted(sessionsData.completed);
        setWelcomeCompleted(welcomeData.completed);

        // Разбор раздела про вопрос доступен только по оплаченной подписке.
        // При ошибке или отсутствии ответа считаем, что подписки нет.
        const subscriptionData = subscriptionRes.ok ? await subscriptionRes.json() : null;
        setIsPaid(Boolean(subscriptionData?.isPaid));
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

  if (pageState === "menu") {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-md flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <div className="w-full space-y-6">
            <div className="flex items-start gap-3">
              <div className="flex-1 text-center">
                <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
                  Привет {displayName ? `, ${displayName}` : ""} ! Что хочешь попробовать сегодня?
                </h1>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLoginForm((v) => !v)}
                aria-label="Login"
                title="Login"
                className="shrink-0 rounded-md border border-zinc-200 bg-white p-2 text-zinc-700 transition-colors hover:border-black hover:text-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-white dark:hover:text-white"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <path d="M10 17l5-5-5-5" />
                  <path d="M15 12H3" />
                </svg>
              </button>
            </div>

            {showLoginForm && (
              <LoginForm
                autoFocus
                onCancel={() => setShowLoginForm(false)}
                className="rounded-md border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
              />
            )}

            <div className="space-y-3">
        {/* Welcome Interview Button - FIRST, hidden after completion */}
        {!welcomeCompleted && (
          <button
            onClick={() => (window.location.href = "/welcome-interview")}
            className="w-full rounded-md bg-zinc-900 px-4 py-4 text-left text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            <span className="flex items-center gap-2">
              <span className="text-base font-semibold">Входное интервью</span>
            </span>
            <span className="mt-1 block text-xs text-zinc-300 dark:text-zinc-500">
              5 вопросов, чтобы понять твою ситуацию. Остальные разделы откроются после прохождения.
            </span>
          </button>
        )}

        {/* All other buttons - disabled until welcome interview completed */}
        <button
          onClick={welcomeCompleted ? () => (window.location.href = "/planner") : undefined}
          disabled={!welcomeCompleted}
          className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="block text-base font-semibold">Планировщик моих целей</span>
          <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Этапы и шаги по каждой цели, статусы и прогресс
          </span>
        </button>

        {hasCompleted ? (
          <>
            <button
              onClick={welcomeCompleted ? () => (window.location.href = "/results") : undefined}
              disabled={!welcomeCompleted}
              className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="block text-base font-semibold">Все идеи из моего интервью</span>
              <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Мнение ИИ - какое дело/проект могли бы стать моим настоящим призванием
              </span>
            </button>
          </>
        ) : (
          <button
            onClick={welcomeCompleted ? () => (window.location.href = "/interview") : undefined}
            disabled={!welcomeCompleted}
            className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="block text-base font-semibold">Интервью. Анализ. Цели. Брейншторм</span>
            <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              ИИ поможет найти призвание по биографии и предпочтениям личности
            </span>
          </button>
        )}

        {/* Разбор вопроса — только по оплаченной подписке */}
        {isPaid && (
          <button
            onClick={welcomeCompleted ? () => (window.location.href = "/problem") : undefined}
            disabled={!welcomeCompleted}
            className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="block text-base font-semibold">есть вопрос, хочу разобраться в ...</span>
            <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              В жизненной ситуации или в текущем проекте, хочу пообщаться и найти решение
            </span>
          </button>
        )}

        <button
          onClick={welcomeCompleted ? () => (window.location.href = "/interview-select") : undefined}
          disabled={!welcomeCompleted}
          className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span className="block text-base font-semibold">У меня есть своя идея/цель, мне нужна стратегия и тактика её достижения</span>
          <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Пройди интервью для точного анализа ИИ и получи стратегию достижения
          </span>
        </button>

        <div className="mt-6 w-full">
          <button
            type="button"
            onClick={() => setShowSubscriptionInfo((v) => !v)}
            className="w-full rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
            aria-expanded={showSubscriptionInfo}
          >
            <span className="flex items-center justify-between gap-2">
              <span>Больше возможностей при оформлении подписки</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${showSubscriptionInfo ? "rotate-180" : ""}`}
                aria-hidden="true"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          </button>
          {showSubscriptionInfo && (
            <div className="mt-3 rounded-md border border-zinc-200 bg-white p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 space-y-4">
              <p className="font-medium">Оформите подписку, чтобы:</p>
              <ol className="space-y-3 pl-4 list-decimal">
                <li className="space-y-1">
                  <span>поддержать развитие проекта и</span>
                </li>
                <li className="space-y-1">
                  <span>оплачивать ваши запросы к последним версиям моделей искусственного интеллекта (Antropic Claude Opus, Sonet) с продвинутыми способностями к размышлению и ведению качественных диалогов.</span>
                </li>
                <li className="space-y-1">
                  <span className="font-medium">Основное интервью.</span> В бесплатной версии Основное интервью выдаст две идеи без ранжирования по весам и критериям, взятым из вашего интервью. В платной версии вы получите от 2 до 5 идей, с упором на разные критерии (стратегии), наиболее подходящие вашей ситуации, личности и комбинации способностей.
                </li>
                <li className="space-y-1">
                  <span className="font-medium">После короткого интервью для одной цели/идеи и общего интервью вы получаете список идей.</span> Каждую идею можно разложить в подробный план. В бесплатной версии план генерируется в один-два этапа с одной наиболее подходящей стратегией (по мнению ИИ), которая включает в себя все шаги достижения цели. В платной версии вы получите на каждую цель несколько обоснованных этапов, 2 стратегии реализации каждого этапа (можно выбрать одну стратегию) с раскладкой по шагам, анализу помощников, конкурентов, участников, необходимым ресурсам, бюджету, средствам достижения и т.д.
                </li>
                <li className="space-y-1">
                  <span className="font-medium">На платной версии вам становятся доступны такие инструменты и функции:</span>
                  <ul className="mt-2 space-y-1 pl-4 list-[lower-alpha]">
                    <li>Брейншторм чат с моделью.</li>
                    <li>анализ саботажа и рекомендации по преодолению</li>
                    <li>Обсуждение в чате отдельной трудности, проблемы. ИИ выступает как консультант по когнитивно-поведенческой терапии</li>
                    <li>фишки и секреты из методик по постановке и достижения целей с платных обучающих программ от известных русских долларовых миллионеров, поднявшихся с нуля, упавших и поднявшихся снова. (раздел пока в разработке)</li>
                  </ul>
                </li>
              </ol>
              <p className="mt-4 text-center">
                <a
                  href="/tariffs"
                  className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  Оформить подписку сейчас
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
          </div>
        </main>
      </div>
    );
  }

  return null;
}
