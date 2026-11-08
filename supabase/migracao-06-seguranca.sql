-- Bolso: atualização 06, endurecimento de segurança (ponto 18 da planilha).
-- Cole no Supabase: SQL Editor > New query > Run.
-- Não apaga nem altera nenhum dado. Só tira permissões que sobravam, amarra cada cartão e conta fixa ao dono
-- e põe limites de tamanho e de formato nas colunas, para o banco recusar sozinho o que o app nunca grava.
-- Se alguma linha antiga não cumprir um limite, o Supabase para tudo e não muda nada (a execução é uma transação só).
-- Pode rodar de novo sem medo.

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
