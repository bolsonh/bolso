-- Bolso: atualização 02, fatura do cartão de crédito (item #13).
-- Cole no Supabase: SQL Editor > New query > Run.
-- É só acrescentar: três colunas novas no cartão (vazias nos cartões de hoje) e uma opção a mais na fonte do lançamento.
-- Nenhum lançamento, cartão ou conta fixa é apagado ou alterado. Pode rodar de novo sem medo.

alter table public.cards add column if not exists closing_day int check (closing_day between 1 and 31);
alter table public.cards add column if not exists due_day     int check (due_day between 1 and 31);
alter table public.cards add column if not exists pay_source  text check (pay_source in ('salario', 'vale', 'outra'));

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.transactions'::regclass and conname = 'transactions_source_check'
      and pg_get_constraintdef(oid) not like '%definir%'
  ) then
    alter table public.transactions drop constraint transactions_source_check;
    alter table public.transactions add constraint transactions_source_check
      check (source in ('salario', 'vale', 'outra', 'definir'));
  end if;
end $$;
