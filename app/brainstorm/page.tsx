"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function BrainstormPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const ideaTitle = searchParams.get("title") || "";
  const goalId = searchParams.get("goal_id") || "";
  const ideaDescription = searchParams.get("description") || "";
  const ideaTagsRaw = searchParams.get("tags") || "[]";

  let ideaTags: string[] = [];
  try {
    ideaTags = JSON.parse(ideaTagsRaw);
  } catch {
    /* ignore */
  }

const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string; favorite?: boolean }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) {
      router.push("/");
      return;
    }

const contextText = `${ideaTitle}${ideaDescription ? "\n\n" + ideaDescription : ""}`;
    setMessages([
      {
        role: "assistant",
        text: `Готов помогать с идеей «${ideaTitle}». ${ideaDescription ? "Описание: " + ideaDescription + "." : ""} Задавай вопросы или предлагай направления развития.`,
      },
    ]);

    // Пытаемся загрузить существующую сессию брейншторма по goal_id.
    (async () => {
      try {
        const params = new URLSearchParams({ client_uuid: clientUuid });
        if (goalId) params.set("goal_id", goalId);
        const res = await fetch(`/api/brainstorm/list?${params}`);
        const data = await res.json();
        if (data.session && Array.isArray(data.session.messages) && data.session.messages.length > 0) {
          setSessionId(data.session.id);
          setMessages(data.session.messages);
        }
      } catch (err) {
        console.error("Failed to load brainstorm session:", err);
      }
    })();
  }, [ideaTitle, ideaDescription, goalId, router]);

  async function saveSession(currentMessages: typeof messages, currentSessionId: string | null) {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    setSaving(true);
    try {
      const res = await fetch("/api/brainstorm/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_uuid: clientUuid,
          goal_id: goalId || null,
          idea_title: ideaTitle,
          idea_description: ideaDescription,
          idea_tags: ideaTags,
          messages: currentMessages,
          session_id: currentSessionId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.session_id) {
        setSessionId(data.session_id);
      }
    } catch (err) {
      console.error("Failed to save brainstorm session:", err);
    } finally {
      setSaving(false);
    }
  }

  function toggleFavorite(idx: number) {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === idx ? { ...m, favorite: !m.favorite } : m
      )
    );
  }

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    const userMsg = input.trim();
    const userMessageObj = { role: "user" as const, text: userMsg };
    setMessages((prev) => [...prev, userMessageObj]);
    setInput("");
    setLoading(true);
    const currentId = Math.random().toString(36).slice(2);
    setLoadingId(currentId);

    try {
      const res = await fetch("/api/brainstorm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_uuid: clientUuid,
          idea_title: ideaTitle,
          idea_description: ideaDescription,
          idea_tags: ideaTags,
          message: userMsg,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Ошибка чата");
      }

      const assistantMessageObj = { role: "assistant" as const, text: data.response };
      const updated = [...messages, userMessageObj, assistantMessageObj];
      setMessages(updated);

      // Сохраняем сессию в БД.
      await saveSession(updated, sessionId);
    } catch (err) {
      const errObj = {
        role: "assistant" as const,
        text: err instanceof Error ? err.message : "Ошибка соединения",
      };
      const updated = [...messages, userMessageObj, errObj];
      setMessages(updated);
      await saveSession(updated, sessionId);
    } finally {
      setLoading(false);
      setLoadingId(null);
    }
  }, [input, loading, ideaTitle, ideaDescription, ideaTags, messages, router, sessionId]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full flex-1 flex-col">
        <div className="flex flex-1">
          <aside className="sticky top-0 self-start w-64 flex-shrink-0 overflow-y-auto border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
            <div className="p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Навигация
              </h2>
            </div>
            <nav className="px-2 pb-4 space-y-1">
              <button
                onClick={() => {
                  const query = goalId
                    ? `?goal_id=${encodeURIComponent(goalId)}`
                    : `?title=${encodeURIComponent(ideaTitle)}`;
                  router.push("/results/idea" + query);
                }}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 transition-colors dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                ← Назад к идее
              </button>
              <button
                onClick={() => router.push("/results")}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 transition-colors dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                К списку идей
              </button>
              <button
                onClick={() => router.push("/")}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 transition-colors dark:text-zinc-400 dark:hover:bg-zinc-900"
              >
                Главное меню
              </button>
            </nav>
          </aside>

          <section className="flex flex-1 flex-col bg-white dark:bg-black">
            <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
              <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
                Брейншторм: {ideaTitle}
              </h1>
              {ideaTags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {ideaTags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className="group relative flex max-w-xl flex-col">
                    <div
                      className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-black text-white dark:bg-white dark:text-black"
                          : "bg-zinc-50 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                      }`}
                    >
                      {msg.text}
                    </div>
                    <button
                      onClick={() => toggleFavorite(idx)}
                      title={msg.favorite ? "Убрать из избранного" : "Добавить в избранное"}
                      className={`absolute -left-3 -top-2 flex h-6 w-6 items-center justify-center rounded-full border bg-white text-base transition-opacity dark:bg-zinc-900 ${
                        msg.favorite
                          ? "border-yellow-400 text-yellow-400 opacity-100"
                          : "border-zinc-300 text-zinc-300 opacity-0 group-hover:opacity-100 dark:border-zinc-700"
                      }`}
                    >
                      {msg.favorite ? "★" : "☆"}
                    </button>
                  </div>
                </div>
              ))}
              {loadingId && (
                <div className="flex justify-start">
                  <div className="rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-900">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: "0ms" }} />
                      <div className="h-3 w-3 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: "150ms" }} />
                      <div className="h-3 w-3 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                {saving ? (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Сохраняю...</span>
                ) : sessionId ? (
                  <span className="text-xs text-green-600 dark:text-green-400">Сессия сохранена</span>
                ) : (
                  <span className="text-xs text-zinc-400 dark:text-zinc-600">Не сохранено</span>
                )}
                <span className="text-xs text-zinc-400 dark:text-zinc-600">
                  Избранные: {messages.filter((m) => m.favorite).length}
                </span>
              </div>
              <button
                onClick={() => saveSession(messages, sessionId)}
                disabled={saving}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:border-black disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
              >
                Сохранить
              </button>
            </div>

            <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Напиши сообщение..."
                  disabled={loading}
                  className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white"
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  Отправить
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
