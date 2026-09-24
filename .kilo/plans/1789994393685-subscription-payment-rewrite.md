# План: перезапуск оплаты подписки через Telegram и Tribute

## Цель

Реализовать безопасный сквозной flow оплаты подписки:

1. Определить Telegram ID текущего пользователя только на backend.
2. Поддержать два способа привязки: Telegram Bot `/start` и Telegram Login Widget с проверкой `hash`.
3. После привязки открыть ссылку `payment_url` выбранного уровня подписки.
4. Обработать Tribute webhook, сохранить платёж и активную подписку в БД.
5. Не доверять `telegram_id` или признаку оплаты, пришедшим из React.
6. После webhook текущий браузер должен загрузить состояние именно своего `client_uuid` из БД и показать подтверждение.

## Принятые решения

- Текущая идентификация пользователя остаётся по `client_uuid` из cookie/localStorage. Сервер проверяет, что клиент существует.
- Telegram ID берётся только из проверенного Telegram-события:
  - Bot: `message.from.id` из Telegram webhook.
  - Login Widget: `user.id` после backend-проверки `hash`.
- Данные сессии для UI хранятся в localStorage: `telegram_id`, `subscription_tier`, `subscription_period`, `subscription_expires_at`. Это кэш; источник истины — БД.
- Платёж и доступ разделены:
  - `transactions` — факт оплаты и данные провайдера.
  - `memberships` — активный доступ, срок и период.
- На одного клиента действует одна активная membership. Повторная оплата обновляет её срок.
- Tribute webhook не использует текущего пользователя браузера. Он находит клиента по `telegram_user_id`, поэтому оплата другого Telegram-аккаунта не активирует текущую сессию.
- Для Login Widget используется одноразовый токен привязки, связанный с `client_uuid`; прямой `client_uuid` в `state` не используется.

## Текущие проблемы, которые нужно устранить

- `app/api/subscriptions/create/route.ts` сразу создаёт оплату со статусом `paid`, не создаёт внешний платёж и возвращает `/results`.
- `app/api/subscriptions/webhook/route.ts` доверяет `client_uuid` и `status` из тела запроса и обновляет последнюю транзакцию клиента.
- `app/payment-callback/page.tsx` читает Supabase напрямую из браузера.
- В `subscription_tiers` нет `payment_url` и внешнего идентификатора уровня Tribute.
- Таблицы `memberships` и одноразовых токенов привязки нет.
- `results` и `results/idea` считают подписку оплаченной по `localStorage.subscription_tier`.
- Серверный Supabase-клиент не использует service-role ключ; webhook не сможет надёжно записывать данные при включённом RLS.

## 1. Миграция БД

Создать новую миграцию в `supabase/migrations/`.

### `subscription_tiers`

Добавить:

- `payment_url TEXT` — ссылка на оплату Tribute, возвращаемая backend после создания pending-транзакции.
- `tribute_subscription_id INTEGER UNIQUE` — `payload.subscription_id` из Tribute, сопоставляющий внешнюю подписку с локальным тарифом.
- `tribute_tier_id INTEGER UNIQUE NULL` — опциональный legacy-ID для старых webhook, где `subscription_name` имеет префикс `XXX_...`.

Если в целевой БД уже используется имя `tier_id`, использовать его; в текущей миграции такого поля нет. Для нового payload с `subscription_id` предпочтителен `tribute_subscription_id`.

### `clients`

- Оставить `telegram_user_id BIGINT`, `telegram_username TEXT`, `telegram_first_name TEXT`, `telegram_chat_id BIGINT`.
- Добавить уникальный индекс на `telegram_user_id`, чтобы один Telegram ID не мог быть привязан к нескольким клиентам.

### `telegram_binding_tokens`

Создать таблицу:

- `id UUID PRIMARY KEY`
- `client_uuid UUID NOT NULL REFERENCES clients(client_uuid) ON DELETE CASCADE`
- `token_hash TEXT NOT NULL UNIQUE`
- `expires_at TIMESTAMPTZ NOT NULL`
- `used_at TIMESTAMPTZ`
- `created_at TIMESTAMPTZ DEFAULT now()`

