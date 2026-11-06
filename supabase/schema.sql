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
  source              text not null default 'salario' check (source in ('salario', 'vale', 'outra')),
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
