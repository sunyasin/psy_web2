# Plan: Реализация оплаты тарифов и Telegram интеграции на странице tariffs

## Контекст
Страница `/tariffs` в `qwiz-goal-agent` содержит только статический список тарифов с localStorage и редиректом. По аналогии с бэкап-проектом (`univer_backup_before_types`) нужно реализовать полноценный флоу оплаты тарифов и интеграцию с Telegram ботом. Обновлено ТЗ (`plans/TARIFFS_PAYMENT_TELEGRAM_TZ.md`): одна подписка, одна цена, без Free, с пошаговой инструкцией по настройке вне кода.

## Ограничения
- Без полноценной аутентификации (используется `client_uuid`)
- Без платёжного провайдера (без YooKassa) — MVP флоу через Telegram бот
- Одна подписка, одна цена, без Free тарифа
- Используется Next.js App Router, Supabase (без Auth), Tailwind CSS v4

---

## Задачи

### 1. Миграция БД
**Файл:** `supabase/migrations/20260919000000_add_subscriptions.sql`
- Создать таблицу `subscription_tiers`: id, name, description, price (DECIMAL 500), currency, is_active
- Вставить единственный тариф: name='standard', description='Неограниченный чат с моделью', price=500
- Создать таблицу `transactions`: id, client_uuid, subscription_tier_id, amount, currency, status, provider, provider_payment_id, idempotency_key, description, metadata, created_at
- Добавить в `clients`: telegram_user_id (BIGINT), telegram_username (TEXT)
- Настроить RLS политики (чтение тарифов — для всех, транзакции — для своего client_uuid)

### 2. API клиент для фронтенда
**Файл:** `app/lib/subscriptionsApi.ts`
- `createSubscription(subscriptionTierId, returnUrl?)` → POST `/api/subscriptions/create` → `{ confirmationUrl, transactionId }`
- `getMemberships()` → GET `/api/subscriptions/memberships` → `{ memberships: [...] }`

### 3. Серверные API маршруты
- **`app/api/subscriptions/create/route.ts`:**
- Принимает `{ subscriptionTierId }`
- Валидирует тариф (существует, is_active=true)
- Создаёт транзакцию (status: pending → для MVP: сразу succeeded для простоты)
- Возвращает `{ confirmationUrl, transactionId }`
- Для MVP: confirmationUrl = `/payment-callback?transactionId=...`
- Оплата через Telegram бот: при отсутствии telegram_user_id пользователь получает инструкцию с переходом в бот для оплаты

**`app/api/subscriptions/memberships/route.ts`:**
- Возвращает активные подписки по `client_uuid`

**`app/api/telegram/webhook/route.ts`:**
- POST с данными от Telegram (message.from.id, message.text)
- Команда /start или UUID → привязывает telegram_user_id к clients записи по client_uuid
- Отправка confirmation через Bot API (`https://api.telegram.org/bot{BOT_TOKEN}/sendMessage`)
- При получении payment confirmation от бота → обновляет транзакцию (succeeded) и создаёт подписку

### 4. Компоненты
**`app/components/SubscriptionPurchaseButton.tsx`:**
- Props: `subscriptionTierId`, `tierName`, `price` (500 ₽)
- При клике: если нет telegram_user_id → диалог TelegramLinkDialog
- Иначе: вызывает `subscriptionsApi.createSubscription()`, редирект на confirmationUrl
- Loading state с spinner, error через toast

**`app/components/SubscriptionTiersList.tsx`:**
- Загружает активные тарифы из Supabase (`subscription_tiers`, is_active=true)
- Карточка: имя, цена, кнопка подписки
- Синхронизирует с активным членством через `subscriptionsApi.getMemberships()`

**`app/components/TelegramLinkDialog.tsx`:**
- Диалог: "Для оплаты нужно привязать Telegram"
- Показывает client_uuid для отправки в бот
- Кнопка "Перейти в бот" → `window.open(telegramBotUrl, '_blank')`
- Кнопка "Отмена"

### 5. Страницы
**`app/tariffs/page.tsx` (переписать):**
- Использует `SubscriptionTiersList`
- Динамическая загрузка тарифов из БД
- Убрать hardcoded массив и localStorage как единственный хранитель тарифа

**`app/payment-callback/page.tsx` (опционально):**
- Получает `transactionId` из query
- Поллинг статуса транзакции через Supabase
- Показывает результат → редирект на `/results`

### 6. Вне кода проекта (настройка)
**Выполнить до запуска:**
1. Создать Telegram бот через `@BotFather`, получить BOT_TOKEN
2. Получить Chat ID через `getUpdates` API
3. Заполнить `.env`: BOT_TOKEN, NEXT_PUBLIC_TELEGRAM_BOT_URL
4. Настроить webhook Telegram (или использовать polling)
5. Настроить RLS в Supabase
6. Развернуть бэкенд/функцию для обработки Telegram webhook (Supabase Functions, n8n, или отдельный сервер)

### 7. Переменные окружения (`.env`)
- `BOT_TOKEN` — токен Telegram бота
- `NEXT_PUBLIC_TELEGRAM_BOT_URL` — URL бота для перехода
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — уже используютсяся

---

## Поток оплаты (MVP)
1. Пользователь на `/tariffs` → загружаются тарифы из БД
2. Нажимает "Оплатить" → проверяется telegram_user_id
3. Нет Telegram → диалог привязки → переход в бот → /start → бот подтверждает оплату
4. Telegram webhook получает confirmation → API create → транзакция succeeded → редирект на `/results`
5. Есть Telegram (уже привязан) → API create → транзакция → редирект на `/results`

## Валидация
1. `npm run dev` — `/tariffs` загружает тарифы из БД
2. Выбор тарифа → редирект на `/results`, тариф сохранён в транзакции
3. Проверить что `subscriptionTier` в localStorage совпадает с выбранным
4. Telegram webhook: отправить /start боту → проверить что telegram_user_id в БД
5. Без Telegram: диалог привязки появляется при попытке оплаты
