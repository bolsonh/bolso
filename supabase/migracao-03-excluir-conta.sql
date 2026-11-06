-- Bolso: atualização 03, botão "Excluir minha conta" dentro do app (item #23).
-- Cole no Supabase: SQL Editor > New query > Run.
-- Só acrescenta uma função. Nenhum dado existente é apagado ou alterado ao rodar. Pode rodar de novo sem medo.
--
-- O que a função faz quando alguém aperta o botão no app: apaga o login da PRÓPRIA pessoa que está logada
-- (a linha dela em auth.users). Lançamentos, cartões, nichos e contas fixas dela somem junto (on delete cascade).
-- Ela nunca mexe na conta de outra pessoa: o id vem da sessão (auth.uid()), não de um parâmetro.

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
