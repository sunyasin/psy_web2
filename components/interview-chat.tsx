import type { InterviewQuestionResult } from "@/lib/types";

export function InterviewChat({
  messages,
  question,
  answer,
  onAnswerChange,
  onSubmit,
  sending,
  completed,
}: {
  messages: { role: "agent" | "user"; text: string }[];
  question: InterviewQuestionResult | null;
  answer: string;
  onAnswerChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  sending: boolean;
  completed: boolean;
}) {
  return (
    <div className="w-full space-y-4">
      <div className="space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === "agent"
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                : "bg-black text-white dark:bg-white dark:text-black"
            }`}
          >
            {msg.text}
          </div>
        ))}
      </div>

      {!completed && (
        <form onSubmit={onSubmit} className="space-y-3">
          <textarea
            value={answer}
            onChange={(e) => onAnswerChange(e.target.value)}
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

      {completed && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          Интервью завершено. Далее — синтез профиля.
        </div>
      )}
    </div>
  );
}
