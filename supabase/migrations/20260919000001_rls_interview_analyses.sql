-- 20260919000001_rls_interview_analyses.sql
-- RLS политики для таблиц, используемых в /api/results

-- Включаем RLS (если не включен) и создаём permissive политики
-- Service Role Key всё равно обойдёт RLS, но политики нужны для корректной работы
-- с обычными клиентами (если будут добавлены в будущем)

ALTER TABLE IF EXISTS public.interview_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Чтение анализов по client_uuid"
ON public.interview_analyses FOR SELECT
USING (client_uuid::text = auth.uid()::text);

CREATE POLICY "Вставка анализов по client_uuid"
ON public.interview_analyses FOR INSERT
WITH CHECK (client_uuid::text = auth.uid()::text);

ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Чтение транзакций по client_uuid"
ON public.transactions FOR SELECT
USING (client_uuid = auth.uid()::text);

CREATE POLICY "Вставка транзакций по client_uuid"
ON public.transactions FOR INSERT
WITH CHECK (client_uuid = auth.uid()::text);
