# ТЗ: Реализация оплаты тарифных планов и интеграции с Telegram ботом на странице tariffs

## 1. Общее описание

Страница `/tariffs` в текущем проекте (`qwiz-goal-agent`) содержит только статический список тарифов с сохранением выбранного тарифа в `localStorage` и перенаправлением на `/results`. Не реализована оплата, нет серверной валидации тарифа, отсутствует интеграция с Telegram ботом.

Цель: реализовать на странице `/tariffs` полноценный флоу выбора и оплаты тарифа по аналогии с бэкап-проектом (`univer_backup_before_types`), включая взаимодействие с Telegram ботом для привязки пользователя при оплате.

---

## 2. Текущее состояние

### 2.1 Страница tariffs (`app/tariffs/page.tsx`)
- Статический массив тарифов (А, Б, В) в компоненте
- Кнопка "Выбрать" сохраняет тариф в `localStorage` и редиректит на `/results`
- Нет серверного API для создания платежа
- Нет проверки подписки на сервере

### 2.2 Хранение тарифа
- Тариф хранится только в `localStorage`
- В `app/results/page.tsx` и `app/results/idea/page.tsx` проверяется `subscriptionTier !== "paid"` для ограничения функционала
- Нет таблицы в БД для подписок

### 2.3 Telegram
- Есть заглушка `app/api/send/telegram/route.ts` (логирование без отправки)
- Есть заглушка в `app/api/booking/consultation/route.ts` (логирование без отправки)
- Нет бота, нет привязки telegram_user_id к пользователю

### 2.4 Идентификация пользователя
- Без аутентификации, используется `client_uuid` из localStorage/cookies
- Нет таблицы `clients` с полями для Telegram

---

## 3. Анализ реализации в бэкап-проекте (univer_backup_before_types)

### 3.1 Схема БД для подписок
- **subscription_tiers**: id, community_id, name, slug, description, price_monthly, price_yearly, currency, is_free, is_active, features, sort_order
- **memberships**: user_id, community_id, subscription_tier_id, status, started_at, expires_at, renewal_period, external_subscription_id
- **transactions**: user_id, community_id, subscription_tier_id, amount, currency, status, provider, provider_payment_id, idempotency_key, description, metadata

### 3.2 Флоу оплаты (YooKassa)
1. Пользователь выбирает тариф → `paymentsApi.createSubscription({ communityId, subscriptionTierId, returnUrl })`
2. Backend: валидация тарифа (существует, активен) → создание транзакции (status: pending) → вызов YooKassa API → возврат confirmationUrl
3. Frontend: редирект на страницу оплаты YooKassa
4. YooKassa webhook: payment.succeeded → обновление транзакции (status: succeeded), создание/обновление membership (status: active, expires_at + 1 месяц)
5. Пользователь возвращается на Payment Callback, где отображается результат

### 3.3 Telegram бот интеграция
1. **`get-telegram-id`** (Supabase Function): HTTP-функция, принимающая сообщения от Telegram бота. При /start или получении UUID профиля — привязывает `telegram_user_id` к записи в `profiles`. Используется `BOT_TOKEN` для отправки сообщений через Telegram Bot API.
2. **`tribute-webhook`** (Supabase Function): Webhook от провайдера Tribute, принимает подписи с `trbt-signature`, находит пользователя по `telegram_user_id`, создаёт транзакцию и membership.
3. **Frontend (CoursesTab.tsx)**: При попытке оплаты без привязанного Telegram — диалог с инструкцией и кнопкой открытия `https://t.me/univer_skool_bot`.

### 3.4 Ключевые компоненты
- **SubscriptionPurchaseButton**: Кнопка "Subscribe for X ₽/month", вызывает `paymentsApi.createSubscription`, редиректит на confirmationUrl
- **SubscriptionTiersList**: Сетка карточек тарифов с ценами, фичами, кнопками покупки
- **PaymentCallback**: Страница ожидания/результата, поллинг статуса транзакции

---

## 4. Предлагаемая реализация для страницы tariffs (qwiz-goal-agent)

### 4.1 Модель подписок (обновлено)

**Одна подписка, одна цена, без Free:**
- Один платный тариф: **500 ₽/мес**
- Описание: **Неограниченный чат с моделью**
- Без бесплатного тарифа — все функции доступны только по подписке
- Без иерархии тарифов — один план для всех
- Без опций внутри подписки — фиксированный набор возможностей

