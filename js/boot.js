/* Bolso: boot.js
   Liga tudo: escolhe o modo (local ou Supabase), faz o login, carrega os dados e desenha a primeira tela. */
(function (root) {
  'use strict';
  const F = root.Fin, B = root.Bolso;
  const S = B.S, esc = B.esc;
  const doc = root.document;

  const setState = (s) => { doc.body.dataset.state = s; };
  const MARK = '<svg viewBox="0 0 32 32" class="brand-mark big" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="var(--src-salario)"/><path d="M16 2a14 14 0 0 1 0 28z" fill="var(--src-vale)"/></svg>';

  /* ---------- Tela de erro ---------- */

  function showFatal(msg, withSignOut) {
    setState('fatal');
    B.$('#view').innerHTML = '<div class="auth">' + MARK + '<h1>Não deu para abrir</h1><p class="callout">' + esc(msg) + '</p>' +
      '<div class="stack"><button type="button" class="btn primary" id="retry">Tentar de novo</button>' +
      (withSignOut ? '<button type="button" class="btn" id="fatal-out">Sair da conta</button>' : '') + '</div></div>';
    B.$('#retry').onclick = () => root.location.reload();
    if (withSignOut) B.$('#fatal-out').onclick = () => B.guard(() => S.store.auth.signOut());
  }

  /* ---------- Login (modo Supabase) ---------- */

  let authMode = 'in';
  let awaitingTerms = false; // true enquanto a tela de aceite está aberta

  const consentRow = '<label class="consent"><input type="checkbox" id="a-terms"><span>Tenho 18 anos ou mais e aceito a <a href="privacidade.html" target="_blank" rel="noopener">política de privacidade e os termos de uso</a>.</span></label>';
  const consentData = () => ({ aceite_termos: F.TERMS_VERSION, aceite_em: new Date().toISOString() });
  const termsOk = (session) => !!(session && session.user && session.user.user_metadata && session.user.user_metadata.aceite_termos === F.TERMS_VERSION);
  let recovery = /type=recovery/.test((root.location.hash || '') + (root.location.search || ''));

  function authView(mode, info) {
    authMode = mode;
    awaitingTerms = false;
    setState('auth');
    const titles = { in: 'Entrar', up: 'Criar conta', reset: 'Recuperar senha', newpw: 'Nova senha' };
    const lead = {
      in: 'Seu dinheiro, do salário ao vale, em um só lugar.',
      up: 'Seus lançamentos ficam guardados na nuvem, ligados ao seu e-mail.',
      reset: 'Digite seu e-mail e enviamos um link para criar uma senha nova.',
      newpw: 'Escolha uma senha nova para a sua conta.',
    };
    const needsEmail = mode !== 'newpw';
    const needsPass = mode !== 'reset';
    B.$('#view').innerHTML = '<div class="auth">' + MARK + '<h1>' + titles[mode] + '</h1><p class="muted-text">' + lead[mode] + '</p>' +
      '<form id="auth-form" novalidate>' +
      (needsEmail ? '<label class="field"><span>E-mail</span><input id="a-email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false"></label>' : '') +
      (needsPass ? '<label class="field"><span>' + (mode === 'newpw' ? 'Senha nova' : 'Senha') + '</span><input id="a-pass" type="password" autocomplete="' + (mode === 'in' ? 'current-password' : 'new-password') + '"></label>' : '') +
      (mode === 'up' ? consentRow : '') +
      '<p class="form-err" id="a-err" role="alert"></p>' +
      (info ? '<p class="callout">' + esc(info) + '</p>' : '') +
      '<button type="submit" class="btn primary wide" id="a-go">' + ({ in: 'Entrar', up: 'Criar conta', reset: 'Enviar link', newpw: 'Salvar senha' })[mode] + '</button></form>' +
      '<div class="auth-links">' +
      (mode === 'in' ? '<button type="button" class="link-btn" data-auth="up">Criar conta</button><button type="button" class="link-btn" data-auth="reset">Esqueci a senha</button>' : '') +
      (mode === 'up' || mode === 'reset' ? '<button type="button" class="link-btn" data-auth="in">Já tenho conta</button>' : '') + '</div></div>';
    const first = B.$('#a-email') || B.$('#a-pass');
    if (first && !/Mobi|Android|iPhone/i.test(root.navigator.userAgent)) first.focus();
  }

  async function submitAuth() {
    const err = B.$('#a-err'), go = B.$('#a-go');
    const email = B.$('#a-email') ? B.$('#a-email').value.trim() : '';
    const pass = B.$('#a-pass') ? B.$('#a-pass').value : '';
    err.textContent = '';
    if (authMode !== 'newpw' && !/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'Digite um e-mail válido.'; B.$('#a-email').focus(); return; }
    if (authMode !== 'reset' && pass.length < 6) { err.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; B.$('#a-pass').focus(); return; }
    if (authMode === 'up' && !B.$('#a-terms').checked) { err.textContent = 'Marque a caixa para aceitar a política de privacidade e os termos de uso.'; B.$('#a-terms').focus(); return; }
    go.disabled = true;
    try {
      const auth = S.store.auth;
      if (authMode === 'in') {
        const session = await auth.signIn(email, pass);
        await startApp(session);
      } else if (authMode === 'up') {
        const res = await auth.signUp(email, pass, consentData());
        if (res.session) await startApp(res.session);
        else authView('in', 'Conta criada. Enviamos um e-mail de confirmação para ' + email + '. Clique no link dele e depois entre aqui.');
      } else if (authMode === 'reset') {
        await auth.resetPassword(email);
        authView('in', 'Se esse e-mail tem conta, o link para criar uma senha nova já foi enviado.');
      } else if (authMode === 'newpw') {
        await auth.updatePassword(pass);
        recovery = false;
        const session = await auth.getSession();
        await startApp(session);
      }
    } catch (e) {
      err.textContent = e.message || 'Algo deu errado. Tente de novo.';
      go.disabled = false;
    }
  }

  function onAuthEvent(event, session) {
    if (event === 'PASSWORD_RECOVERY') { recovery = true; authView('newpw'); return; }
    if (event === 'SIGNED_OUT') { S.user = null; S.data = { cards: [], categories: [], recurring: [], transactions: [] }; recovery = false; authView('in'); return; }
    if (event === 'SIGNED_IN' && session && doc.body.dataset.state !== 'app' && !recovery && !awaitingTerms) {
      setTimeout(() => startApp(session), 0); // fora do callback, como a biblioteca recomenda
    }
  }

  /* ---------- Aceite da política e dos termos (contas que ainda não aceitaram esta versão) ---------- */

  function termsView() {
    awaitingTerms = true;
    setState('auth');
    B.$('#view').innerHTML = '<div class="auth">' + MARK + '<h1>Antes de continuar</h1>' +
      '<p class="muted-text">Para usar o Bolso, leia e aceite a política de privacidade e os termos de uso. Você faz isso uma vez, e de novo só se eles mudarem.</p>' +
      '<form id="terms-form" novalidate>' + consentRow + '<p class="form-err" id="a-err" role="alert"></p>' +
      '<button type="submit" class="btn primary wide" id="a-go">Continuar</button></form>' +
      '<div class="auth-links"><button type="button" class="link-btn" data-act="signout">Sair da conta</button></div></div>';
  }

  async function submitTerms() {
    const err = B.$('#a-err'), go = B.$('#a-go');
    err.textContent = '';
    if (!B.$('#a-terms').checked) { err.textContent = 'Marque a caixa para continuar.'; B.$('#a-terms').focus(); return; }
    go.disabled = true;
    try {
      const user = await S.store.auth.acceptTerms(consentData());
      awaitingTerms = false;
      await startApp({ user }, true);
    } catch (e) {
      err.textContent = e.message || 'Algo deu errado. Tente de novo.';
      go.disabled = false;
    }
  }

  /* ---------- Início do app ---------- */

  let starting = false;
  async function startApp(session, termsJustAccepted) {
    if (starting) return;
    starting = true;
    try {
      if (S.store.mode === 'supabase' && !termsJustAccepted && !termsOk(session)) { termsView(); return; }
      awaitingTerms = false;
      setState('loading');
      S.user = session ? session.user : null;
      const ok = await B.guard(async () => {
        await B.reload();
        await B.ensureRecurring(B.curMonth());
        return true;
      });
      if (!ok) { showFatal('Não consegui carregar seus dados. ' + (B.$('#toast').textContent || ''), S.store.mode === 'supabase'); return; }
      S.month = B.curMonth();
      B.drawShell();
      setState('app');
      B.render();
    } finally { starting = false; }
  }

  /* ---------- Eventos globais ---------- */

  function bind() {
    doc.addEventListener('click', (e) => {
      const a = e.target.closest('[data-auth]');
      if (a) { authView(a.dataset.auth); return; }
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const fn = B.acts[el.dataset.act];
      if (fn) { e.preventDefault(); fn(el, e); }
    });
    doc.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"][data-act]')) { e.preventDefault(); e.target.click(); }
    });
    doc.addEventListener('submit', (e) => {
      if (e.target.id === 'auth-form') { e.preventDefault(); submitAuth(); }
      if (e.target.id === 'terms-form') { e.preventDefault(); submitTerms(); }
    });
    doc.addEventListener('change', (e) => {
      const el = e.target;
      if (el.matches && el.matches('[data-filter]')) { S.f[el.dataset.filter] = el.value; B.render(); }
      if (el.id === 'file-backup' && el.files && el.files[0]) {
        const file = el.files[0];
        el.value = '';
        B.guard(async () => {
          const added = await B.importJSON(await file.text());
          await B.ensureRecurring(S.month);
          B.render();
          B.toast('Backup restaurado: ' + added.transactions + ' lançamentos, ' + added.cards + ' cartões, ' + added.recurring + ' contas fixas.');
        });
      }
    });
    doc.addEventListener('input', (e) => {
      if (e.target.matches && e.target.matches('[data-filter-q]')) {
        S.f.q = e.target.value;
        const list = B.$('#tx-list');
        if (list) list.innerHTML = B.V.extratoList();
      }
    });
    root.addEventListener('hashchange', () => { if (doc.body.dataset.state === 'app') B.render(); });
    root.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      S.installEvent = e;
      if (doc.body.dataset.state === 'app' && S.route === 'mais' && !S.sub) B.render();
    });
    root.addEventListener('appinstalled', () => { S.installEvent = null; });

    // Ao voltar para o app depois de um tempo, atualiza (útil quando você lança no celular e confere no computador).
    let hiddenAt = 0;
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden) { hiddenAt = Date.now(); return; }
      if (!hiddenAt || Date.now() - hiddenAt < 30000 || doc.body.dataset.state !== 'app' || S.store.mode !== 'supabase') return;
      if (B.$('#sheet').open || B.$('#ask').open) return;
      B.guard(async () => { await B.reload(); await B.ensureRecurring(S.month); B.render(); });
    });
  }

  /* ---------- Partida ---------- */

  async function boot() {
    bind();
    B.wireSheets();
    setState('loading');
    if ('serviceWorker' in root.navigator && (root.location.protocol === 'https:' || root.location.hostname === 'localhost' || root.location.hostname === '127.0.0.1')) {
      root.navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    const cfg = root.APP_CONFIG || {};
    const cloud = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
    S.store = cloud ? root.Stores.SupabaseStore(cfg) : root.Stores.LocalStore();
    try { await S.store.init(); } catch (e) { showFatal(e.message || 'Não foi possível iniciar.'); return; }
    if (!cloud) { await startApp(null); return; }
    S.store.auth.onChange(onAuthEvent);
    let session = null;
    try { session = await S.store.auth.getSession(); } catch (e) { /* mostra o login */ }
    if (recovery) { authView('newpw'); return; }
    if (session) await startApp(session); else authView('in');
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
