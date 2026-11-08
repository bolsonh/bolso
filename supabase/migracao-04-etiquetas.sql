-- Bolso: atualização 04, etiquetas (ponto 7 da planilha).
-- Cole no Supabase: SQL Editor > New query > Run.
-- É só acrescentar: uma coluna nova no lançamento (vazia nos lançamentos de hoje).
-- Nenhum lançamento, cartão ou conta fixa é apagado ou alterado. Pode rodar de novo sem medo.

alter table public.transactions add column if not exists tag text;
