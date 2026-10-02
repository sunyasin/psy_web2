/**
 * Расшифровка беседы problem_diagnosis_agent в читаемом виде.
 *
 * Хранится в problem_diagnosis_sessions.session_log блоком на ход:
 *   (2026-10-02 09:55:28) Q: Я всегда срываю сроки, A: Смотри, что я вижу:
 *   Когда доходит до сближения — ты уходишь в одиночную деятельность.
 *   Скажи, откликается это?
 *
 * Формат текстовый, а не JSON: сессию читает человек (разбор качества диалогов),
 * а не только машина. Для машины позиция сценария живёт в отдельных колонках
 * phase/turn, разбирать их из текста не нужно.
 *
 * Почему запись начинается с метки, а не идёт по одной строке: ответ агента —
 * обычно несколько абзацев. При разбиении по переносу строки ход распадался
 * на куски, и в историю попадала только первая строка ответа. Поэтому границы
 * ходов задаёт начало следующей метки, а не конец строки.
 */
import type { TranscriptTurn } from "@/lib/types";

/** Начало записи: скобка с меткой времени. Метка служит границей хода. */
const TURN_START_RE = /^\((\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\)\s*Q:\s*/;

/** Граница «конец вопроса / начало ответа». Жадная ленивая пара: режет по ПОСЛЕДНЕМУ ", A:". */
const Q_A_RE = /([\s\S]*?),\s*A:\s*([\s\S]+)$/;

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
 * Нераспознанное в начале игнорируется: старые сессии могли быть JSONB.
 */
export function parseTranscript(raw: string | null | undefined): TranscriptTurn[] {
  if (!raw) return [];

  const turns: TranscriptTurn[] = [];
  let at: string | null = null;
  let body: string[] = [];

  const flush = () => {
    if (!at) return;
    const match = Q_A_RE.exec(body.join("\n").trim());
    if (match) {
      turns.push({ at, question: match[1].trim(), answer: match[2].trim() });
    }
    at = null;
    body = [];
  };

  for (const line of raw.split("\n")) {
    const start = TURN_START_RE.exec(line);
    if (start) {
      // Новый ход: закрываем предыдущий и начинаем новый.
      flush();
      at = start[1];
      body.push(line.slice(start[0].length));
      continue;
    }
    // Строка вне хода (заголовок, мусор) — игнорируем, но не рвём текущий.
    if (at) body.push(line);
  }
  flush();

  return turns;
}

/**
 * Дописывает ход в расшифровку и возвращает новое значение колонки.
 * Содержимое не изменяется: отступы внутри ответа ломали бы точный round-trip
 * (парсер обязан вернуть исходный текст, а не приблизительный).
 */
export function appendTurn(raw: string | null | undefined, turn: TranscriptTurn): string {
  const block = `(${turn.at}) Q: ${turn.question}, A: ${turn.answer}`;
  return raw ? `${raw}\n\n${block}` : block;
}