# Декомпозиция цели на странице идеи

## Цель

Кнопка «Декомпозиция» слева от «Брейншторм-чат» на `/results/idea?goal_id=…`.
По клику: проверка подписки (заглушка — считаем оплаченной), затем все вопросы-ответы
**большого** интервью уходят в модель с промптом короткого интервью. Результат — идеи со
стратегиями и шагами, отрисованные на той же странице. По клику «Разложить в план» выбранные
идеи становятся **новыми целями** с этапами и шагами.

Новое интервью не создаём.

## Решения (согласованы)

| Вопрос | Решение |
|---|---|
| Где показывать | На странице идеи, блок под кнопками |
| Привязка декомпозиции к цели | **Новая колонка `goals.decomposition_analysis_id`** (FK на `interview_analyses`, частичный UNIQUE). Исходный `source_analysis_id` не трогаем |
| Колонка на `interview_analyses` | Только **`kind`** (`'short'` по умолчанию, `'goal_decomposition'`). Колонки `goal_id` **не заводим** — связь живёт на `goals` |
| Промпт | Копия `interview.prompt` для `code='short'`, вставленная в строку `code='decomposition'` при миграции |
| Источник ответов | Только завершённые сессии интервью `code='default'` |
| API | Отдельный роут `/api/analysis/decompose` + `/api/analysis/decompose/plan` |
| Идеи из ответа | Показать все, пользователь выбирает |
| Повторный запуск анализа | Прежняя строка `kind='goal_decomposition'` этой цели удаляется, пишется новая |
| Повторная раскладка | Цель переиспользуется, `planner_steps`/`planner_stages` удаляются и создаются заново |
| Связь новых целей с исходной | Только `source_analysis_id = id декомпозиции`. Ничего больше |
| Исходная идея | Не трогаем (status, поля) |
| После раскладки | Список новых целей со ссылками на `/planner/goal?id=…` + кнопка «Ко всем целям» |
| Условия доступности | Требуется завершённое большое интервью, иначе кнопка disabled |
| Парсер `model_json` | Существующие файлы не рефакторим, копия парсера в новом роуте |

## Проверенные факты о схеме

- `goals.source_analysis_id` (`20250813000000:20-23`) — **не уникален**: один анализ порождает
  до 5 целей (`app/api/short-analysis/plan/route.ts:294`). Уже занят смыслом «откуда взялась цель».
- `goals` имеет `UNIQUE (client_uuid, title)` (`20250818000000:15`).
- `interview_analyses.interview_session_id UUID NOT NULL` — отсюда требование переиспользовать
  существующую завершённую сессию, а не создавать новую.
- `interview_analyses` уже имеет `interview_id`, `goal_answer`, `raw_answers`, `model_json`,
  `model_used`, `answer_count`; `ideas` и `strategy_json` удалены
  (`20260926000007`, `20260926000006`).
- `planner_stages`: `UNIQUE(goal_id, idea_index)`, `analysis_id → interview_analyses`
  (`20260926000002:21`). `planner_steps`: `UNIQUE(stage_id, order_index)`.
- `interview_sessions`: уникальный индекс `(client_uuid, interview_id)`
  (`20260923000000:87`) — одна сессия на интервью.
- `app/api/interview/list/route.ts:9` селектит **все** строки `interview` без фильтра по
  `visible` — новую строку надо отфильтровать, иначе «Декомпозиция цели» появится в сайдбаре
  `/results` (`app/results/page.tsx:486`).
- Три роута выбирают «последний анализ с непустым `model_json`» без фильтра по интервью:
  `app/api/short-analysis/route.ts:208`, `app/api/analysis/exists/route.ts:201`,
  `app/api/results/route.ts:18`. Без защиты декомпозиция покажется вместо обычного анализа.
- Парсер ответа модели скопирован в 4 роутах: `analysis/short`, `analysis/exists`,
  `short-analysis`, `short-analysis/plan`.

## Задачи

### 1. Миграция `supabase/migrations/20260926000008_add_goal_decomposition_analysis.sql`

