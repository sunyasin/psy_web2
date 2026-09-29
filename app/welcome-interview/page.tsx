"use client";

import { useEffect, useState } from "react";
import { startInterview, submitAnswer, loadExistingSession, updateAnswer } from "@/app/interview/actions";
import { supabase } from "@/lib/supabase";
import { subscriptionsApi } from "@/lib/subscriptionsApi";
import type { InterviewQuestionResult, InterviewConfigRow } from "@/lib/types";

export default function WelcomeInterviewPage() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<InterviewQuestionResult | null>(null);
  const [answer, setAnswer] = useState("");
  const [allQuestions, setAllQuestions] = useState<InterviewConfigRow[]>([]);
  const [resolvedInterviewId, setResolvedInterviewId] = useState<string | null>(null);

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");

    if (!clientUuid) {
      window.location.href = "/";
      return;
    }

    let mounted = true;

    (async () => {
      try {
        // Resolve interview ID from code "welcome"
        const res = await fetch(`/api/interview/resolve-id?code=welcome`);
        const data = await res.json();
        let interviewId: string | undefined;
        if (data.interview_id) {
          interviewId = data.interview_id;
          setResolvedInterviewId(data.interview_id);
        }

        const [questionsData, existing] = await Promise.all([
          fetch(`/api/interview/questions${interviewId ? `?interview_id=${interviewId}` : ""}`).then((r) => r.json()),
          loadExistingSession(clientUuid, interviewId),
        ]);

        if (questionsData.blocks) {
          setAllQuestions(questionsData.blocks);
        }

        if (existing) {
          setQuestion(existing);
        } else {
          const q = await startInterview(clientUuid, interviewId);
          setQuestion(q);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка запуска интервью");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (allQuestions.length > 0 && question) {
      const clientUuid = localStorage.getItem("client_uuid");
      fetch(`/api/interview/answers?client_uuid=${clientUuid}${resolvedInterviewId ? `&interview_id=${resolvedInterviewId}` : ""}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.answers && question) {
            const blockAnswers = data.answers[question.blockNumber.toString()] || {};
            const existing = blockAnswers[question.order.toString()];
            if (existing) {
              setAnswer(existing);
            }
          }
        })
        .catch((err) => console.error("Failed to load answers", err));
    }
  }, [allQuestions, question, resolvedInterviewId]);

  // Auto-redirect to main page when interview is completed
  useEffect(() => {
    if (!question?.completed) return;
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) {
      window.location.href = "/";
      return;
    }
    // After completing the welcome interview, ask the user to link Telegram.
    subscriptionsApi
      .getSession(clientUuid)
      .then((result) => {
        if (result && "error" in result) {
          window.location.href = "/";
          return;
        }
        if (result?.telegramLinked) {
          window.location.href = "/";
        } else {
          window.location.href = "/link-telegram";
        }
      })
      .catch(() => {
        window.location.href = "/";
      });
  }, [question?.completed]);

  async function handleSave() {
    if (!answer.trim() || !question) return;

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    setSending(true);

    try {
      const currentAnswer = answer.trim();
      const next = await submitAnswer(clientUuid, currentAnswer, question.blockNumber, question.order, resolvedInterviewId || undefined);
      setQuestion(next);
      setAnswer("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSending(false);
    }
  }

  async function handleForward() {
    if (!question) return;

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    const currentAnswer = answer.trim();
    if (currentAnswer && question) {
      setSending(true);

      try {
        const next = await submitAnswer(clientUuid, currentAnswer, question.blockNumber, question.order, resolvedInterviewId || undefined);
        setQuestion(next);
        setAnswer("");

        const blockAnswers = await fetch(`/api/interview/answers?client_uuid=${clientUuid}${resolvedInterviewId ? `&interview_id=${resolvedInterviewId}` : ""}`).then((r) => r.json());
        if (blockAnswers.answers && next) {
          const nextBlockAnswers = blockAnswers.answers[next.blockNumber.toString()] || {};
          const nextExisting = nextBlockAnswers[next.order.toString()];
          if (nextExisting) {
            setAnswer(nextExisting);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка соединения");
        setAnswer(currentAnswer);
      } finally {
        setSending(false);
      }
    }
  }

  async function handleBack() {
    if (!question || !allQuestions.length) return;

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    // Save current answer before navigating back
    const currentAnswer = answer.trim();
    if (currentAnswer) {
      try {
        await updateAnswer(clientUuid, question.blockNumber, question.order, currentAnswer, resolvedInterviewId || undefined);
      } catch (err) {
        console.error("Failed to save answer before going back:", err);
      }
    }

    setSending(true);
    try {
      let sessionQuery = supabase
        .from("interview_sessions")
        .select("*")
        .eq("client_uuid", clientUuid)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .limit(1);

      if (resolvedInterviewId) {
        sessionQuery = sessionQuery.eq("interview_id", resolvedInterviewId);
      }

      const { data: session, error: sessionError } = await sessionQuery.single();

      if (sessionError || !session) {
        setError("Сессия не найдена");
        setSending(false);
        return;
      }

      // Determine previous question using simple sequential logic
      const currentBlockConfig = allQuestions.find((b) => b.block_number === question.blockNumber);
      if (!currentBlockConfig) {
        setSending(false);
        return;
      }

      const sortedQuestions = currentBlockConfig.questions.sort((a, b) => a.order - b.order);
      const currentIndex = sortedQuestions.findIndex((q) => q.order === question.order);

      const targetBlockNumber = question.blockNumber;
      let targetOrder: number;

      if (currentIndex > 0) {
        // Previous question in the same block
        targetOrder = sortedQuestions[currentIndex - 1].order;
      } else {
        // No previous block for welcome interview (only 1 block)
        setSending(false);
        return;
      }

      // Load the target question and its existing answer
      const answers = (session.answers as Record<string, Record<string, string>>) || {};
      const targetBlockAnswers = answers[targetBlockNumber.toString()] || {};
      const existingAnswer = targetBlockAnswers[targetOrder.toString()] || "";

      const targetBlockConfig = allQuestions.find((b) => b.block_number === targetBlockNumber);
      const targetQuestion = targetBlockConfig?.questions.find((q) => q.order === targetOrder);

      if (targetQuestion) {
        // Update session's current_block in database
        await supabase
          .from("interview_sessions")
          .update({ current_block: targetBlockNumber })
          .eq("id", session.id);

        setAnswer(existingAnswer);
        setQuestion({
          sessionId: session.id,
          blockNumber: targetBlockNumber,
          order: targetOrder,
          text: targetQuestion.text,
          isLast: false,
          totalInBlock: targetBlockConfig?.questions.length || 0,
          completed: false,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка навигации");
    } finally {
      setSending(false);
    }
  }

  function goHome() {
    window.location.href = "/";
  }

  if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Загружаю интервью...</p>
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
            onClick={goHome}
            className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black"
          >
            На главную
          </button>
        </main>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-2xl flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Вопрос не найден</p>
          <button onClick={goHome} className="mt-4 rounded-md bg-black px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
            На главную
          </button>
        </main>
      </div>
    );
  }

  const currentBlock = allQuestions.find((b) => b.block_number === question.blockNumber);
  const sortedQuestions = currentBlock?.questions?.sort((a, b) => a.order - b.order) || [];
  const currentIndex = sortedQuestions.findIndex((q) => q.order === question.order);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-2xl flex-col items-center py-16 px-6 bg-white dark:bg-black">
        <div className="w-full space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold text-black dark:text-zinc-50">
              Входное интервью
            </h1>
            <button
              onClick={goHome}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
            >
              На главную
            </button>
          </div>

          {!question.completed && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-xs text-zinc-500 mb-2">
                Блок {question.blockNumber}: {currentBlock?.block_name} · Вопрос {question.order} из {question.totalInBlock}
              </div>
              <p className="text-base font-medium text-black dark:text-zinc-50 mb-4">
                {question.text}
              </p>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={4}
                className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white"
                placeholder="Твой ответ..."
                disabled={sending}
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleBack}
              disabled={sending || currentIndex === 0}
              className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
            >
              Назад
            </button>
            {!question.completed && (
              <button
                onClick={handleSave}
                disabled={sending || !answer.trim()}
                className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
              >
                {sending ? "Сохраняю..." : "Сохранить"}
              </button>
            )}
            {!question.completed && (
              <button
                onClick={handleForward}
                disabled={sending || currentIndex === sortedQuestions.length - 1}
                className="flex-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                Вперед
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}