Хранить хэш токена, а не сам токен. Срок жизни — короткий, например 10 минут. Токен используется одним из двух способов привязки и после успешного использования помечается `used_at`.

### `memberships`

Создать таблицу:

- `id UUID PRIMARY KEY`
- `client_uuid UUID NOT NULL REFERENCES clients(client_uuid) ON DELETE CASCADE`
- `subscription_tier_id UUID REFERENCES subscription_tiers(id)`
- `status TEXT NOT NULL DEFAULT 'active'`
- `started_at TIMESTAMPTZ NOT NULL`
- `expires_at TIMESTAMPTZ`
- `renewal_period TEXT`
- `external_subscription_id TEXT`
- `updated_at TIMESTAMPTZ DEFAULT now()`

Добавить индекс/ограничение для одной активной записи на клиента. Старую активную запись при продлении обновлять, а не создавать дубль.

### `transactions`

Добавить явные поля:

- `telegram_user_id BIGINT`
- `subscription_period TEXT`
- `paid_amount NUMERIC(10,2)`
- `paid_currency TEXT`
- `paid_at TIMESTAMPTZ`
- `expires_at TIMESTAMPTZ`
- `provider_event_id TEXT`

`amount`/`currency` оставить для совместимости; при Tribute webhook записывать в оба набора полей. `metadata` использовать для полного безопасного payload без токенов и секретов.

Добавить индексы:

- `transactions(provider_payment_id)`
- `transactions(provider_event_id)`
- `transactions(telegram_user_id)`
- `memberships(client_uuid, status)`

### RLS и серверный доступ

- Тарифы можно читать через anon-клиент только если политика разрешает активные записи.
- Записи клиентов, транзакций, membership и токенов должны обрабатываться серверным client с `SUPABASE_SERVICE_ROLE_KEY`.
- Не включать RLS-политики, которые разрешают произвольную запись транзакций по переданному `client_uuid`.
- Не выводить service-role ключ в браузер.

## 2. Общие backend-утилиты

Создать серверные helpers в `lib/`:

### Telegram Login Widget

Функция проверки:

- принимает объект без `hash`;
- проверяет наличие `auth_date`;
- отклоняет данные старше 86400 секунд;
- сортирует оставшиеся ключи по имени;
- формирует `key=value` через `\n`;
- вычисляет SHA-256 от `BOT_TOKEN`;
- вычисляет HMAC-SHA256 строки проверки;
- сравнивает через timing-safe compare.

Не изменять входной объект и не брать `user.id` из React как доверенное значение.

### Tribute signature

- Читать raw body до `JSON.parse`.
- Читать заголовок `trbt-signature`.
- Вычислить HMAC-SHA256 raw body ключом `TRIBUTE_API_KEY`.
- Сравнивать подписи через timing-safe compare.
- Обрабатывать только событие `new_subscription`.

## 3. API-контракты

### `GET /api/subscriptions/tiers`

Возвращает активные тарифы, включая:

- `id`, `name`, `description`, `price`, `currency`;
- `payment_url`;
- `tribute_subscription_id`;
- `tribute_tier_id` при необходимости legacy-сопоставления.

### `GET /api/subscriptions/session?client_uuid=...`

Проверяет существование клиента и возвращает:

- `clientUuid`;
- `telegramUserId` или `null`;
- `telegramLinked: boolean`;
- `membership` с `isPaid`, `status`, `period`, `startedAt`, `expiresAt`, `tier`;
- безопасные значения для обновления localStorage.

### `POST /api/telegram/bindings`

Вход: `{ client_uuid }`.

- Проверяет клиента.
- Создаёт одноразовый токен.
- Возвращает:
  - `token`;
  - `botUrl` вида `https://t.me/<bot>?start=<token>`;
  - `loginWidgetAuthUrl` для callback Telegram Login Widget;
  - `expiresAt`.

### `POST /api/telegram/webhook`

Обрабатывает Telegram Bot Update:

- берёт `message.from.id`, `message.from.username`, `message.from.first_name`, `message.chat.id`;
- разбирает `/start <token>`;
- проверяет токен, срок и `used_at`;
- связывает `message.from.id` с `client_uuid` из токена;
- обновляет `clients.telegram_user_id` и профильные поля;
- помечает токен использованным;
- отправляет подтверждение через Bot API;
- возвращает `200` даже для служебных Telegram-событий, которые не относятся к привязке.

