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
  tag                 text,                          -- etiqueta que junta gastos de cartões e meses diferentes (uma viagem, uma reforma)
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

-- 9) Dividir conta com outra pessoa (#5) ---------------------------------------------
-- Igual ao arquivo supabase/migracao-05-dividir-conta.sql (só acrescenta; pode rodar de novo).
-- 1) No lançamento: com quem foi dividido, quanto é da outra pessoa e se já foi devolvido -------------
alter table public.transactions add column if not exists split_with  text;
alter table public.transactions add column if not exists split_share numeric(12,2) check (split_share >= 0);
alter table public.transactions add column if not exists split_paid  boolean;

-- 2) Vínculo entre duas pessoas (convite e aceite) ----------------------------------------------------
create table if not exists public.partner_links (
  id              uuid primary key default gen_random_uuid(),
  requester_id    uuid not null references auth.users(id) on delete cascade,
  addressee_id    uuid not null references auth.users(id) on delete cascade,
  requester_name  text not null,
  addressee_name  text,
  status          text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at      timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
create unique index if not exists partner_links_pair_uq
  on public.partner_links (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create unique index if not exists partner_links_requester_accepted_uq
  on public.partner_links (requester_id) where status = 'accepted';
create unique index if not exists partner_links_addressee_accepted_uq
  on public.partner_links (addressee_id) where status = 'accepted';

-- 3) Pedidos de divisão ---------------------------------------------------------------------------------
create table if not exists public.shares (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  partner_id          uuid not null references auth.users(id) on delete cascade,
  tx_id               uuid not null,                       -- o lançamento de quem pediu (sem vínculo no banco: o pedido pode sobreviver a ele)
  group_id            uuid,                                -- compra parcelada: a outra pessoa aceita todas as parcelas de uma vez
  description         text not null,
  amount              numeric(12,2) not null check (amount > 0),   -- a parte da outra pessoa
  date                date not null,                       -- dia em que vence (fatura) ou foi a compra
  month               text not null,                       -- mês de competência, formato AAAA-MM
  card_name           text not null,
  card_color          text,
  installment_no      int,
  installments_total  int,
  suggested_category  text,                                -- nicho padrão sugerido (a outra pessoa escolhe o dela)
  status              text not null default 'pending' check (status in ('pending', 'accepted', 'refused', 'cancelled')),
  changed             boolean not null default false,      -- true quando quem pediu alterou depois de aceito
  prev_amount         numeric(12,2),
  partner_category    text,                                -- nicho escolhido por quem aceitou
  partner_source      text check (partner_source in ('salario', 'vale', 'outra', 'definir')),
  partner_paid        boolean not null default false,      -- quem aceitou marcou "paguei"
  owner_received      boolean not null default false,      -- quem pediu confirmou "recebi"
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (owner_id <> partner_id)
);
create unique index if not exists shares_tx_uq on public.shares (tx_id);
create index if not exists shares_owner_idx   on public.shares (owner_id);
create index if not exists shares_partner_idx on public.shares (partner_id, status);

alter table public.partner_links enable row level security;
alter table public.shares        enable row level security;

-- Vínculo: cada um vê os seus. Quem cria e responde é sempre pelas funções mais abaixo.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'partner_links' and policyname = 'ver o proprio vinculo') then
    create policy "ver o proprio vinculo" on public.partner_links for select to authenticated
      using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
  end if;

  -- Pedidos: quem pediu e quem recebeu enxergam; só cria quem está vinculado; a outra pessoa só apaga o que já terminou.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shares' and policyname = 'ver os proprios pedidos') then
    create policy "ver os proprios pedidos" on public.shares for select to authenticated
      using (owner_id = (select auth.uid()) or partner_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shares' and policyname = 'criar pedido para quem esta vinculado') then
    create policy "criar pedido para quem esta vinculado" on public.shares for insert to authenticated
      with check (
        owner_id = (select auth.uid())
        and exists (
          select 1 from public.partner_links l
          where l.status = 'accepted'
            and ((l.requester_id = shares.owner_id and l.addressee_id = shares.partner_id)
              or (l.requester_id = shares.partner_id and l.addressee_id = shares.owner_id))
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shares' and policyname = 'atualizar pedido') then
    create policy "atualizar pedido" on public.shares for update to authenticated
      using (owner_id = (select auth.uid()) or partner_id = (select auth.uid()))
      with check (owner_id = (select auth.uid()) or partner_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shares' and policyname = 'apagar pedido') then
    create policy "apagar pedido" on public.shares for delete to authenticated
      using (owner_id = (select auth.uid())
          or (partner_id = (select auth.uid()) and status in ('cancelled', 'refused')));
  end if;
end $$;

revoke all on public.partner_links, public.shares from anon, authenticated;
grant select on public.partner_links to authenticated;
grant select, insert, update, delete on public.shares to authenticated;

-- 4) Trava do pedido: cada lado só muda o que é seu --------------------------------------------------
create or replace function public.shares_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  quem uuid := (select auth.uid());
  mudou boolean;
begin
  if quem is null then return new; end if;  -- manutenção pelo painel do Supabase (sem login de app)

  if tg_op = 'INSERT' then
    new.status := 'pending'; new.changed := false; new.prev_amount := null;
    new.partner_category := null; new.partner_source := null; new.partner_paid := false; new.owner_received := false;
    new.created_at := now(); new.updated_at := now();
    return new;
  end if;

  new.updated_at := now();
  if new.id <> old.id or new.owner_id <> old.owner_id or new.partner_id <> old.partner_id
     or new.tx_id <> old.tx_id or new.created_at <> old.created_at then
    raise exception 'Esses campos do pedido não podem ser mudados.';
  end if;

  if quem = old.owner_id then
    -- quem pediu não mexe no que é de quem recebeu
    if new.partner_category is distinct from old.partner_category or new.partner_source is distinct from old.partner_source then
      raise exception 'Você não pode mudar a escolha da outra pessoa.';
    end if;
    if new.partner_paid is distinct from old.partner_paid then
      raise exception 'Só a outra pessoa marca que pagou.';
    end if;
    if new.status is distinct from old.status and new.status not in ('pending', 'cancelled') then
      raise exception 'Só a outra pessoa aceita ou recusa o pedido.';
    end if;
    if old.status in ('refused', 'cancelled') and new.status is distinct from old.status then
      raise exception 'Esse pedido já terminou.';
    end if;
    if new.owner_received and old.status <> 'accepted' then
      raise exception 'Só dá para confirmar o recebimento de um pedido aceito.';
    end if;
    -- mudou algo que a outra pessoa vê num pedido já aceito: ela precisa aceitar de novo
    mudou := new.description is distinct from old.description or new.amount is distinct from old.amount
          or new.date is distinct from old.date or new.month is distinct from old.month
          or new.card_name is distinct from old.card_name or new.installment_no is distinct from old.installment_no
          or new.installments_total is distinct from old.installments_total;
    if mudou and old.status = 'accepted' and new.status = 'accepted' then new.status := 'pending'; end if;
    if mudou and old.status = 'accepted' and new.status = 'pending' then
      new.changed := true;
      new.prev_amount := case when new.amount is distinct from old.amount then old.amount else old.prev_amount end;
      if new.amount is distinct from old.amount then new.partner_paid := false; end if;
    end if;
    if mudou and old.status in ('refused', 'cancelled') then raise exception 'Esse pedido já terminou.'; end if;
    return new;
  elsif quem = old.partner_id then
    -- quem recebeu só aceita ou recusa, escolhe o nicho e a renda dela e marca "paguei"
    if new.description is distinct from old.description or new.amount is distinct from old.amount
       or new.date is distinct from old.date or new.month is distinct from old.month
       or new.card_name is distinct from old.card_name or new.card_color is distinct from old.card_color
       or new.installment_no is distinct from old.installment_no or new.installments_total is distinct from old.installments_total
       or new.group_id is distinct from old.group_id or new.suggested_category is distinct from old.suggested_category
       or new.owner_received is distinct from old.owner_received then
      raise exception 'Você só pode aceitar, recusar, escolher o nicho e marcar que pagou.';
    end if;
    if new.status is distinct from old.status then
      if old.status <> 'pending' or new.status not in ('accepted', 'refused') then
        raise exception 'Esse pedido não está mais esperando resposta.';
      end if;
      new.changed := false; new.prev_amount := null;
    else
      new.changed := old.changed; new.prev_amount := old.prev_amount;
    end if;
    if new.partner_paid is distinct from old.partner_paid and new.status <> 'accepted' then
      raise exception 'Só dá para marcar como pago depois de aceitar.';
    end if;
    return new;
  end if;
  raise exception 'Sem permissão.';
end;
$$;

drop trigger if exists shares_guard_trg on public.shares;
create trigger shares_guard_trg before insert or update on public.shares
  for each row execute function public.shares_guard();

-- 5) Funções: convidar, responder ao convite e desfazer o vínculo --------------------------------------
create or replace function public.convidar_parceiro(p_email text, p_nome text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  quem uuid := (select auth.uid());
  alvo uuid;
  novo uuid;
  nome text := nullif(btrim(p_nome), '');
begin
  if quem is null then raise exception 'Entre na sua conta para convidar alguém.' using errcode = '28000'; end if;
  if nome is null then raise exception 'Escreva o seu nome para a outra pessoa ver.'; end if;
  select id into alvo from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if alvo is null then raise exception 'Não achei uma conta do Bolso com esse e-mail. A outra pessoa precisa criar a conta primeiro.'; end if;
  if alvo = quem then raise exception 'Esse é o seu próprio e-mail.'; end if;
  if exists (select 1 from public.partner_links where status = 'accepted'
             and (requester_id in (quem, alvo) or addressee_id in (quem, alvo))) then
    raise exception 'Você ou essa pessoa já tem um vínculo. Desfaça o vínculo atual antes de convidar de novo.';
  end if;
  if exists (select 1 from public.partner_links where status = 'pending' and requester_id = alvo and addressee_id = quem) then
    raise exception 'Essa pessoa já te convidou. Aceite o convite que está no Resumo.';
  end if;
  delete from public.partner_links where status = 'pending' and requester_id = quem;  -- um convite por vez
  insert into public.partner_links (requester_id, addressee_id, requester_name)
    values (quem, alvo, left(nome, 40)) returning id into novo;
  return novo;
end;
$$;

create or replace function public.responder_convite(p_id uuid, p_aceitar boolean, p_nome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  quem uuid := (select auth.uid());
  l public.partner_links%rowtype;
  nome text := nullif(btrim(p_nome), '');
begin
  if quem is null then raise exception 'Entre na sua conta para responder.' using errcode = '28000'; end if;
  select * into l from public.partner_links where id = p_id and addressee_id = quem and status = 'pending' for update;
  if not found then raise exception 'Esse convite não existe mais.'; end if;
  if not coalesce(p_aceitar, false) then
    delete from public.partner_links where id = p_id;
    return;
  end if;
  if nome is null then raise exception 'Escreva o seu nome para a outra pessoa ver.'; end if;
  if exists (select 1 from public.partner_links where status = 'accepted'
             and (requester_id in (quem, l.requester_id) or addressee_id in (quem, l.requester_id))) then
    raise exception 'Você ou essa pessoa já tem um vínculo.';
  end if;
  update public.partner_links set status = 'accepted', addressee_name = left(nome, 40) where id = p_id;
  delete from public.partner_links
   where status = 'pending' and (requester_id in (quem, l.requester_id) or addressee_id in (quem, l.requester_id));
end;
$$;

-- Desfaz o vínculo (qualquer um dos dois). Pedidos ainda sem resposta somem; os já aceitos continuam valendo para os dois.
create or replace function public.desfazer_vinculo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  quem uuid := (select auth.uid());
  l public.partner_links%rowtype;
begin
  if quem is null then raise exception 'Entre na sua conta.' using errcode = '28000'; end if;
  for l in select * from public.partner_links where requester_id = quem or addressee_id = quem loop
    if l.status = 'accepted' then
      delete from public.shares
       where status in ('pending', 'refused', 'cancelled')
         and ((owner_id = l.requester_id and partner_id = l.addressee_id) or (owner_id = l.addressee_id and partner_id = l.requester_id));
    end if;
    delete from public.partner_links where id = l.id;
  end loop;
end;
$$;

revoke all on function public.convidar_parceiro(text, text)          from public, anon;
revoke all on function public.responder_convite(uuid, boolean, text) from public, anon;
revoke all on function public.desfazer_vinculo()                     from public, anon;
grant execute on function public.convidar_parceiro(text, text)          to authenticated;
grant execute on function public.responder_convite(uuid, boolean, text) to authenticated;
grant execute on function public.desfazer_vinculo()                     to authenticated;


-- 10) Endurecimento de segurança (#18) ---------------------------------------------------------------------------
-- (mesmo conteúdo do arquivo migracao-06-seguranca.sql)

-- 1) Permissões que sobravam -------------------------------------------------------------------------------
-- TRUNCATE ignora as regras de linha (RLS), e TRIGGER e REFERENCES não servem para o app. Quem está logado só precisa de ler, criar, mudar e apagar.
revoke truncate, trigger, references on public.cards, public.categories, public.recurring, public.transactions from authenticated, anon, public;
-- A trava dos pedidos roda sozinha quando o pedido muda; ninguém precisa poder chamá-la.
revoke all on function public.shares_guard() from public, anon, authenticated;

-- 2) Cartão e conta fixa só podem apontar para dados do mesmo dono ------------------------------------------
-- Antes, o banco só exigia que o cartão existisse. Agora o cartão (ou a conta fixa) tem que ser da mesma pessoa que o lançamento.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cards_id_user_uq') then
    alter table public.cards add constraint cards_id_user_uq unique (id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recurring_id_user_uq') then
    alter table public.recurring add constraint recurring_id_user_uq unique (id, user_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'transactions_card_owner_fk') then
    alter table public.transactions drop constraint if exists transactions_card_id_fkey;
    alter table public.transactions add constraint transactions_card_owner_fk
      foreign key (card_id, user_id) references public.cards (id, user_id) on delete set null (card_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_recurring_owner_fk') then
    alter table public.transactions drop constraint if exists transactions_recurring_id_fkey;
    alter table public.transactions add constraint transactions_recurring_owner_fk
      foreign key (recurring_id, user_id) references public.recurring (id, user_id) on delete set null (recurring_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recurring_card_owner_fk') then
    alter table public.recurring drop constraint if exists recurring_card_id_fkey;
    alter table public.recurring add constraint recurring_card_owner_fk
      foreign key (card_id, user_id) references public.cards (id, user_id) on delete set null (card_id);
  end if;
end $$;

-- 3) Limites de tamanho e de formato ------------------------------------------------------------------------
-- Os limites são bem mais largos que os do app (descrição 80, nomes 30 a 40), para nunca barrar uso normal.
do $$
declare
  c record;
begin
  for c in select * from (values
    ('public.cards',        'cards_limites_ck',        $c$char_length(name) between 1 and 60 and color ~ '^#[0-9a-fA-F]{6}$'$c$),
    ('public.categories',   'categories_limites_ck',   $c$char_length(name) between 1 and 60 and char_length(emoji) between 1 and 16 and emoji !~ '[<>&"''`\\]'$c$),
    ('public.recurring',    'recurring_limites_ck',    $c$char_length(description) between 1 and 200 and (category is null or char_length(category) <= 64) and start_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'$c$),
    ('public.transactions', 'transactions_limites_ck', $c$char_length(description) between 1 and 200 and month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' and date between date '2000-01-01' and date '2100-12-31'
        and (category is null or char_length(category) <= 64) and (tag is null or char_length(tag) <= 60) and (split_with is null or char_length(split_with) <= 60)
        and (installment_no is null or installment_no between 1 and 999) and (installments_total is null or installments_total between 1 and 999)$c$),
    ('public.shares',       'shares_limites_ck',       $c$char_length(description) between 1 and 200 and char_length(card_name) between 1 and 60 and month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
        and (card_color is null or card_color ~ '^#[0-9a-fA-F]{6}$') and (suggested_category is null or char_length(suggested_category) <= 64)
        and (partner_category is null or char_length(partner_category) <= 64)
        and (installment_no is null or installment_no between 1 and 999) and (installments_total is null or installments_total between 1 and 999)$c$),
    ('public.partner_links', 'partner_links_limites_ck', $c$char_length(requester_name) between 1 and 40 and (addressee_name is null or char_length(addressee_name) between 1 and 40)$c$)
  ) as t(tbl, nome, regra)
  loop
    if not exists (select 1 from pg_constraint where conname = c.nome) then
      execute format('alter table %s add constraint %I check (%s)', c.tbl, c.nome, c.regra);
    end if;
  end loop;
end $$;
