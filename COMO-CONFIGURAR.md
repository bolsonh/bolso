# Bolso: como colocar no ar com Supabase

O Bolso já funciona sozinho: abra o `index.html` e use. Nesse modo os dados ficam só naquele aparelho.
Para ter os mesmos dados no celular e no computador, siga os passos abaixo. Tudo no plano gratuito, sem cartão.

## 1. Criar a conta e o projeto no Supabase (você faz, uns 5 minutos)

1. Entre em supabase.com e crie a conta (e-mail ou GitHub). Os logins e senhas são só seus.
2. Clique em **New project**. Nome: `bolso`. Escolha uma **senha do banco** e guarde num lugar seguro (o app não usa essa senha). Região: **South America (São Paulo)**. Plano: **Free**.
3. Espere uns 2 minutos até o projeto ficar pronto.

## 2. Criar as tabelas

1. No menu da esquerda, abra **SQL Editor** e clique em **New query**.
2. Abra o arquivo `supabase/schema.sql`, copie tudo e cole lá.
3. Clique em **Run**. O resultado esperado é "Success. No rows returned".

Esse arquivo também liga a segurança: cada pessoa só enxerga as próprias linhas. Pode rodar de novo sem problema.

## 3. Copiar a URL e a chave pública

1. Abra **Settings > API Keys** e copie a **Publishable key** (começa com `sb_publishable_`). Se o projeto ainda não tiver uma, crie ali mesmo.
2. A **URL** do projeto (termina em `.supabase.co`) aparece no botão **Connect**, no alto da página, ou em **Project Settings > Data API**.
3. Abra o `config.js` do app e cole os dois valores:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_XXXXXXXX',
};
```

A chave `sb_publishable_` pode ficar no código do app: ela é pública de propósito e a segurança vem das regras do passo 2.
**Nunca cole a chave secreta (`sb_secret_`) nem a `service_role`.** Elas ignoram a segurança e dão acesso a tudo.

## 4. Colocar o app na internet (precisa de endereço https para instalar no celular)

Opção gratuita simples: **GitHub Pages**.

1. Crie um repositório **público** no GitHub e envie todos os arquivos do app (o plano gratuito do GitHub só publica páginas de repositórios públicos). O repositório não tem nenhum segredo: seus dados ficam no Supabase, protegidos por login.
2. No repositório: **Settings > Pages**, escolha a branch principal e a pasta raiz, e salve.
3. Em alguns minutos o endereço aparece, algo como `https://seu-usuario.github.io/bolso/`.

Cloudflare Pages e Netlify também publicam sites estáticos assim; use o que preferir.

## 5. Avisar o Supabase qual é o endereço do app

1. No Supabase: **Authentication > URL Configuration**.
2. Em **Site URL**, coloque o endereço do passo 4. Em **Redirect URLs**, adicione o mesmo endereço.

Sem isso, o link do e-mail de confirmação e o de "esqueci a senha" não voltam para o app.

## 6. Criar seu acesso e fechar a porta

1. Abra o endereço do app, toque em **Criar conta** e use seu e-mail e uma senha.
2. Se o Supabase pedir confirmação de e-mail, clique no link da mensagem e depois entre. (Para dispensar a confirmação: **Authentication > Sign In / Providers > Email** e desligue **Confirm email**.)
3. Depois de entrar, vá em **Authentication > Sign In / Providers** e desligue **Allow new users to sign up**. Assim ninguém mais consegue criar conta no seu app.

## 7. Instalar no celular

- **Android (Chrome):** menu de três pontos, depois **Instalar app** (ou **Adicionar à tela inicial**).
- **iPhone (Safari):** botão Compartilhar, depois **Adicionar à Tela de Início**.

## Levar os dados do modo local para a nuvem

No aparelho onde você já lançou coisas (modo local): **Mais > Dados e backup > Baixar backup completo**.
Depois, já logado no app com Supabase: **Restaurar de um backup** e escolha o arquivo.

## Cuidados

- **Pausa por inatividade:** no plano gratuito, o Supabase pausa o projeto depois de cerca de uma semana sem uso. Usar o app já conta como atividade; se pausar, reative pelo painel do Supabase e não deixe parado por muito tempo. Por isso vale baixar o backup de vez em quando.
- **Backup:** baixe o backup de vez em quando (Mais > Dados e backup). O plano gratuito não tem backup diário.
- **Sem internet:** o app abre, mas lançar e salvar no modo Supabase exige conexão.
- **Duas pessoas:** cada conta enxerga só os próprios dados. Para outra pessoa usar, ela cria a própria conta (ligue de novo a opção de cadastro por um momento).