Текущая логика, где пользователь вручную отправляет UUID, удаляется или остаётся только как fallback без права записи Telegram ID без токена.

### `GET /api/telegram/login`

Callback Telegram Login Widget:

- принимает `id`, `first_name`, `username`, `auth_date`, `hash` и другие поля виджета.
- Проверяет токен и `hash` на backend.
- Связывает `user.id` с клиентом из токена.
- Помечает токен использованным.
- Перенаправляет на `/tariffs?telegram=linked`.

### `POST /api/subscriptions/create`

Вход: `{ client_uuid, subscriptionTierId }`.

- Проверяет клиента и активный тариф.
- Проверяет, что у клиента уже есть `telegram_user_id`; React не может передать его вместо БД.
- Проверяет наличие `payment_url`.
- Создаёт `transactions` со статусом `pending`, провайдером `tribute`, idempotency key и серверным `transactionId`.
- Возвращает `{ confirmationUrl: payment_url, transactionId, paymentId }`.

Не открывать и не возвращать URL, не сохранённый в БД.

### `POST /api/subscriptions/tribute-webhook`

Ожидаемый payload Tribute:

```json
{
  "name": "new_subscription",
  "created_at": "...",
  "sent_at": "...",
  "payload": {
    "subscription_name": "...",
    "subscription_id": 1644,
    "period_id": 1547,
    "period": "monthly",
    "price": 1000,
    "amount": 700,
    "currency": "eur",
    "trb_user_id": "T-31326",
    "telegram_user_id": 12321321,
    "telegram_username": "durov",
    "channel_id": 614,
    "channel_name": "lbs",
    "expires_at": "...",
    "type": "regular"
  }
}
```

- Проверяет `trbt-signature` по raw body.
- Проверяет структуру payload:
  - `telegram_user_id`;
  - `amount`;
  - `currency`;
  - `period`;
  - `subscription_name` или `subscription_id`;
  - при наличии `expires_at`.
- Находит клиента по `clients.telegram_user_id`.
- Сопоставляет тариф в следующем порядке: точный `payload.subscription_id` с `subscription_tiers.tribute_subscription_id`; затем legacy-префикс `subscription_name` с `tribute_tier_id`. Если сопоставления нет, webhook отклоняется.
- Создаёт или обновляет транзакцию идемпотентно по `provider_event_id` (например, `new_subscription:${subscription_id}:${period_id}`) и/или `provider_payment_id`.
- Записывает Telegram ID, период, оплаченную сумму, валюту, дату оплаты, срок действия и полный payload в metadata.
- Создаёт или обновляет membership:
  - `status = active`;
  - `started_at` — дата успешного события или `paid_at`;
  - `expires_at` — доверенное `payload.expires_at`, если оно валидно;
  - fallback по периоду: `weekly`, `monthly`, `3months`, `6month`, `yearly`, `once`/`onetime`;
  - `renewal_period` — человекочитаемое значение для popup.
- Возвращает `200` после фиксации БД.

### `GET /api/subscriptions/status?client_uuid=...`

- Загружает только membership текущего `client_uuid`.
- Считает подписку оплаченной только если `status = active` и `expires_at` не истёк.
- Возвращает период и срок для UI.

Этот endpoint должен заменить прямой Supabase-запрос из `payment-callback`.

## 4. Frontend flow

### `/tariffs`

1. Загружает `client_uuid` из существующего localStorage/cookie.
2. Загружает `/api/subscriptions/session`.
3. Показывает тарифы только после получения состояния.
4. При нажатии «Оплатить» без привязки:
   - вызывает `POST /api/telegram/bindings`;
   - показывает popup с точным текстом: `сейчас откроется окно Telegram-бота. нажмите в окне Start`;
   - открывает `botUrl` в новой вкладке;
   - опрашивает session/status до появления `telegramUserId` в БД.
5. После привязки вызывает `/api/subscriptions/create`.
6. Открывает `confirmationUrl` из ответа в новой вкладке.
7. Переходит/оставляет пользователя на callback для ожидания webhook.

### `TelegramLinkDialog`

