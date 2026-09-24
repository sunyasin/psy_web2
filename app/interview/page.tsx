"use client";

import { useState, useEffect } from "react";
import { startInterview, submitAnswer, loadExistingSession, updateAnswer, analyzeInterviewAnswers } from "./actions";
import { supabase } from "@/lib/supabase";
import type { InterviewQuestionResult, InterviewConfigRow, InterviewQuestion } from "@/lib/types";

export default function InterviewPage() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<InterviewQuestionResult | null>(null);
  const [answer, setAnswer] = useState("");
  const [allQuestions, setAllQuestions] = useState<InterviewConfigRow[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<string>("");

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");
    const name = localStorage.getItem("display_name");
    const selectedInterviewId = localStorage.getItem("selected_interview_id");

    if (!clientUuid) {
      window.location.href = "/";
      return;
    }

    setDisplayName(name);

    (async () => {
      try {
        const [questionsData, existing] = await Promise.all([
          fetch(`/api/interview/questions${selectedInterviewId ? `?interview_id=${selectedInterviewId}` : ""}`).then((r) => r.json()),
          loadExistingSession(clientUuid, selectedInterviewId || undefined),
        ]);

        if (questionsData.blocks) {
          setAllQuestions(questionsData.blocks);
        }

        if (existing) {
          setQuestion(existing);
        } else {
          const q = await startInterview(clientUuid, selectedInterviewId || undefined);
          setQuestion(q);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка запуска интервью");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (allQuestions.length > 0 && question) {
      fetch(`/api/interview/answers?client_uuid=${localStorage.getItem("client_uuid")}`)
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
  }, [allQuestions, question]);

  async function handleSave() {
    if (!answer.trim() || !question) return;

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    setSending(true);

    try {
      await updateAnswer(clientUuid, question.blockNumber, question.order, answer.trim());
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
        const next = await submitAnswer(clientUuid, currentAnswer, question.blockNumber, question.order);
        setQuestion(next);
        setAnswer("");

        const blockAnswers = await fetch(`/api/interview/answers?client_uuid=${clientUuid}`).then((r) => r.json());
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
        await updateAnswer(clientUuid, question.blockNumber, question.order, currentAnswer);
      } catch (err) {
        console.error("Failed to save answer before going back:", err);
      }
    }

    setSending(true);
    try {
      const { data: session } = await supabase
        .from("interview_sessions")
        .select("*")
        .eq("client_uuid", clientUuid)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!session) {
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

      let targetBlockNumber = question.blockNumber;
      let targetOrder: number;

      if (currentIndex > 0) {
        // Previous question in the same block
        targetOrder = sortedQuestions[currentIndex - 1].order;
      } else {
        // Go to last question of previous block
        const prevBlockConfig = allQuestions.find((b) => b.block_number === question.blockNumber - 1);
        if (!prevBlockConfig || prevBlockConfig.questions.length === 0) {
          setSending(false);
          return;
        }
        targetBlockNumber = prevBlockConfig.block_number;
        const prevSortedQuestions = prevBlockConfig.questions.sort((a, b) => a.order - b.order);
        targetOrder = prevSortedQuestions[prevSortedQuestions.length - 1].order;
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

  async function handleToStart() {
    if (!question || !allQuestions.length) return;

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    // Save current answer before navigating
    const currentAnswer = answer.trim();
    if (currentAnswer) {
      try {
        await updateAnswer(clientUuid, question.blockNumber, question.order, currentAnswer);
      } catch (err) {
        console.error("Failed to save answer before going to start:", err);
      }
    }

    setSending(true);
    try {
      const { data: session } = await supabase
        .from("interview_sessions")
        .select("*")
        .eq("client_uuid", clientUuid)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!session) {
        setError("Сессия не найдена");
        setSending(false);
        return;
      }

      // Go to first question of first block
      const firstBlockConfig = allQuestions.find((b) => b.block_number === 1);
      if (!firstBlockConfig || firstBlockConfig.questions.length === 0) {
        setSending(false);
        return;
      }

      const firstSortedQuestions = firstBlockConfig.questions.sort((a, b) => a.order - b.order);
      const firstQuestion = firstSortedQuestions[0];

      const answers = (session.answers as Record<string, Record<string, string>>) || {};
      const firstBlockAnswers = answers["1"] || {};
      const existingAnswer = firstBlockAnswers[firstQuestion.order.toString()] || "";

      setAnswer(existingAnswer);
      setQuestion({
        sessionId: session.id,
        blockNumber: 1,
        order: firstQuestion.order,
        text: firstQuestion.text,
        isLast: false,
        totalInBlock: firstBlockConfig.questions.length,
        completed: false,
      });

      // Update session's current_block in database
      await supabase
        .from("interview_sessions")
        .update({ current_block: 1 })
        .eq("id", session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка навигации");
    } finally {
      setSending(false);
    }
  }

  async function handleSkipUnanswered() {
    if (!question || !allQuestions.length) return;

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    // Save current answer before navigating
    const currentAnswer = answer.trim();
    if (currentAnswer) {
      try {
        await updateAnswer(clientUuid, question.blockNumber, question.order, currentAnswer);
      } catch (err) {
        console.error("Failed to save answer before skipping:", err);
      }
    }

    setSending(true);
    try {
      const { data: session } = await supabase
        .from("interview_sessions")
        .select("*")
        .eq("client_uuid", clientUuid)
        .eq("status", "in_progress")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!session) {
        setError("Сессия не найдена");
        setSending(false);
        return;
      }

      const answers = (session.answers as Record<string, Record<string, string>>) || {};

      // Find first unanswered question across all blocks
      let targetBlockNumber: number | null = null;
      let targetOrder: number | null = null;
      let targetQuestion: InterviewQuestion | null = null;
      let targetBlockConfig: InterviewConfigRow | null = null;

      for (const blockConfig of allQuestions) {
        const blockAnswers = answers[blockConfig.block_number.toString()] || {};
        const sortedQuestions = blockConfig.questions.sort((a: InterviewQuestion, b: InterviewQuestion) => a.order - b.order);
        
        for (const q of sortedQuestions) {
          if (!blockAnswers[q.order.toString()]) {
            targetBlockNumber = blockConfig.block_number;
            targetOrder = q.order;
            targetQuestion = q;
            targetBlockConfig = blockConfig;
            break;
          }
        }
        if (targetQuestion) break;
      }

      // If all answered, go to the last question
      if (!targetQuestion) {
        const lastBlockConfig = allQuestions[allQuestions.length - 1];
        const lastSortedQuestions = lastBlockConfig.questions.sort((a: InterviewQuestion, b: InterviewQuestion) => a.order - b.order);
        targetQuestion = lastSortedQuestions[lastSortedQuestions.length - 1];
        targetBlockNumber = lastBlockConfig.block_number;
        targetOrder = targetQuestion.order;
        targetBlockConfig = lastBlockConfig;
      }

      if (!targetQuestion || !targetBlockConfig) {
        setSending(false);
        return;
      }

      const targetBlockAnswers = answers[targetBlockNumber!.toString()] || {};
      const existingAnswer = targetBlockAnswers[targetOrder!.toString()] || "";

      setAnswer(existingAnswer);
      setQuestion({
        sessionId: session.id,
        blockNumber: targetBlockNumber!,
        order: targetOrder!,
        text: targetQuestion.text,
        isLast: false,
        totalInBlock: targetBlockConfig.questions.length,
        completed: false,
      });

      // Update session's current_block in database
      await supabase
        .from("interview_sessions")
        .update({ current_block: targetBlockNumber! })
        .eq("id", session.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка навигации");
    } finally {
      setSending(false);
    }
  }

  function hasPreviousQuestion(): boolean {
    if (!question || !allQuestions.length) return false;

    const currentBlock = allQuestions.find((b) => b.block_number === question.blockNumber);
    if (!currentBlock) return false;

    const sortedQuestions = currentBlock.questions.sort((a, b) => a.order - b.order);
    const currentIndex = sortedQuestions.findIndex((q) => q.order === question.order);

    if (currentIndex > 0) return true;

    const prevBlock = allQuestions.find((b) => b.block_number === question.blockNumber - 1);
    if (!prevBlock) return false;

    return prevBlock.questions.length > 0;
  }

  function hasNextQuestion(): boolean {
    if (!question || !allQuestions.length) return false;
    
    const currentBlock = allQuestions.find((b) => b.block_number === question.blockNumber);
    if (!currentBlock) return false;
    
    const sortedQuestions = currentBlock.questions.sort((a, b) => a.order - b.order);
    const currentIndex = sortedQuestions.findIndex((q) => q.order === question.order);
    
    if (currentIndex < sortedQuestions.length - 1) return true;
    
    if (question.blockNumber < 6) {
      const nextBlock = allQuestions.find((b) => b.block_number === question.blockNumber + 1);
      return !!nextBlock;
    }
    
    return false;
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

  if (analyzing) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-zinc-200 border-t-black animate-spin dark:border-zinc-700 dark:border-t-white" />
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">Синтез профиля</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Анализируем ваши ответы...</p>
          </div>
          <div className="rounded-md bg-zinc-100 p-3 dark:bg-zinc-800">
            <div className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">Этап:</div>
            <div className="h-2 w-full rounded-full bg-zinc-200 overflow-hidden dark:bg-zinc-700">
              <div className="h-full bg-black rounded-full transition-all duration-300 dark:bg-white" style={{ width: "66%" }} />
            </div>
            <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300 text-center">{analysisProgress}</p>
          </div>
        </div>
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
              Интервью
            </h1>
            <button
              onClick={goHome}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
            >
              На главную
            </button>
          </div>

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

          <div className="flex gap-2">
            <button
              onClick={handleToStart}
              disabled={sending}
              className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
            >
              В начало
            </button>
            <button
              onClick={handleBack}
              disabled={sending || !hasPreviousQuestion()}
              className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
            >
              Назад
            </button>
            <button
              onClick={handleSave}
              disabled={sending || !answer.trim()}
              className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
            >
              {sending ? "Сохраняю..." : "Сохранить"}
            </button>
            <button
              onClick={handleForward}
              disabled={sending || !hasNextQuestion()}
              className="flex-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Вперед
            </button>
            <button
              onClick={handleSkipUnanswered}
              disabled={sending}
              className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
            >
              Без ответа
            </button>
          </div>

          {question.completed && (
            <button
              onClick={async () => {
                setAnalyzing(true);
                try {
                  const clientUuid = localStorage.getItem("client_uuid");
                  if (!clientUuid) {
                    throw new Error("Нет client_uuid");
                  }
                  const selectedInterviewId = localStorage.getItem("selected_interview_id");
                  const result = await analyzeInterviewAnswers(clientUuid, selectedInterviewId || undefined);
                  localStorage.setItem("interview_analysis", JSON.stringify(result));
                  window.location.href = `/results?client_uuid=${clientUuid}`;
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Ошибка анализа");
                  setAnalyzing(false);
                }
              }}
              disabled={analyzing}
              className="w-full rounded-md bg-black px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              {analyzing ? "Анализирую..." : "Анализировать ответы"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