```sql
ALTER TABLE public.interview_analyses
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'short';

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS decomposition_analysis_id UUID
  REFERENCES public.interview_analyses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_goals_decomposition_analysis_id
  ON public.goals(decomposition_analysis_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_goals_one_decomposition_per_goal
  ON public.goals(decomposition_analysis_id)
  WHERE decomposition_analysis_id IS NOT NULL;

INSERT INTO public.interview (code, name, prompt, visible)
SELECT 'decomposition', 'Декомпозиция цели', prompt, false
FROM public.interview
WHERE code = 'short'
  AND NOT EXISTS (SELECT 1 FROM public.interview WHERE code = 'decomposition');
```

- `kind` дефолтится в `'short'`, поэтому записи, созданные `interview/analyze` и
  `all-interviews` (они `kind` не передают), останутся видимыми в общих выборках.
- Частичный UNIQUE на `goals.decomposition_analysis_id` запрещает двум целям ссылаться на одну
  декомпозицию.
- `visible = false` + правка `app/api/interview/list/route.ts` (задача 6).

### 2. `app/api/interview/list/route.ts`

Добавить `.eq("visible", true)` в `select`. Иначе строка `decomposition` попадёт в сайдбар
интервью на `/results`. Требуется, иначе `code='decomposition'` станет кликабельным интервью.

### 3. Новый роут `app/api/analysis/decompose/route.ts`

**GET** — отдать сохранённую декомпозицию цели (для отрисовки при открытии страницы):
- query: `client_uuid`, `goal_id` (оба обязательны → 400).
- `goals` по `id` + `client_uuid` → 404 если нет.
- Если `decomposition_analysis_id IS NULL` → `{ analysis: null, ideas: [] }`.
- Иначе `interview_analyses` по `id = decomposition_analysis_id` + `client_uuid` +
  `kind='goal_decomposition'`, проверить что `analysis_id` совпадает с колонкой цели.
- Распарсить `model_json` локальной копией парсера и вернуть `{ analysis, ideas }` в том же
  формате, что `/api/short-analysis` (`app/short-analysis/page.tsx:5-35`):
  `ideas[]` → `{ id, idea_index, title, description, strategies[] }`,
  `strategies[]` → `{ id, idea_index, strategy_index, title, steps[] }`,
  `steps[]` → `{ step, title, description, estimated_days }`.

**POST** — запустить анализ:
- body `{ client_uuid, goal_id }`.
- **Заглушка подписки**: `const subscriptionPaid = true;` с `// TODO: заменить на
  getSubscriptionStatus(clientUuid).isPaid`. Продолжаем работу всегда. На клиенте
  `handleWithSubscription` **не** используем — иначе заглушка `"nopaid"`
  (`app/results/idea/page.tsx:8`) убьёт фичу редиректом на `/tariffs`.
- `goals` по `id` + `client_uuid` → 404.
- Найти `interview` по `code='decomposition'` и `code='default'` → 500 при отсутствии.
- Q&A собрать **только** из `interview_sessions` со `status='completed'` и
  `interview_id = <default id>`, пропуская ключ `block4_trigger` (как
  `app/api/analysis/short/route.ts:47`).
- Формат строки: `Блок ${block}, вопрос ${order}: ${text}` (из
  `app/api/interview/analyze/route.ts:32`) — так модель видит структуру, а не просто
  `Ответ N`. `raw_answers` = `{ "<block>": { "<order>": "<text>" } }`.
- Нет ответов → 404 «Пройдите полное интервью».
- Вызов модели: `callClaude([{role:'user', text}], decompositionInterview.prompt,
  { max_tokens: 10000, temperature: 0.7 })` — как `app/api/analysis/short/route.ts:71`.
- `model_json = { raw_response: response }`, `model_used = 'claude'`.
- Пустой/невалидный JSON либо `!claudeConfigured()` →
  `model_json = { strategies: generateFallbackStrategies(...), fallback: true }`,
  `model_used = 'fallback'`. Фолбэк копируется из `app/api/analysis/short/route.ts:285`.
- **Заменить предыдущий анализ** (решение «заменять»): если у цели есть
  `decomposition_analysis_id` — `DELETE FROM interview_analyses WHERE id = <старый id>`.
  `ON DELETE SET NULL` сам очистит колонку цели. Делать до вставки новой строки.
- Вставить `interview_analyses`: `client_uuid`, `kind='goal_decomposition'`,
  `interview_session_id = <id взятой default-сессии>` (NOT NULL — поэтому интервью не создаём,
  а переиспользуем пройденное), `interview_id = <decomposition interview id>`, `raw_answers`,
  `goal_answer = goal.title`, `model_json`, `model_used`, `answer_count`.