**Таблица `subscription_tiers` (упрощённая):**
```sql
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'standard',
  description TEXT,
  price DECIMAL(10, 2) NOT NULL DEFAULT 500,
  currency TEXT DEFAULT 'RUB',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.2 Необходимые изменения в БД (Supabase migrations)

**Таблица `subscription_tiers`:**
```sql
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'standard',
  description TEXT,
  price DECIMAL(10, 2) NOT NULL DEFAULT 500,
  currency TEXT DEFAULT 'RUB',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Таблица `transactions`:**
```sql
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid TEXT NOT NULL,
  subscription_tier_id UUID REFERENCES subscription_tiers(id),
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'RUB',
  status TEXT DEFAULT 'pending',
  provider TEXT DEFAULT 'internal',
  provider_payment_id TEXT,
  idempotency_key TEXT UNIQUE,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Расширение `clients` (при необходимости Telegram):**
```sql
ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_username TEXT;
```

### 4.3 Серверные API маршруты (Next.js Route Handlers)

**`app/api/subscriptions/create/route.ts`** — аналог `POST /api/payments/create-subscription`:
- Принимает `{ subscriptionTierId, returnUrl }`
- Валидирует тариф (существует, активен)
- Создаёт запись в `transactions` (status: pending, idempotency_key)
- **ВАЖНО**: Поскольку в текущем проекте нет YooKassa, реализовать один из вариантов:
  - **Вариант A (рекомендуемый для MVP)**: Для простоты — сразу создаёт транзакцию со статусом succeeded и возвращает `/results` как confirmationUrl
  - **Вариант B**: Интеграция с ЮKассой (потребует YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY)
  - **Вариант C**: Перенаправление в Telegram бот для оплаты через Tribute
- Возвращает `{ confirmationUrl, transactionId, paymentId }`

**`app/api/subscriptions/webhook/route.ts`** — обработка webhook от платёжного провайдера:
- Обновляет статус транзакции
- Создаёт/обновляет подписку (membership)

**`app/api/subscriptions/memberships/route.ts`** — аналог `GET /api/payments/memberships`:
- Возвращает подписки клиента по `client_uuid`

### 4.4 Интеграция с Telegram ботом

**`app/api/telegram/webhook/route.ts`** — webhook от Telegram бота (аналог `get-telegram-id`):
- Принимает POST-запрос с данными от Telegram (message.from.id, message.text)
- При команде `/start` — привязывает `telegram_user_id` к `clients` записи
- При получении UUID профиля — привязывает к соответствующей записи
- Использует `BOT_TOKEN` из переменных окружения для отправки сообщений через `https://api.telegram.org/bot{BOT_TOKEN}/sendMessage`
- Ответ пользователю в Telegram с инструкциями или подтверждением

**`app/api/send/telegram/route.ts`** — обновить заглушку:
- Реализовать отправку сообщения через Telegram Bot API
- Использовать `BOT_TOKEN` из `.env`

### 4.5 Компоненты на фронтенде

**`components/SubscriptionPurchaseButton.tsx`** — кнопка оплаты:
- Props: `subscriptionTierId`, `tierName`, `price`
- При клике: проверяет, привязан ли Telegram (если требуется)
  - Если не привязан → показывает диалог с переходом в Telegram бот (`https://t.me/...`)
  - Если привязан → вызывает `paymentsApi.createSubscription()`
  - Редиректит на `confirmationUrl`
- Состояние: loading (спиннер), error (toast)

**`components/SubscriptionTiersList.tsx`** — список тарифов:
- Загружает активные тарифы из `subscription_tiers` через Supabase
- Для каждого тарифа: имя, цена, кнопка подписки
- Синхронизирует с активным членством через `paymentsApi.getMemberships`
- Бейдж "Current" для текущего тарифа

**`components/TelegramLinkDialog.tsx`** — диалог привязки Telegram:
- Отображается при попытке оплаты без привязанного Telegram
- Текст инструкции (RU/EN): "Для оплаты нужно привязать Telegram..."
- Отображает UUID клиента для отправки в бот
- Кнопка "Перейти в бот" → `window.open(telegramBotUrl, '_blank')`
- Кнопка "Отмена"

