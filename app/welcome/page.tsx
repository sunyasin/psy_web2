"use client";

import { useEffect, useState } from "react";
import { LoginForm } from "@/components/LoginForm";

export default function Welcome() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);

  useEffect(() => {
    const clientUuid = document.cookie
      .split("; ")
      .find((row) => row.startsWith("client_uuid="))
      ?.split("=")[1];
    const displayName = document.cookie
      .split("; ")
      .find((row) => row.startsWith("display_name="))
      ?.split("=")[1];

    if (clientUuid && displayName) {
      window.location.replace("/");
    }
  }, []);

  async function lookupSession(
    displayName: string,
    lookupEmail: string,
    signal: AbortSignal
  ) {
    setLookupLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/client/lookup?display_name=${encodeURIComponent(displayName)}&email=${encodeURIComponent(lookupEmail)}`,
        { signal }
      );

      if (!res.ok) {
        return;
      }

      const data = await res.json();
      if (data.found && data.client_uuid) {
        document.cookie = `client_uuid=${data.client_uuid}; path=/; max-age=31536000; SameSite=Lax`;
        document.cookie = `display_name=${data.display_name || displayName}; path=/; max-age=31536000; SameSite=Lax`;
        document.cookie = `email=${data.email || lookupEmail}; path=/; max-age=31536000; SameSite=Lax`;
        localStorage.setItem("client_uuid", data.client_uuid);
        localStorage.setItem("display_name", data.display_name || displayName);
        localStorage.setItem("email", data.email || lookupEmail);

        window.location.href = "/";
      }
    } catch {
      if (!signal.aborted) {
        setError("Ошибка соединения");
      }
    } finally {
      setLookupLoading(false);
    }
  }

  useEffect(() => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail) {
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      lookupSession(trimmedName, trimmedEmail, controller.signal);
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name, email]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Введите имя");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/client/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: name.trim(),
          email: email.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Не удалось создать сессию");
      }

      document.cookie = `client_uuid=${data.client_uuid}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `display_name=${data.display_name || ""}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `email=${data.email || ""}; path=/; max-age=31536000; SameSite=Lax`;
      localStorage.setItem("client_uuid", data.client_uuid);
      localStorage.setItem("display_name", data.display_name || "");
      localStorage.setItem("email", data.email || "");

      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка соединения");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-md flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
        <div className="w-full space-y-6 text-center">
          <div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              Здесь вы сможете с помощью ИИ:
              <br />
              — найти те цели, которые вас зажгут надолго,
              <br />
              — проработать стратегию и психологию по каждой,
              <br />
              — вести трекинг прогресса, консультироваться с ИИ
            </p>
          </div>

          <div>
            <p className="text-base font-medium text-black dark:text-zinc-50">
              Представьтесь пожалуйста
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ваше имя"
              autoFocus
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white"
              disabled={submitting || lookupLoading}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (для восстановления сессии)"
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white"
              disabled={submitting || lookupLoading}
            />
            {lookupLoading && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Ищу вашу сессию...
              </p>
            )}
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {submitting ? "Создаю..." : "Ок"}
            </button>
          </form>

          <div className="space-y-3">
            {showLoginForm ? (
              <LoginForm
                autoFocus
                onCancel={() => setShowLoginForm(false)}
                cancelLabel="Назад"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowLoginForm(true)}
                className="w-full rounded-md border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
              >
                Уже есть аккаунт? Войти
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
