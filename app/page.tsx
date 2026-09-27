"use client";

import { useState, useEffect } from "react";

type PageState = "welcome" | "check" | "menu";

export default function Home() {
  const [pageState, setPageState] = useState<PageState>("check");
  const [hasCompleted, setHasCompleted] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);

  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) return;

    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoginError(data.error || "Неверный логин или пароль");
        return;
      }

      document.cookie = `client_uuid=${data.client_uuid}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `display_name=${data.display_name || ""}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `access_token=${data.access_token || ""}; path=/; max-age=31536000; SameSite=Lax`;
      localStorage.setItem("client_uuid", data.client_uuid);
      localStorage.setItem("display_name", data.display_name || "");
      localStorage.setItem("access_token", data.access_token || "");
      setDisplayName(data.display_name || "");

      window.location.href = "/";
    } catch {
      setLoginError("Ошибка соединения");
    } finally {
      setLoginLoading(false);
    }
  };

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
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
                {displayName ? `${displayName}. ` : ""}Расскажи, что привело тебя сюда сегодня
              </h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Выбери, что ближе, или опиши своими словами
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => (window.location.href = "/planner")}
                className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
              >
                <span className="block text-base font-semibold">Планировщик моих целей</span>
                <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Этапы и шаги по каждой цели, статусы и прогресс
                </span>
              </button>

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
                  <span className="block text-base font-semibold">Интервью. Анализ. Цели. Брейншторм</span>
                  <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    ИИ поможет найти призвание по биографии и предпочтениям личности
                  </span>
                </button>
              )}

              <button
                onClick={() => (window.location.href = "/problem")}
                className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
              >
                <span className="block text-base font-semibold">есть вопрос, хочу разобраться в ...</span>
                <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  В жизненной ситуации или в текущем проекте, хочу пообщаться и найти решение
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

              <button
                onClick={() => (window.location.href = "/interview-select")}
                className="w-full rounded-md border border-zinc-200 bg-white px-4 py-4 text-left text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
              >
                <span className="block text-base font-semibold">У меня есть своя идея/цель, мне нужна стратегия и тактика её достижения</span>
                <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Пройди интервью для точного анализа ИИ и получи стратегию достижения
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

  if (pageState === "welcome") {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-md flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <div className="w-full space-y-6 text-center">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">Вход</h1>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Введите логин и пароль, чтобы попасть в главное меню
              </p>
            </div>

            {showLoginForm ? (
              <form onSubmit={handleLogin} className="flex flex-col gap-3">
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Логин (email)"
                  required
                  autoFocus
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white"
                  disabled={loginLoading}
                />
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Пароль"
                  required
                  minLength={6}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white"
                  disabled={loginLoading}
                />
                {loginError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{loginError}</p>
                )}
                <div className="flex gap-3 justify-center">
                  <button
                    type="submit"
                    disabled={loginLoading || !loginEmail.trim() || !loginPassword}
                    className="flex-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    {loginLoading ? "Вхожу..." : "Войти"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLoginForm(false)}
                    className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                  >
                    Назад
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setShowLoginForm(true)}
                  className="w-full rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                >
                  Login
                </button>
                <button
                  onClick={() => (window.location.href = "/welcome")}
                  className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  Новый пользователь
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  return null;
}
