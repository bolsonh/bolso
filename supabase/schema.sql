-- Bolso: banco de dados do app de controle financeiro.
-- Cole este arquivo inteiro no Supabase: SQL Editor > New query > Run.
-- Pode rodar de novo sem medo: tudo usa "if not exists".

-- 1) Cartões -----------------------------------------------------------
create table if not exists public.cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  kind        text not null default 'credito' check (kind in ('credito', 'debito')),
  color       text not null default '#2a78d6',
  closing_day int  check (closing_day between 1 and 31),   -- crédito: dia em que a fatura fecha
  due_day     int  check (due_day between 1 and 31),       -- crédito: dia em que a fatura vence
  pay_source  text check (pay_source in ('salario', 'vale', 'outra')), -- renda que paga a fatura (vazio = a definir)
  created_at  timestamptz not null default now()
);

-- 2) Nichos criados por você (os padrões ficam dentro do app) ----------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  emoji       text not null default '📦',
  created_at  timestamptz not null default now()
);

-- 3) Contas fixas (modelo que se repete todo mês) ----------------------
create table if not exists public.recurring (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('despesa', 'receita')),
  description   text not null,
  amount        numeric(12,2) not null check (amount >= 0),
  day           int  not null check (day between 1 and 31),
  category      text,
  card_id       uuid references public.cards(id) on delete set null,
  source        text not null default 'salario' check (source in ('salario', 'vale', 'outra')),
  month_offset  int  not null default 0 check (month_offset in (0, 1)),
  start_month   text not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- 4) Lançamentos (gastos e entradas) -----------------------------------
create table if not exists public.transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind                text not null check (kind in ('despesa', 'receita')),
  description         text not null,
  amount              numeric(12,2) not null check (amount >= 0),
  date                date not null,
  month               text not null,                 -- mês de competência, formato AAAA-MM
  category            text,
  card_id             uuid references public.cards(id) on delete set null,
  source              text not null default 'salario' check (source in ('salario', 'vale', 'outra', 'definir')),
  paid                boolean not null default true,
  skipped             boolean not null default false,
  recurring_id        uuid references public.recurring(id) on delete set null,
  group_id            uuid,
  installment_no      int,
  installments_total  int,
  created_at          timestamptz not null default now()
);

-- Uma conta fixa só gera um lançamento por mês (evita duplicar em dois aparelhos).
create unique index if not exists transactions_recurring_month_uq
  on public.transactions (recurring_id, month);

create index if not exists transactions_user_month_idx on public.transactions (user_id, month);
create index if not exists transactions_user_date_idx  on public.transactions (user_id, date);

-- 5) Segurança: cada pessoa enxerga somente as próprias linhas ----------
alter table public.cards        enable row level security;
alter table public.categories   enable row level security;
alter table public.recurring    enable row level security;
alter table public.transactions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['cards', 'categories', 'recurring', 'transactions'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'somente o dono'
    ) then
      execute format(
        'create policy "somente o dono" on public.%I for all to authenticated
           using (user_id = (select auth.uid()))
           with check (user_id = (select auth.uid()))', t);
    end if;
  end loop;
end $$;

-- 6) Permissões: só quem está logado mexe nas tabelas; visitantes não -----
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.cards        to authenticated;
grant select, insert, update, delete on public.categories   to authenticated;
grant select, insert, update, delete on public.recurring    to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
revoke all on public.cards, public.categories, public.recurring, public.transactions from anon;

-- 7) Atualização de bancos criados antes da fatura do cartão (#13) -------
-- Só acrescenta: colunas novas sem valor obrigatório e uma opção a mais ("definir") na fonte do lançamento.
-- Não apaga nem altera nenhum dado. Pode rodar de novo sem medo.
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

-- 8) Botão "Excluir minha conta" dentro do app (#23) --------------------
-- Só acrescenta uma função. Apaga o login de quem está logado (auth.uid()); os dados dela somem em cascata.
create or replace function public.excluir_minha_conta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  quem uuid := (select auth.uid());
begin
  if quem is null then
    raise exception 'Entre na sua conta para poder excluí-la.' using errcode = '28000';
  end if;
  delete from auth.users where id = quem;
end;
$$;

revoke all on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;
