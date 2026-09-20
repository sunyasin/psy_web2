"use client";

import { useState, useEffect } from "react";
import { startInterview, submitAnswer, loadExistingSession, updateAnswer, analyzeInterviewAnswers } from "./actions";
import { supabase } from "@/lib/supabase";
import type { InterviewQuestionResult, InterviewConfigRow } from "@/lib/types";

export default function InterviewPage() {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<InterviewQuestionResult | null>(null);
  const [answer, setAnswer] = useState("");
  const [allQuestions, setAllQuestions] = useState<InterviewConfigRow[]>([]);
  const [currentAnswers, setCurrentAnswers] = useState<Record<string, Record<string, string>>>({});
  const [editing, setEditing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

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
    if (allQuestions.length > 0) {
      fetch(`/api/interview/answers?client_uuid=${localStorage.getItem("client_uuid")}`)
        .then((r) => r.json())
        .then((data) => {
          setCurrentAnswers(data.answers || {});
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
        const next = await submitAnswer(clientUuid, currentAnswer);
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
      const currentBlock = session.current_block;
      const blockAnswers = answers[currentBlock.toString()] || {};
      const answeredOrders = Object.keys(blockAnswers).map(Number).filter((n) => !Number.isNaN(n));
      
      let targetOrder: number;
      if (answeredOrders.length > 0) {
        const maxOrder = Math.max(...answeredOrders);
        if (maxOrder < question.order) {
          targetOrder = maxOrder;
        } else if (answeredOrders.length > 1) {
          targetOrder = answeredOrders.filter((o) => o < question.order).sort((a, b) => b - a)[0];
        } else {
          const prevBlock = currentBlock - 1;
          if (prevBlock > 0) {
            const prevBlockAnswers = answers[prevBlock.toString()] || {};
            const prevOrders = Object.keys(prevBlockAnswers).map(Number).filter((n) => !Number.isNaN(n));
            if (prevOrders.length > 0) {
              targetOrder = Math.max(...prevOrders);
            } else {
              setSending(false);
              return;
            }
          } else {
            setSending(false);
            return;
          }
        }
      } else {
        setSending(false);
        return;
      }

      const blockConfig = allQuestions.find((b) => b.block_number === currentBlock);
      if (blockConfig) {
        const targetQuestion = blockConfig.questions.find((q) => q.order === targetOrder);
        if (targetQuestion) {
          const existingAnswer = blockAnswers[targetOrder.toString()] || "";
          setAnswer(existingAnswer);
          setQuestion({
            sessionId: session.id,
            blockNumber: currentBlock,
            order: targetOrder,
            text: targetQuestion.text,
            isLast: false,
            totalInBlock: blockConfig.questions.length,
            completed: false,
          });
        }
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

  function hasPreviousQuestion(): boolean {
    if (!question || !allQuestions.length) return false;
    
    const currentBlock = allQuestions.find((b) => b.block_number === question.blockNumber);
    if (!currentBlock) return false;
    
    const sortedQuestions = currentBlock.questions.sort((a, b) => a.order - b.order);
    const currentIndex = sortedQuestions.findIndex((q) => q.order === question.order);
    
    if (currentIndex > 0) return true;
    
    const prevBlock = allQuestions.find((b) => b.block_number === question.blockNumber - 1);
    if (!prevBlock) return false;
    
    const prevBlockAnswers = currentAnswers[(question.blockNumber - 1).toString()] || {};
    return Object.keys(prevBlockAnswers).length > 0;
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
            <div className="flex gap-2">
              <button
                onClick={goHome}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
              >
                На главную
              </button>
              <button
                onClick={() => setEditing(!editing)}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
              >
                {editing ? "Скрыть правку" : "Изменить"}
              </button>
            </div>
          </div>

          {editing && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-sm font-semibold text-black dark:text-zinc-50 mb-3">Все вопросы и ответы</h3>
              <div className="space-y-3">
                {allQuestions.map((block) => {
                  const blockAnswers = currentAnswers[block.block_number.toString()] || {};
                  const sorted = block.questions.sort((a, b) => a.order - b.order);
                  return (
                    <div key={block.block_number} className="space-y-2">
                      <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                        Блок {block.block_number}: {block.block_name}
                      </div>
                      {sorted.map((q) => {
                        const answerText = blockAnswers[q.order.toString()] || "—";
                        const isCurrent = block.block_number === question.blockNumber && q.order === question.order;
                        return (
                          <div
                            key={q.order}
                            className={`rounded-lg border p-3 ${
                              isCurrent
                                ? "border-black dark:border-white"
                                : "border-zinc-200 dark:border-zinc-800"
                            }`}
                          >
                            <div className="text-sm text-zinc-700 dark:text-zinc-300 mb-1">
                              {q.order}. {q.text}
                            </div>
                            <div className="text-sm text-zinc-500 dark:text-zinc-400">
                              Ответ: {answerText}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
          </div>

          {question.completed && (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              Интервью завершено. Далее — синтез профиля.
            </div>
          )}

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
            className="w-full rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
          >
            {analyzing ? "Анализирую..." : "Анализ ответов"}
          </button>
        </div>
      </main>
    </div>
  );
}
