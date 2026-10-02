/**
 * Расшифровка беседы problem_diagnosis_agent в читаемом виде.
 *
 * Хранится в problem_diagnosis_sessions.session_log одной строкой на ход:
 *   "(2026-10-02 09:55:28) Q: Я всегда срываю сроки, A: Похоже, это не разовая..."
 *
 * Формат текстовый, а не JSON: сессию читает человек (разбор качества диалогов),
 * а не только машина. Для машины позиция сценария живёт в отдельных колонках
 * phase/turn, разбирать их из текста не нужно.
 */
import type { TranscriptTurn } from "@/lib/types";

const TURN_RE = /^\(([^)]+)\)\s*Q:\s*([\s\S]*?),\s*A:\s*([\s\S]+)$/;

/** Метка времени в часовом поясе сервера — БД и лог читает один и тот же человек. */
export function formatTurnAt(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
  );
}

/**
 * Разбирает накопленную расшифровку обратно в ходы.
 * Нераспознанные строки игнорируются — старые сессии могли быть JSONB.
 */
export function parseTranscript(raw: string | null | undefined): TranscriptTurn[] {
  if (!raw) return [];

  const turns: TranscriptTurn[] = [];
  for (const line of raw.split("\n")) {
    const match = TURN_RE.exec(line.trim());
    if (!match) continue;
    turns.push({ at: match[1], question: match[2].trim(), answer: match[3].trim() });
  }
  return turns;
}

/** Дописывает ход в расшифровку и возвращает новое значение колонки. */
export function appendTurn(raw: string | null | undefined, turn: TranscriptTurn): string {
  const line = `(${turn.at}) Q: ${turn.question}, A: ${turn.answer}`;
  return raw ? `${raw}\n${line}` : line;
}