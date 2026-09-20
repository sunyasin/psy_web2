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

COMMENT ON TABLE subscription_tiers IS 'Единственный тарифный план';

-- Вставляем единственный тариф
INSERT INTO subscription_tiers (id, name, description, price, currency, is_active)
VALUES (
  gen_random_uuid(),
  'standard',
  'Неограниченный чат с моделью',
  500,
  'RUB',
  true
)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid TEXT NOT NULL,
  subscription_tier_id UUID REFERENCES subscription_tiers(id) ON DELETE SET NULL,
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

COMMENT ON TABLE transactions IS 'Транзакции оплат подписок';

CREATE INDEX IF NOT EXISTS idx_transactions_client_uuid ON transactions(client_uuid);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_idempotency ON transactions(idempotency_key);

ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_username TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_first_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;