- Обновить цель: `UPDATE goals SET decomposition_analysis_id = <new id>`.
- Вернуть распарсенный результат в формате GET.

### 4. `app/api/analysis/decompose/plan/route.ts`

- body: `{ client_uuid, analysis_id, selections: [{ idea_index, strategy_index }] }`.
  `goal_id` не нужен: исходная цель не участвует.
- Загрузить `interview_analyses` по `id` + `client_uuid` + `kind='goal_decomposition'` → 404.
  Дополнительно убедиться, что анализ реально привязан к какому-то `goals.decomposition_analysis_id`
  (защита от подстановки чужого `analysis_id`).
- Распарсить стратегии, для каждой selection взять `idea[idea_index].strategies[strategy_index]`
  → 400 если нет. Пустой `selections` → 400.
- Для каждой selection:
  1. Найти существующую цель по `(client_uuid, source_analysis_id = analysis_id, title = idea.title)`
     — та же логика, что `app/api/short-analysis/plan/route.ts:276-284`.
  2. Если не нашлась — вставить новую `{ client_uuid, title, smart_json: { description,
     goal_answer, source_idea_index, selected_strategy_title }, source_analysis_id: analysis_id,
     origin: 'primary', planning_track: 'standard_ai_plan', status: 'active' }`.
     **Обработать нарушение `UNIQUE(client_uuid, title)`**: если вставка вернула ошибку с
     `code === '23505'`, повторить поиск по `(client_uuid, title)` и переиспользовать найденную
     цель. Такой случай реален — идея декомпозиции может совпасть по названию с уже
     существующей целью, и без этой ветки будет 500. (Существующий `short-analysis/plan`
     этой ошибки не обрабатывает — не копируем баг.)
  3. **Полностью пересоздать этапы**: `DELETE FROM planner_steps WHERE goal_id = ?`, затем
     `DELETE FROM planner_stages WHERE goal_id = ?`.
  4. Вставить `planner_stages` одной строкой: `client_uuid`, `goal_id`, `analysis_id`,
     `idea_index: 0`, `order_index: 0`, `strategy_title: strategy.name`, `title: idea.title`,
     `description: idea.description`, `planned_days: sum(step.estimated_days) || null`,
     `model_comments: idea.description`, `status: 'planned'`, `updated_at: now()`.
     `idea_index: 0`, потому что каждый idea получает свою цель, а UNIQUE — на `(goal_id, idea_index)`.
  5. Вставить `planner_steps` по шагам стратегии: `stage_id`, `client_uuid`, `goal_id`,
     `title: step.title`, `description: step.description`, `planned_days: step.estimated_days`,
     `model_comments: step.description`, `order_index`, `updated_at: now()`.
- Вернуть `{ success: true, goals: [{ id, title, stepCount }] }` — этого хватит UI для
  списка ссылок.

### 5. UI в `app/results/idea/page.tsx`

Кнопка:
- В `div.flex.flex-wrap.gap-3` (строка 228) вставить **между** «Анализ саботажа» и
  «Брейншторм-чат». Стиль как у «Брейншторм-чат» (bordered, `flex-1`).
- Текст: `decomposeLoading ? "Декомпозирую..." : hasDecomposition ? "Перезапустить декомпозицию" : "Декомпозиция"`.
- `disabled={decomposeLoading || !goal || goal.status === "trash" || !hasDefaultInterview}`.
  Отдельный `handleDecompose`, **не** оборачивать в `handleWithSubscription`.

Состояния: `decomposeLoading`, `decomposeIdeas`, `decomposeAnalysisId`, `decomposeError`,
`selected` (`Record<ideaIndex, strategyIndex>`), `planLoading`, `plannedGoals`.
Типы `DecomposeIdea/DecomposeStrategy/DecomposeStep` — локально, по образцу
`app/short-analysis/page.tsx:5-35`. Шаги — **только чтение** (номер, `title`, `description`,
`planned_days` если > 0). Трекинг и статусы живут в `/planner/goal`, локальный
`updateStep` из `short-analysis` не переносим.

Загрузка:
- В существующем `useEffect` (строка 43) добавить параллельный запрос
  `GET /api/analysis/decompose?client_uuid=&goal_id=`. Заполнить `decomposeIdeas`,
  `decomposeAnalysisId`, `hasDecomposition`, сбросить `plannedGoals`.