### 4.6 Страницы

**`app/tariffs/page.tsx`** (переписать):
- Использует `SubscriptionTiersList`
- Динамически загружает тарифы из БД
- Убрана заглушка с `localStorage` как единственным хранилищем
- После успешной оплаты → редирект на `/results`

**`app/payment-callback/page.tsx`** (новая, опционально):
- Получает `transactionId` из query
- Поллинг статуса транзакции через Supabase
- Показывает результат (успех/ошибка)
- Редирект на `/results` при успехе

### 4.7 Поток оплаты (рекомендуемый MVP вариант)

```
1. Пользователь открывает /tariffs
2. Страница загружает тариф(ы) из БД (subscription_tiers)
3. Нажимает "Выбрать" / "Оплатить"
4. Проверяется привязка Telegram (если требуется)
5. Если Telegram не привязан → диалог с инструкцией и ссылкой на бот
6. Если Telegram привязан → вызывается API create-subscription
7. Сервер: создаёт транзакцию (pending) → для MVP сразу подтверждает (succeeded)
8. Редирект на /results с активным тарифом
```

---

## 5. Настройка для работы оплаты (вне кода проекта)

### 5.1 Telegram Bot Setup (пошагово)

**Шаг 1: Создать бота**
1. Открыть `https://t.me/BotFather` в Telegram
2. Отправить `/newbot`
3. Указать имя бота (например: "Qwiz Goal Agent Bot")
4. Указать username (например: `qwiz_goal_agent_bot`)
5. Скопировать полученный **BOT_TOKEN** (формат: `123456789:ABCdefGHIjklMNO...`)

**Шаг 2: Получить Chat ID для тестов**
1. Отправить сообщение боту в Telegram
2. Открыть `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates` в браузере
3. Найти `"chat":{"id":<число>}` в JSON-ответе — это Chat ID
4. Запомнить Chat ID (нужен для тестов)

**Шаг 3: Настроить webhook (для продакшена)**
1. Обеспечить HTTPS-домен (для разработки: `ngrok http 3000`)
2. Установить webhook: `https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://yourdomain.com/api/telegram/webhook`
3. Для разработки можно использовать polling вместо webhook

### 5.2 ЮKassa Setup (для реальной оплаты)

**Шаг 1: Зарегистрироваться**
1. Перейти на `https://yookassa.ru` и зарегистрировать магазин
2. Подтвердить бизнес

**Шаг 2: Получить ключи**
1. Войти в ЮKassa Dashboard → Настройки → Интеграция
2. Скопировать **Shop ID** и **Secret Key**

**Шаг 3: Настроить webhook**
1. В ЮKassa Dashboard → Настройки → Уведомления
2. Добавить URL: `https://yourdomain.com/api/subscriptions/webhook`
3. Выбрать события: `payment.succeeded`, `payment.canceled`

### 5.3 Переменные окружения (`.env`)

```env
# ===== Telegram Bot (обязательно для интеграции) =====
# Получить у BotFather в Telegram
BOT_TOKEN=123456789:ABCdefGHIjklMNO...

# URL бота для перехода пользователя (public username)
NEXT_PUBLIC_TELEGRAM_BOT_URL=https://t.me/qwiz_goal_agent_bot

# ===== ЮKassa (если планируется реальная оплата) =====
YOOKASSA_SHOP_ID=your_shop_id
YOOKASSA_SECRET_KEY=your_secret_key

# ===== Supabase (уже используются) =====
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# ===== Фронтенд =====
FRONTEND_URL=http://localhost:3000
```

### 5.4 Установка зависимостей

```bash
# Дополнительных npm зависимостей для базовой реализации НЕ требуется
# Supabase клиент и fetch уже доступны

# Если планируется YooKassa SDK (опционально):
npm install yookassa
```

### 5.5 Запуск и проверка

```bash
# 1. Применить миграцию в Supabase
# Через Supabase CLI или Dashboard SQL Editor
supabase db push
# или скопировать SQL из миграции в Dashboard

# 2. Запустить dev-сервер
npm run dev

# 3. Проверить страницу тарифов
# Открыть http://localhost:3000/tariffs

# 4. Проверить API endpoints
curl http://localhost:3000/api/subscriptions/create -X POST \
  -H "Content-Type: application/json" \
  -d '{"subscriptionTierId": "uuid-тарифа"}'

# 5. Проверить Telegram webhook
# Отправить /start боту и проверить, что telegram_user_id сохранился в БД
```

