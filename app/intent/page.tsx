"use client";

import { useState, useEffect } from "react";
import type { IntentPath } from "@/lib/types";

const INTENT_QUESTION =
  "Расскажи, что привело тебя сюда сегодня — выбери, что ближе, или опиши своими словами:";

const INTENT_OPTIONS: { value: IntentPath; label: string; description: string }[] = [
  {
    value: "A_purpose",
    label: "Ищу новые идеи - хочу пройти интервью",
    description: "Какое дело/проект могли бы стать моим настоящим призванием",
  },
  {
    value: "B_problem",
    label: "У меня есть конкретная проблема",
    description: "В жизни или в текущем проекте, хочу разобраться и найти решение",
  },
  {
    value: "C_domains",
    label: "Хочу проверить и наладить",
    description: "Конкретные области жизни: отношения, деньги, здоровье, самореализация и т.д.",
  },
];

export default function IntentPage() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<IntentPath | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");
    const name = localStorage.getItem("display_name");

    if (!clientUuid) {
      window.location.href = "/";
      return;
    }

    setDisplayName(name);
  }, []);

  async function handleSelect(path: IntentPath) {
    setLoading(true);
    setError(null);

    const clientUuid = localStorage.getItem("client_uuid");

    try {
      const res = await fetch("/api/intent/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_uuid: clientUuid,
          raw_answer: path,
          classified_path: path,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Не удалось сохранить выбор");
      }

      setSelectedPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка соединения");
    } finally {
      setLoading(false);
    }
  }

  if (selectedPath) {
    if (selectedPath === "A_purpose") {
      window.location.href = "/interview";
      return null;
    }

    if (selectedPath === "B_problem") {
      window.location.href = "/problem";
      return null;
    }

    if (selectedPath === "C_domains") {
      window.location.href = "/domain-screening";
      return null;
    }

    return null;
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
        <div className="w-full space-y-8">
          <div className="text-center">
            <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
              Привет, {displayName || "друг"}!
            </h1>
            <p className="mt-3 text-base text-zinc-700 dark:text-zinc-300">
              {INTENT_QUESTION}
            </p>
          </div>

          <div className="grid gap-4">
            {INTENT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSelect(option.value)}
                disabled={loading}
                className="w-full rounded-xl border border-zinc-200 bg-white px-5 py-4 text-left transition-colors hover:border-black hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-white"
              >
                <div className="text-sm font-semibold text-black dark:text-zinc-50">
                  {option.label}
                </div>
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {option.description}
                </div>
              </button>
            ))}
          </div>

          {error && (
            <p className="text-center text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
            Либо напиши ответ своим текстом — я пойму, что тебе нужно, и задам уточняющий вопрос.
          </p>
        </div>
      </main>
    </div>
  );
}