- Предусловие `hasDefaultInterview` — новое поле ответа `/api/goals/get` (задача 6).
  Если `false` — под кнопкой подсказка «Сначала пройдите полное интервью».

Блок результата — после блока саботажа, перед «Вариант 1/2»:
- Заголовок «Декомпозиция цели».
- Карточка на каждую идею: `title` + `description`; внутри карточки стратегий, клик выбирает
  `selected[ideaIndex] = strategyIndex`; выбранная обведена `border-black dark:border-white`
  (как `app/short-analysis/page.tsx:168`). Число «N стратегий выбрано» в подписи.
- Sticky-блок: кнопка «Разложить в план» (disabled, если не выбрано ни одной стратегии),
  подпись «Выбрано идей: N».
- `handleDecomposePlan` → `POST /api/analysis/decompose/plan` с `selections` из `selected`.
  При успехе заменить sticky-блок на список созданных целей: по строке на цель с
  `<a href={"/planner/goal?id=" + id}>{title} · шагов: {stepCount}</a>`, плюс
  `<a href="/planner">Ко всем целям</a>`. Навигации нет — пользователь остаётся на странице.
- Сообщения об ошибке — рядом с кнопкой, через `decomposeError`, в стиле существующего
  блока `sabotageError`.

### 6. `app/api/goals/get/route.ts` и типы

- Добавить в ответ `has_default_interview: boolean`: есть ли у клиента завершённая сессия
  интервью `code='default'` (запрос в `interview` по `code` + `visible`, затем в
  `interview_sessions` по `interview_id` + `status='completed'`). `goal` возвращается без
  изменений.
- В `lib/types.ts` в `GoalRow` добавить необязательные поля
  `decomposition_analysis_id?: string | null` и `has_default_interview?: boolean`.

## Проверки

- `npm run lint`, `tsc --noEmit` (по `package.json`).
- Ручной сценарий:
  1. Клиент без завершённого большого интервью → кнопка «Декомпозиция» disabled + подсказка.
  2. Клиент с интервью → клик → спиннер → карточки идей и стратегий.
  3. Перезагрузка страницы идеи → результат подгружен из GET, кнопка «Перезапустить декомпозицию».
  4. Выбрать стратегии у двух идей → «Разложить в план» → список из двух новых целей со ссылками;
     по ссылке открывается `/planner/goal?id=…` с этапом и шагами.
  5. Повторная раскладка → `SELECT count(*) FROM planner_steps WHERE goal_id=<цель>` не растёт
     (этапы пересозданы, не продублированы), количество целей не растёт.
  6. Повторный «Декомпозиция» → в БД одна строка `kind='goal_decomposition'` на эту цель.
  7. Регрессия: `/short-analysis`, `/api/analysis/exists`, `/results` показывают обычный анализ,
     в сайдбаре интервью нет «Декомпозиция цеи».
  8. Идея декомпозиции с названием, совпадающим с существующей целью → вставка не падает
     (ветка `23505`), цель переиспользована.

## Риски

- **`kind` по умолчанию `'short'`** — обязателен. Если добавить колонку как NULL-able, записи
  `interview/analyze` и `all-interviews` (которые `kind` не передают) выпадут из фильтра
  `.eq('kind','short')` и `/results` потеряет результаты. `NOT NULL DEFAULT 'short'` в миграции
  обязателен.
- **Прогресс теряется** при повторной раскладке — следствие решения «пересоздавать этапы».
  Для целей, созданных из декомпозиции, это приемлемо: пользователь их ещё не вёл. Если
  понадобится сохранять — вернуться к upsert-логике
  `app/api/short-analysis/plan/route.ts:364-417`.
- **Нарушение `UNIQUE(client_uuid, title)`** при совпадении названий — обрабатывается
  отдельной веткой (задача 4, п.2). Без неё 500.
- **Дублирование парсера** (~170 строк в новом роуте) — сознательно, по решению не рефакторить
  существующие файлы. Пометить комментарием как временное.
- `interview` без `NOT NULL` на `active`: вставляем только `code, name, prompt, visible`.

## Вне области

- Реальная проверка подписки (заглушка `true`).
- Чистка дублирования парсера в 4 существующих роутах.
- Прогресс шагов на странице идеи (живёт в `/planner/goal`).
- Связь новых целей с исходной идеей кроме `source_analysis_id`.
