ALTER TABLE subscription_tiers
  ADD COLUMN IF NOT EXISTS payment_url TEXT,
  ADD COLUMN IF NOT EXISTS tribute_subscription_id INTEGER,
  ADD COLUMN IF NOT EXISTS tribute_tier_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_tiers_tribute_subscription_id
  ON subscription_tiers(tribute_subscription_id)
  WHERE tribute_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_tiers_tribute_tier_id
  ON subscription_tiers(tribute_tier_id)
  WHERE tribute_tier_id IS NOT NULL;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

UPDATE clients
SET updated_at = created_at
WHERE updated_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_telegram_user_id_unique
  ON clients(telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS telegram_binding_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID NOT NULL REFERENCES clients(client_uuid) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_binding_tokens_token_hash
  ON telegram_binding_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_telegram_binding_tokens_client_uuid
  ON telegram_binding_tokens(client_uuid);

CREATE INDEX IF NOT EXISTS idx_telegram_binding_tokens_expires_at
  ON telegram_binding_tokens(expires_at)
  WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid UUID NOT NULL REFERENCES clients(client_uuid) ON DELETE CASCADE,
  subscription_tier_id UUID REFERENCES subscription_tiers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  renewal_period TEXT,
  external_subscription_id TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_one_active_per_client
  ON memberships(client_uuid)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_memberships_client_uuid_status
  ON memberships(client_uuid, status);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS subscription_period TEXT,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS paid_currency TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_provider_payment_id
  ON transactions(provider_payment_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_provider_event_id
  ON transactions(provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_telegram_user_id
  ON transactions(telegram_user_id);

ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_binding_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE memberships DISABLE ROW LEVEL SECURITY;
