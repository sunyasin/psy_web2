"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Idea, InterviewAnalysisRow, GoalRow } from "@/lib/types";

export default function ResultsPage() {
  const router = useRouter();
  const [interviews, setInterviews] = useState<{ id: string; name: string }[]>([]);
  const [selectedInterviewId, setSelectedInterviewId] = useState("");
  const [results, setResults] = useState<InterviewAnalysisRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [workedGoalIds, setWorkedGoalIds] = useState<Set<string>>(new Set());
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [sabotageAnalysis, setSabotageAnalysis] = useState<string | null>(null);
  const [sabotageLoading, setSabotageLoading] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [showBookingPopup, setShowBookingPopup] = useState(false);
  const [bookingContactInfo, setBookingContactInfo] = useState("");
  const [selectedContactMethod, setSelectedContactMethod] = useState<string | null>(null);
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [showSendPopup, setShowSendPopup] = useState(false);
  const [sendEmailInput, setSendEmailInput] = useState("");
  const [sendLoading, setSendLoading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendViaEmail, setSendViaEmail] = useState(false);
  const [completedWithoutAnalysis, setCompletedWithoutAnalysis] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [subscriptionTier] = useState<string>(() => {
    try {
      return typeof window !== "undefined" ? (localStorage.getItem("subscription_tier") || "free_trial") : "free_trial";
    } catch {
      return "free_trial";
    }
  });

  const workedIdeaIndices = useMemo(() => {
    const current = results[0];
    if (!current) return new Set<number>();
    const normalize = (s: string) => (s || "").trim().toLowerCase();
    const workedTitles = new Set(
      goals
        .filter((g) => {
          const hasSabotage = g.conflict_analysis && g.conflict_analysis.length > 0;
          const hasBrainstorm = workedGoalIds.has(g.id);
          return hasSabotage || hasBrainstorm;
        })
        .map((g) => normalize(g.title))
    );
    const indices = new Set<number>();
    current.ideas.forEach((idea: Idea, idx: number) => {
      if (workedTitles.has(normalize(idea.title))) {
        indices.add(idx);
      }
    });
    return indices;
  }, [results, goals, workedGoalIds]);

  useEffect(() => {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) {
      window.location.href = "/";
      return;
    }

    (async () => {
      try {
        const [interviewsRes, goalsRes, brainstormRes] = await Promise.all([
          fetch("/api/interview/list"),
          fetch(`/api/goals/list?client_uuid=${clientUuid}`),
          fetch(`/api/brainstorm/worked?client_uuid=${clientUuid}`),
        ]);

        const interviewsData = await interviewsRes.json();
        if (interviewsData.interviews && interviewsData.interviews.length > 0) {
          setInterviews(interviewsData.interviews);
          setSelectedInterviewId(interviewsData.interviews[0].id);
        }

        const goalsData = await goalsRes.json();
        if (goalsData.goals && goalsData.goals.length > 0) {
          setGoals(goalsData.goals);
        }

        const brainstormData = await brainstormRes.json();
        if (Array.isArray(brainstormData.workedGoalIds)) {
          setWorkedGoalIds(new Set(brainstormData.workedGoalIds));
        }
      } catch (err) {
        console.error("Failed to load initial data:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedInterviewId) return;

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    (async () => {
      setLoading(true);
      try {
        const cached = localStorage.getItem("interview_analysis");
        if (cached) {
          try {
            const data = JSON.parse(cached);
            const ideas = Array.isArray(data.ideas) ? data.ideas : [];
            setResults([
              {
                id: data.analysisId || "local-cache",
                client_uuid: clientUuid,
                interview_session_id: "",
                source_file: null,
                raw_answers: {},
                ideas: ideas,
                model_used: null,
                answer_count: typeof data.answerCount === "number" ? data.answerCount : ideas.length,
                created_at: new Date().toISOString(),
                interview_id: selectedInterviewId,
                interview_name: interviews.find((i) => i.id === selectedInterviewId)?.name || null,
                session_status: "completed",
              } as InterviewAnalysisRow,
            ]);
            localStorage.removeItem("interview_analysis");
            setLoading(false);
            return;
          } catch (parseError) {
            console.error("Failed to parse cached analysis:", parseError);
          }
        }

        const res = await fetch(`/api/results?client_uuid=${clientUuid}&interview_id=${selectedInterviewId}`);
        const data = await res.json();
        setResults(data.results || []);
      } catch (err) {
        console.error("Failed to load results:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedInterviewId, interviews]);

  useEffect(() => {
    if (!selectedInterviewId) {
      setCompletedWithoutAnalysis(false);
      return;
    }

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    (async () => {
      try {
        const res = await fetch(`/api/interview/has-completed?client_uuid=${clientUuid}&interview_id=${selectedInterviewId}`);
        const data = await res.json();
        if (data.completed) {
          // Check if analysis exists for this interview
          const resultsRes = await fetch(`/api/results?client_uuid=${clientUuid}&interview_id=${selectedInterviewId}`);
          const resultsData = await resultsRes.json();
          const hasAnalysis = resultsData.results && resultsData.results.length > 0;
          setCompletedWithoutAnalysis(!hasAnalysis);
        } else {
          setCompletedWithoutAnalysis(false);
        }
      } catch (err) {
        console.error("Failed to check completed status:", err);
        setCompletedWithoutAnalysis(false);
      }
    })();
  }, [selectedInterviewId]);

  const currentResult = results[0] || null;
  const ideas: Idea[] = currentResult?.ideas || [];

  const formatIdeasAsText = (ideasList: Idea[]): string => {
    return ideasList
      .map((idea, idx) => `${idx + 1}. ${idea.title}\n${idea.description}`)
      .join("\n\n");
  };

  function toggleGoalSelection(goalId: string) {
    setSelectedGoalId((prev) => (prev === goalId ? null : goalId));
    setSabotageAnalysis(null);
    setSelectionError(null);
  }

  async function handleSabotageAnalysis() {
    if (!selectedGoalId) {
      setSelectionError("Для анализа выберите одну цель");
      return;
    }

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    setSabotageLoading(true);
    setSelectionError(null);
    setSabotageAnalysis(null);

    try {
      const res = await fetch("/api/analysis/sabotage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_uuid: clientUuid, goal_id: selectedGoalId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ошибка анализа");
      }

      setSabotageAnalysis(data.analysis || "");
    } catch (err) {
      setSelectionError(err instanceof Error ? err.message : "Ошибка соединения");
    } finally {
      setSabotageLoading(false);
    }
  }

  function handleRetake() {
    localStorage.setItem("selected_interview_id", selectedInterviewId);
    window.location.href = "/interview";
  }

  async function handleStartAnalysis() {
    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid || !selectedInterviewId) return;

    setAnalyzing(true);
    setSelectionError(null);

    try {
      const res = await fetch("/api/interview/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_uuid: clientUuid, interview_id: selectedInterviewId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ошибка запуска анализа");
      }

      // Reload results after analysis
      const resultsRes = await fetch(`/api/results?client_uuid=${clientUuid}&interview_id=${selectedInterviewId}`);
      const resultsData = await resultsRes.json();
      setResults(resultsData.results || []);
      setCompletedWithoutAnalysis(false);
    } catch (err) {
      setSelectionError(err instanceof Error ? err.message : "Ошибка соединения");
    } finally {
      setAnalyzing(false);
    }
  }

  function handleSelfTry() {
    setSabotageAnalysis(null);
    setSelectionError(null);
    setSelectedGoalId(null);
  }

  const [savingIdea, setSavingIdea] = useState(false);

  async function handleIdeaClick(idx: number) {
    const idea = ideas[idx];
    if (!idea) return;

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid) return;

    // Сначала проверяем, не сохранена ли идея как цель уже
    const existing = goals.find((g) => g.title === idea.title);
    if (existing) {
      router.push(`/results/idea?goal_id=${encodeURIComponent(existing.id)}`);
      return;
    }

    // Идея ещё не сохранена — сохраняем как цель
    setSavingIdea(true);
    try {
      const res = await fetch("/api/goals/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_uuid: clientUuid,
          title: idea.title,
          description: idea.description,
          tags: idea.tags,
          source_analysis_id: currentResult?.id || null,
        }),
      });
      const data = await res.json();
      if (data.goal?.id) {
        router.push(`/results/idea?goal_id=${encodeURIComponent(data.goal.id)}`);
        return;
      }

      // Обновляем список целей и ищем только что созданную
      const listRes = await fetch(`/api/goals/list?client_uuid=${clientUuid}`);
      const listData = await listRes.json();
      if (listData.goals) {
        setGoals(listData.goals);
        const fresh = listData.goals.find((g: GoalRow) => g.title === idea.title);
        if (fresh) {
          router.push(`/results/idea?goal_id=${encodeURIComponent(fresh.id)}`);
        }
      }
    } catch (err) {
      console.error("Failed to save idea as goal:", err);
    } finally {
      setSavingIdea(false);
    }
  }

  function openBookingPopup() {
    setShowBookingPopup(true);
    setBookingContactInfo("");
    setSelectedContactMethod(null);
    setBookingSuccess(false);
  }

  function closeBookingPopup() {
    setShowBookingPopup(false);
    setBookingContactInfo("");
    setSelectedContactMethod(null);
    setBookingSuccess(false);
  }

  async function handleBookingSubmit() {
    if (!bookingContactInfo.trim() || !selectedContactMethod) {
      setSelectionError("Укажите способ связи и контактные данные");
      return;
    }

    const clientUuid = localStorage.getItem("client_uuid");
    if (!clientUuid || !selectedGoalId) return;

    setBookingSubmitting(true);
    setSelectionError(null);

    try {
      const res = await fetch("/api/booking/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_uuid: clientUuid,
          domain: "sabotage_analysis",
          method_name: "diagnostic_session",
          contact_info: `${selectedContactMethod}: ${bookingContactInfo.trim()}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ошибка отправки заявки");
      }

      setBookingSuccess(true);
      setSabotageAnalysis(null);
      setSelectionError(null);
      setSelectedGoalId(null);
    } catch (err) {
      setSelectionError(err instanceof Error ? err.message : "Ошибка соединения");
     } finally {
       setBookingSubmitting(false);
     }
   }
 
   function openSendPopup() {
     setShowSendPopup(true);
     setSendEmailInput("");
     setSendError(null);
     setSendSuccess(false);
   }
 
  function closeSendPopup() {
    setShowSendPopup(false);
    setSendEmailInput("");
    setSendError(null);
    setSendSuccess(false);
    setSendViaEmail(false);
  }
 
  async function handleTelegramSend() {
      const clientUuid = localStorage.getItem("client_uuid");
      if (!clientUuid || !currentResult) return;
  
      setSendLoading(true);
      setSendError(null);
  
      try {
        const resultsText = formatIdeasAsText(ideas);
        const res = await fetch("/api/send/telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_uuid: clientUuid,
            results: {
              ideas: ideas,
              text: resultsText,
              interview_name: currentResult.interview_name || null,
            },
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Ошибка отправки в Telegram");
        }
        setSendSuccess(true);
      } catch (err) {
        setSendError(err instanceof Error ? err.message : "Ошибка соединения");
      } finally {
        setSendLoading(false);
      }
    }
 
  async function handleEmailSend() {
      const clientUuid = localStorage.getItem("client_uuid");
      if (!clientUuid || !currentResult) return;
  
      const email = sendEmailInput.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setSendError("Введите корректный адрес email");
        return;
      }
  
      setSendLoading(true);
      setSendError(null);
  
      try {
        const resultsText = formatIdeasAsText(ideas);
        const res = await fetch("/api/send/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_uuid: clientUuid,
            email: email,
            results: {
              ideas: ideas,
              text: resultsText,
              interview_name: currentResult.interview_name || null,
            },
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Ошибка отправки на email");
        }
        setSendSuccess(true);
      } catch (err) {
        setSendError(err instanceof Error ? err.message : "Ошибка соединения");
      } finally {
        setSendLoading(false);
      }
    }
 
   if (loading) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full flex-col items-center justify-center py-16 px-6 bg-white dark:bg-black">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Загружаю...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full flex-1 flex-col">
        <div className="flex w-full flex-col gap-4 p-4 md:flex-row md:gap-0 md:p-0">
          <aside className="sticky top-0 self-start w-full overflow-y-auto border-b border-zinc-200 bg-white pb-4 dark:border-zinc-800 dark:bg-black md:border-b-0 md:border-r md:pb-0 md:w-64">
            <button
              onClick={() => router.push("/")}
              className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-50 transition-colors dark:text-zinc-400 dark:hover:bg-zinc-900"
            >
              Главное меню
            </button>
            <div className="p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Интервью
              </h2>
            </div>
            <nav className="px-2 pb-4">
              {interviews.map((interview) => (
                <button
                  key={interview.id}
                  onClick={() => setSelectedInterviewId(interview.id)}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    selectedInterviewId === interview.id
                      ? "bg-zinc-100 text-black dark:bg-zinc-900 dark:text-zinc-50"
                      : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
                  }`}
                >
                  {interview.name}
                </button>
              ))}
            </nav>
          </aside>

          <section className="flex w-full flex-1 flex-col bg-white dark:bg-black">
            <div className="p-6">
              {subscriptionTier !== "paid" && (
                <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Тариф: бесплатный пробный период
                </div>
              )}
              {completedWithoutAnalysis ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                    Интервью окончено. Теперь у меня есть достаточно информации для анализа
                  </p>
                  <button
                    onClick={handleStartAnalysis}
                    disabled={analyzing}
                    className="rounded-md bg-black px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    {analyzing ? "Анализирую..." : "Начать анализ интервью"}
                  </button>
                </div>
              ) : ideas.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                    Нет результатов. Пройдите интервью, чтобы получить анализ.
                  </p>
                  <button
                    onClick={() => {
                      localStorage.setItem("selected_interview_id", selectedInterviewId);
                      router.push("/interview");
                    }}
                    className="rounded-md bg-black px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    Пройти интервью
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {ideas.map((idea, idx) => {
                    const isWorked = workedIdeaIndices.has(idx);
                    return (
                      <div
                        key={idx}
                      onClick={() => handleIdeaClick(idx)}
className={`cursor-pointer rounded-xl border-2 p-5 transition-colors ${
                        isWorked
                          ? "border-black dark:border-white"
                          : "border-zinc-200 dark:border-zinc-800"
                      } bg-zinc-50 dark:bg-zinc-900`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1 flex h-4 w-4 items-center justify-center">
                          {isWorked ? (
                            <svg className="h-4 w-4 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
                              <path
                                fillRule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
                            <span className="h-2 w-2 rounded-full border border-zinc-300 dark:border-zinc-700" />
                          )}
                        </div>
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-black dark:text-zinc-50 mb-2">
                              {idx + 1}. {idea.title}
                            </div>
                            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                              {idea.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {ideas.length > 0 && (
              <div className="mt-6 mx-auto max-w-2xl">
                <h3 className="text-sm font-semibold text-black dark:text-zinc-50 mb-1 pl-1">
                  Что дальше?
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3 pl-1">
                  Чтобы поработать с каждой идеей нажмите на нее
                </p>
                <button
                  onClick={openSendPopup}
                  className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                >
                  отправить мне результаты
                </button>
              </div>
            )}
          </section>
        </div>

        {sabotageAnalysis && (
          <div className="border-t border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-black">
            <div className="mx-auto max-w-2xl">
              <div className="flex gap-3">
                <button
                  onClick={handleSelfTry}
                  className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                >
                  Попробую сам
                </button>
                <button
                  onClick={openBookingPopup}
                  className="flex-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  Запись на диагностическую сессию
                </button>
              </div>
            </div>
          </div>
        )}

        {showBookingPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
                Запись на диагностическую сессию
              </h3>

              <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Напишите удобный способ связи с Вами. Имя, Email, телефон, Никнейм или телефон в удобной соцсети
              </label>
              <input
                type="text"
                value={bookingContactInfo}
                onChange={(e) => setBookingContactInfo(e.target.value)}
                placeholder="Например: @username или +7..."
                className="mb-4 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:focus:border-white"
                disabled={bookingSubmitting || bookingSuccess}
              />

              <div className="mb-4">
                <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Выберите способ связи:</p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: "telegram", label: "Telegram", svg: <TelegramIcon /> },
                    { id: "instagram", label: "Instagram", svg: <InstagramIcon /> },
                    { id: "email", label: "Email", svg: <EmailIcon /> },
                    { id: "phone", label: "Телефон", svg: <PhoneIcon /> },
                  ].map((method) => (
                    <button
                      key={method.id}
                      type="button"
                      onClick={() => setSelectedContactMethod(method.id)}
                      className={`flex flex-col items-center justify-center rounded-lg border-2 p-3 transition-colors ${
                        selectedContactMethod === method.id
                          ? "border-black dark:border-white bg-zinc-50 dark:bg-zinc-800"
                          : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                      }`}
                      disabled={bookingSubmitting || bookingSuccess}
                    >
                      <div className="mb-1 h-6 w-6 text-black dark:text-zinc-50">{method.svg}</div>
                      <span className="text-xs font-medium text-black dark:text-zinc-50">{method.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {selectionError && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                  {selectionError}
                </div>
              )}

              {bookingSuccess && (
                <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
                  Заявка отправлена! Мы свяжемся с вами в ближайшее время.
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={closeBookingPopup}
                  disabled={bookingSubmitting}
                  className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                >
                  Отмена
                </button>
                <button
                  onClick={handleBookingSubmit}
                  disabled={bookingSubmitting || bookingSuccess}
                  className="flex-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  {bookingSubmitting ? "Отправляю..." : bookingSuccess ? "Отправлено" : "Отправить заявку"}
                </button>
              </div>
            </div>
          </div>
         )}

         {showSendPopup && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
             <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
               <h3 className="mb-4 text-lg font-semibold text-black dark:text-zinc-50">
                 Отправить результаты анкеты
               </h3>

               {sendSuccess ? (
                 <div>
                   <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300">
                     Результаты успешно отправлены!
                   </div>
                   <button
                     onClick={closeSendPopup}
                     className="mt-4 w-full rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                   >
                     Закрыть
                   </button>
                 </div>
               ) : sendViaEmail ? (
                 <div className="space-y-3">
                   <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                     Введите адрес email
                   </label>
                   <input
                     type="email"
                     value={sendEmailInput}
                     onChange={(e) => setSendEmailInput(e.target.value)}
                     placeholder="example@mail.com"
                     className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-black shadow-sm focus:border-black focus:outline-none focus:ring-1 focus:ring-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-white"
                     disabled={sendLoading}
                   />
                   {sendError && (
                     <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                       {sendError}
                     </div>
                   )}
                   <div className="flex gap-3">
                     <button
                       onClick={() => setSendViaEmail(false)}
                       className="flex-1 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:border-black dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                       disabled={sendLoading}
                     >
                       Назад
                     </button>
                     <button
                       onClick={handleEmailSend}
                       disabled={sendLoading || !sendEmailInput.trim()}
                       className="flex-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                     >
                       {sendLoading ? "Отправляю..." : "Отправить"}
                     </button>
                   </div>
                 </div>
               ) : (
                 <div className="space-y-4">
                   <p className="text-sm text-zinc-600 dark:text-zinc-400">
                     Выберите способ отправки результатов:
                   </p>
                   {sendError && (
                     <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
                       {sendError}
                     </div>
                   )}
                   <div className="grid grid-cols-2 gap-3">
                     <button
                       onClick={handleTelegramSend}
                       disabled={sendLoading || sendSuccess}
                       className="flex flex-col items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-4 transition-colors hover:border-black disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                     >
                       <TelegramIcon />
                       <span className="mt-2 text-sm font-medium text-black dark:text-zinc-50">Telegram</span>
                     </button>
                     <button
                       onClick={() => { setSendViaEmail(true); setSendError(null); }}
                       disabled={sendLoading || sendSuccess}
                       className="flex flex-col items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-4 transition-colors hover:border-black disabled:opacity-50 disabled:cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-white"
                     >
                       <EmailIcon />
                       <span className="mt-2 text-sm font-medium text-black dark:text-zinc-50">Email</span>
                     </button>
                   </div>
                 </div>
               )}
             </div>
           </div>
         )}
       </main>
     </div>
   );
 }

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2L2 12.5l4 1.5L7 22l5.5-3 3 5.5L21 2z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 4L12 13 2 4" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.362 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}