- Принимает `botUrl`, `loginWidgetAuthUrl`, `expiresAt` и состояние привязки.
- Не принимает и не отображает доверенный `telegram_id` от React.
- Показывает инструкцию и состояние ожидания.
- После успешной привязки разрешает создание платежа.

### `SubscriptionPurchaseButton`

- Убирает локальное присвоение `subscription_tier = paid` до получения ответа БД.
- Не открывает payment URL до pending-транзакции.
- Обрабатывает отсутствие `payment_url` и ошибки API.
- Передаёт управление callback/поллингу.

### `/payment-callback`

- Получает `transactionId` из query.
- Через `/api/subscriptions/status` проверяет состояние текущего `client_uuid`, а не читает Supabase напрямую.
- После `isPaid = true`:
  - обновляет localStorage-кэш;
  - показывает popup `подписка оплачена на {срок подписки}`;
  - предлагает перейти к результатам.
- При отсутствии оплаты продолжает polling с ограниченным интервалом и показывает ошибку/повторную проверку.

### `/results` и `/results/idea`

- Загружают `/api/subscriptions/session` при монтировании.
- Используют React state как кэш, а не `localStorage.subscription_tier` как источник истины.
- Обновляют состояние при возврате из callback.
- Все действия, требующие подписки, проверяют `isPaid` из backend response.
- Удалить текущие функции `getSubscriptionTier()` и локальную запись `paid` как механизм авторизации.

## 5. Безопасность и edge cases

- Никогда не принимать `telegram_id` из тела React-запроса как доверенный идентификатор.
- Login Widget `hash` проверяется только на backend; `auth_date` ограничен 24 часами.
- Tribute signature проверяется по raw body, не по повторно сериализованному JSON.
- Одноразовый токен привязки имеет короткий срок, уникален и не логируется.
- Повторный Tribute webhook не должен создавать вторую транзакцию или продлевать подписку дважды.
- Webhook для неизвестного Telegram ID возвращает ошибку и не создаёт membership.
- Если платёж сделан Telegram-аккаунтом B, membership активируется только у клиента B; браузер клиента A после polling остаётся неоплаченным.
- Конфликт привязки: если Telegram ID уже привязан к другому клиенту, не перезаписывать владельца.
- Истёкшую membership считать неактивной и не показывать popup об оплате.
- Не логировать `BOT_TOKEN`, `TRIBUTE_API_KEY`, service-role ключ и полные подписи.

## 6. Конфигурация

Добавить/проверить переменные окружения без коммита секретов:

- `BOT_TOKEN`
- `NEXT_PUBLIC_TELEGRAM_BOT_URL`
- `TRIBUTE_API_KEY`
- `FRONTEND_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

После деплоя:

- настроить Telegram webhook на `/api/telegram/webhook`;
- настроить Tribute webhook на `/api/subscriptions/tribute-webhook`;
- заполнить `payment_url` и `tribute_subscription_id` (и `tribute_tier_id` для legacy) для активных тарифов;
- проверить, что серверный Supabase client использует service-role ключ.

## 7. Валидация

Выполнить:

- `npm run lint`
- `npm run build`
- `npx tsc --noEmit`

Ручные и интеграционные сценарии:

1. Bot `/start` с валидным токеном: Telegram ID появляется в `clients` и session API.
2. Login Widget с валидным `hash`: `user.id` появляется в `clients`; просроченный/неверный hash отклоняется.
3. Создание платежа без Telegram ID блокируется.
4. Создание платежа с Telegram ID возвращает pending-транзакцию.
5. Tribute webhook обрабатывается с валидной подписью.
6. Повторный webhook не создаёт вторую транзакцию.
7. Tribute webhook с неизвестным Telegram ID не создаёт membership.
8. Повторная доставка одного webhook не удваивает оплату и срок.
9. Оплата аккаунта B не активирует аккаунт A; A получает `isPaid = false`.
10. Callback обновляет localStorage и показывает период из БД.
11. Истёкшая подписка не даёт доступ к защищённым действиям.

## Границы реализации

- Не менять общую архитектуру клиентского `client_uuid` за пределами подписки.
- Не добавлять новую систему пользовательской авторизации.
- Не коммитить `.env.local` и не выводить секреты в ответы API/логи.
