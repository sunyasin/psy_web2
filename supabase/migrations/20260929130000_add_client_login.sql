-- Email убран из проекта: идентификация пользователя идёт по произвольному логину.
-- Supabase Auth оперирует только email, поэтому служебный адрес вычисляется из
-- логина (lib/authIdentity.ts -> loginToAuthEmail) и в БД не хранится.

-- 1. Логин — единственный идентификатор аккаунта.
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS login TEXT;

-- Перенос ранее зарегистрированных клиентов: их логином был email.
-- Выполняется, только если колонка email ещё есть (идемпотентность).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'email'
  ) THEN
    -- Дубликаты пропускаются, чтобы не сломать уникальный индекс.
    UPDATE clients
    SET login = lower(trim(email))
    WHERE email IS NOT NULL
      AND login IS NULL
      AND lower(trim(email)) IN (
        SELECT lower(trim(email))
        FROM clients
        WHERE email IS NOT NULL
        GROUP BY lower(trim(email))
        HAVING count(*) = 1
      );

    DELETE FROM clients a
    USING clients b
    WHERE a.login IS NOT NULL
      AND a.login = b.login
      AND a.ctid > b.ctid;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_login_unique
  ON clients(login)
  WHERE login IS NOT NULL;

-- 2. Email больше не используется.
ALTER TABLE clients
  DROP COLUMN IF EXISTS auth_email,
  DROP COLUMN IF EXISTS email;

DROP INDEX IF EXISTS idx_clients_auth_email_unique;