### 5.6 Настройка RLS (Row Level Security) в Supabase

```sql
-- Разрешить чтение активных тарифов всем
CREATE POLICY "Anyone can read active tiers"
ON subscription_tiers FOR SELECT
USING (is_active = true);

-- Разрешить клиентам создавать транзакции (свои)
CREATE POLICY "Users can create own transactions"
ON transactions FOR INSERT
WITH CHECK (client_uuid = auth.uid()::text);

-- Разрешить клиентам читать свои транзакции
CREATE POLICY "Users can read own transactions"
ON transactions FOR SELECT
USING (client_uuid = auth.uid()::text);
```

---

## 6. Ключевые отличия от бэкап-проекта

| Аспект | Бэкап-проект | Текущий проект |
|--------|-------------|----------------|
| Аутентификация | Supabase Auth (JWT) | Без auth, client_uuid |
| Платёжный провайдер | YooKassa | Нет (MVP — заглушка/telegram) |
| Подписки | Множество тарифов, features | Один тариф, одна цена |
| Free подписка | Есть (is_free) | Нет |
| Telegram привязка | Profiles.telegram_user_id | Clients — нет поля |
| Webhook | YooKassa webhook | Нет провайдера для webhook |

---

## 7. Структура файлов для изменений

```
qwiz-goal-agent/
├── app/
│   ├── tariffs/page.tsx                    # Переписать: динамическая загрузка тарифов
│   ├── payment-callback/page.tsx           # Новая: страница результата оплаты
│   ├── api/
│   │   ├── subscriptions/
│   │   │   ├── create/route.ts             # Создание платежа
│   │   │   ├── webhook/route.ts            # Webhook от провайдера
│   │   │   └── memberships/route.ts        # Получение подписок
│   │   ├── telegram/
│   │   │   └── webhook/route.ts            # Webhook от Telegram бота
│   │   └── send/telegram/route.ts          # Обновить: реальная отправка
│   └── lib/
│       └── subscriptionsApi.ts             # Новый: API клиент для фронтенда
├── components/
│   ├── SubscriptionPurchaseButton.tsx      # Новый: кнопка оплаты
│   ├── SubscriptionTiersList.tsx           # Новый: список тарифов
│   └── TelegramLinkDialog.tsx             # Новый: диалог привязки Telegram
├── supabase/
│   └── migrations/
│       └── 20260919000000_add_subscriptions.sql  # Новый: миграция
├── TARIFFS_PAYMENT_TELEGRAM_TZ.md          # Этот файл (ТЗ)
└── .env                                    # Обновить: добавить BOT_TOKEN и др.
```

---

## 8. Пошаговый план реализации

1. **Создать миграцию БД**: таблицы `subscription_tiers`, `transactions`; добавить поля `telegram_user_id`, `telegram_username` в `clients`
2. **Создать `app/lib/subscriptionsApi.ts`**: API клиент (createSubscription, getMemberships)
3. **Создать `app/api/subscriptions/create/route.ts`**: создание транзакции/подписки
4. **Создать `app/api/subscriptions/memberships/route.ts`**: получение подписок
5. **Создать `app/api/telegram/webhook/route.ts`**: webhook бота (привязка telegram_user_id)
6. **Обновить `app/api/send/telegram/route.ts`**: реальная отправка через Bot API
7. **Создать `components/SubscriptionPurchaseButton.tsx`**: кнопка оплаты с Telegram-проверкой
8. **Создать `components/SubscriptionTiersList.tsx`**: список тарифов из БД
9. **Создать `components/TelegramLinkDialog.tsx`**: диалог привязки Telegram
10. **Переписать `app/tariffs/page.tsx`**: интеграция компонентов, динамическая загрузка
11. **Создать `app/payment-callback/page.tsx`** (опционально): страница результата
12. **Настроить `.env`**: BOT_TOKEN, NEXT_PUBLIC_TELEGRAM_BOT_URL и др.
13. **Настроить RLS** в Supabase
14. **Тестирование**: ручное тестирование флоу
