-- Seed: interview table data
-- Заполняет таблицу interview текущими данными

INSERT INTO interview (id, code, name, active) VALUES
  ('00000000-0000-0000-0000-000000000001', 'default', 'Икигай-коуч: адаптивное интервью', true)
ON CONFLICT (code) WHERE active = true DO NOTHING;

-- Добавьте дополнительные записи здесь по необходимости:
-- INSERT INTO interview (id, code, name, active) VALUES
--   ('uuid-here', 'code-here', 'Name here', true)
-- ON CONFLICT (code) WHERE active = true DO NOTHING;