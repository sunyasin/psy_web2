"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { DomainKey } from "@/lib/types";

const DOMAINS: { key: DomainKey; label: string; emoji: string }[] = [
  { key: "relationships", label: "Отношения", emoji: "💬" },
  { key: "money", label: "Деньги", emoji: "💰" },
  { key: "health", label: "Здоровье", emoji: "🏃" },
  { key: "purpose", label: "Призвание", emoji: "🎯" },
  { key: "safety", label: "Безопасность", emoji: "🛡️" },
  { key: "belonging", label: "Принадлежность", emoji: "🤝" },
];

const CHOICES = [
  { value: "free_chat_chosen", label: "Бесплатная КПТ-сессия сейчас" },
  { value: "paid_booked", label: "Записаться на консультацию" },
  { value: "dismissed", label: "Не сейчас" },
];

export default function DomainPage() {
  const [domainsParam, setDomainsParam] = useState<DomainKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [routedTo, setRoutedTo] = useState<string | null>(null);
  const [domainIndex, setDomainIndex] = useState(0);
  const [questions, setQuestions] = useState<{ id: string; text: string; order: number }[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [messages, setMessages] = useState<{ role: "agent" | "user"; text: string }[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("domains");
    if (raw) {
      const parsed = raw.split(",").filter((d): d is DomainKey =>
        ["relationships", "money", "health", "purpose", "safety", "belonging"].includes(d)
      );
      setDomainsParam(parsed);
    }
  }, []);

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid || domainsParam.length === 0) {
      if (!clientUuid) window.location.href = "/";
      return;
    }

    const domainKey = domainsParam[0];
    const domain = DOMAINS.find((d) => d.key === domainKey);
    const initial = [
      { role: "agent" as const, text: `Работаем с доменом: ${domain?.emoji} ${domain?.label}` },
      { role: "agent" as const, text: "Ответь коротко, своими словами — это не тест, а разговор." },
    ];
    setMessages(initial);
    setLoading(false);
    setQuestions([
      { id: `${domainKey}-1`, text: "Что в этой области жизни причиняет тебе больше всего дискомфорта прямо сейчас?", order: 1 },
      { id: `${domainKey}-2`, text: "Как ты пытался решить это раньше? Что помогало, а что нет?", order: 2 },
      { id: `${domainKey}-3`, text: "Если бы эта проблема решилась сама собой — что изменилось бы в твоём обычном дне?", order: 3 },
    ]);
  }, [domainsParam]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || sending) return;

    setSending(true);
    const userAnswer = answer.trim();
    setAnswer("");
    setMessages((m) => [...m, { role: "user", text: userAnswer }]);

    const nextIndex = questionIndex + 1;

    if (nextIndex >= questions.length) {
      const clientUuid = localStorage.getItem("client_uuid");
      if (!clientUuid) {
        setError("Нет client_uuid");
        setSending(false);
        return;
      }

      try {
        const savePromises = questions.map((q) =>
          supabase.from("domain_deep_answers").insert({
            client_uuid: clientUuid,
            domain: domainsParam[domainIndex],
            belief_config_id: null,
            answer: userAnswer,
          })
        );
        await Promise.all(savePromises);
      } catch (err) {
        console.error("Failed to save deep answers", err);
      }

      setMessages((m) => [...m, { role: "agent", text: "Спасибо. Я проанализировал ответы. В этом домене есть признаки, которые стоит обсудить подробнее." }]);
      setCompleted(true);
      setSending(false);
      return;
    }

    setQuestionIndex(nextIndex);
    setMessages((m) => [...m, { role: "agent", text: questions[nextIndex].text }]);
    setSending(false);
  }

  async function handleChoice(value: string) {
    setSending(true);

    const clientUuid = localStorage.getItem("client_uuid");
    if (clientUuid) {
      try {
        await supabase.from("domain_flags").insert({
          client_uuid: clientUuid,
          domain: domainsParam[domainIndex],
          description: `Выбор: ${value}`,
          evidence: {},
          status: value as any,
        });

        if (value === "paid_booked") {
          await supabase.from("booking_requests").insert({
            client_uuid: clientUuid,
            domain: domainsParam[domainIndex],
            method_name: "консультация",
            contact_info: null,
            status: "requested",
          });
        }
      } catch (err) {
        console.error("Failed to save domain choice", err);
      }
    }

    if (value === "free_chat_chosen") {
      setMessages((m) => [...m, { role: "agent", text: "Отлично, запускаю бесплатную КПТ-сессию." }]);
      setRoutedTo("free_chat_chosen");
      setTimeout(() => {
        window.location.href = "/cbt";
      }, 1200);
    } else if (value === "paid_booked") {
      setMessages((m) => [...m, { role: "agent", text: "Заявка на консультацию сохранена. Я свяжусь с тобой." }]);
      setRoutedTo("paid_booked");
    } else {
      setMessages((m) => [...m, { role: "agent", text: "Хорошо, оставляю это на потом." }]);
      setRoutedTo("dismissed");
    }
    setCompleted(true);
    setSending(false);
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Загружаю вопросы по домену...</p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          <button onClick={() => (window.location.href = "/")} className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
            На главную
          </button>
        </main>
      </div>
    );
  }

  const currentQuestion = questions[questionIndex];
  const showChoices = completed && !routedTo;
  const showResult = completed && routedTo;

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col items-center py-16 px-6 bg-white dark:bg-black">
        <div className="w-full space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
              Домены жизни
            </h1>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {domainsParam.length > 0 ? `${DOMAINS.find((d) => d.key === domainsParam[domainIndex])?.emoji} ${DOMAINS.find((d) => d.key === domainsParam[domainIndex])?.label}` : ""}
            </span>
          </div>

          <div className="space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "agent"
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                    : "bg-black text-white dark:bg-white dark:text-black"
                }`}
              >
                {msg.text}
              </div>
            ))}
          </div>

          {!completed && currentQuestion && (
            <form onSubmit={handleSubmit} className="space-y-3">
              <p className="text-sm text-zinc-700 dark:text-zinc-300">{currentQuestion.text}</p>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={3}
                className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white"
                placeholder="Твой ответ..."
                disabled={sending}
              />
              <button
                type="submit"
                disabled={sending || !answer.trim()}
                className="w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {sending ? "Отправляю..." : "Отправить"}
              </button>
            </form>
          )}

          {showChoices && (
            <div className="grid gap-3">
              {CHOICES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => handleChoice(c.value)}
                  disabled={sending}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-5 py-4 text-left transition-colors hover:border-black hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-white"
                >
                  <div className="text-sm font-semibold text-black dark:text-zinc-50">{c.label}</div>
                </button>
              ))}
            </div>
          )}

          {showResult && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              Выбрано:{" "}
              {routedTo === "free_chat_chosen"
                ? "бесплатная КПТ-сессия"
                : routedTo === "paid_booked"
                  ? "запись на консультацию"
                  : "не сейчас"}
              .
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
