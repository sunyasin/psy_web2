"use client";

import { useState } from "react";

export default function Welcome() {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        body: JSON.stringify({ display_name: name.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Не удалось создать сессию");
      }

      document.cookie = `client_uuid=${data.client_uuid}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `display_name=${data.display_name || ""}; path=/; max-age=31536000; SameSite=Lax`;
      localStorage.setItem("client_uuid", data.client_uuid);
      localStorage.setItem("display_name", data.display_name || "");

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
              disabled={submitting}
            />
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
        </div>
      </main>
    </div>
  );
}
