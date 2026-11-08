/* Bolso: app-core.js
   Estado do app, consultas, gravação de dados, avisos e janelas. Sem telas aqui. */
(function (root) {
  'use strict';
  const F = root.Fin;
  const B = (root.Bolso = {});

  const S = (B.S = {
    store: null,
    data: { cards: [], categories: [], recurring: [], transactions: [], settings: {} },
    month: F.monthOf(F.todayStr()),
    route: 'resumo',
    sub: '',
    f: { kind: 'todos', card: '', cat: '', src: '', status: '', q: '' }, // filtros do Extrato
    // Análises: range = quantos meses; by = 'renda' (principal, mês de renda de 15 a 14) ou 'calendario' (apoio);
    // cycle = mês de renda em foco (vazio = o de hoje); src = renda filtrada (vazio = somadas).
    ana: { range: 1, by: 'renda', cycle: '', src: '' },
    user: null,
    installEvent: null,
  });

  /* ---------- Utilidades ---------- */

  const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  B.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => MAP[c]);
  B.today = () => F.todayStr();
  B.curMonth = () => F.monthOf(F.todayStr());
  B.maxMonth = () => F.addMonths(B.curMonth(), 12);
  B.$ = (sel, el) => (el || root.document).querySelector(sel);
  B.$$ = (sel, el) => Array.from((el || root.document).querySelectorAll(sel));

  const COLS = {
    cards: ['id', 'name', 'kind', 'color', 'closing_day', 'due_day', 'pay_source'],
    categories: ['id', 'name', 'emoji'],
    recurring: ['id', 'kind', 'description', 'amount', 'day', 'category', 'card_id', 'source', 'month_offset', 'start_month', 'active'],
    transactions: ['id', 'kind', 'description', 'amount', 'date', 'month', 'category', 'card_id', 'source', 'paid', 'skipped', 'recurring_id', 'group_id', 'installment_no', 'installments_total', 'tag', 'split_with', 'split_share', 'split_paid', 'created_at'],
  };
  // Colunas novas (fatura do cartão, etiqueta, divisão da conta): só seguem para o banco quando têm valor, assim cartões antigos gravam igual a antes.
  const OPTIONAL = { cards: ['closing_day', 'due_day', 'pay_source'], transactions: ['created_at', 'tag', 'split_with', 'split_share', 'split_paid'] };
  const pick = (table, row) => {
    const o = {};
    for (const c of COLS[table]) {
      const v = row[c] === undefined ? null : row[c];
      if (v === null && OPTIONAL[table] && OPTIONAL[table].includes(c)) continue;
      o[c] = v;
    }
    return o;
  };
  B.pick = pick;

  /* ---------- Consultas ---------- */

  /** Cartão de quem dividiu a conta com você: não é seu, só aparece com o nome ("Itaú de Natan"). */
  const SHARED_PREFIX = 'cartao-de-fora:';
  const sharedCard = (id) => (typeof id === 'string' && id.indexOf(SHARED_PREFIX) === 0 && S.sharedCards && S.sharedCards[id]) || null;
  B.cat = (key) => F.categoryInfo(key, S.data.categories);
  B.catName = (key) => B.cat(key).name;
  B.card = (id) => (id ? S.data.cards.find((c) => c.id === id) || null : null);
  B.cardName = (id) => (!id || id === '_dinheiro' ? F.CASH_NAME : sharedCard(id) ? sharedCard(id).name : (B.card(id) || { name: 'Cartão removido' }).name);
  B.cardColor = (id) => (id && B.card(id) ? F.safeColor(B.card(id).color) : sharedCard(id) && sharedCard(id).color ? F.safeColor(sharedCard(id).color) : 'var(--muted)');
  B.srcName = (key) => (F.SOURCES.find((s) => s.key === key) || F.SOURCES[2]).name;
  B.srcVar = (key) => 'var(--src-' + (F.SOURCES.find((s) => s.key === key) ? key : 'outra') + ')';
  B.isBilledCard = (id) => F.isBilled(B.card(id));
  B.isBilledTx = (t) => t.kind === 'despesa' && !!t.card_id && B.isBilledCard(t.card_id);
  B.findTx = (id) => S.data.transactions.find((t) => t.id === id);
  B.findRec = (id) => S.data.recurring.find((r) => r.id === id);

  B.daysUntil = (dateStr) => {
    const t = B.today();
    const a = Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10));
    const b = Date.UTC(+dateStr.slice(0, 4), +dateStr.slice(5, 7) - 1, +dateStr.slice(8, 10));
    return Math.round((b - a) / 86400000);
  };

  /* ---------- Avisos ---------- */

  let toastTimer = null;
  B.toast = (msg, kind) => {
    const el = B.$('#toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show' + (kind === 'err' ? ' err' : '');
    // popover coloca o aviso acima de qualquer janela aberta
    try { if (el.showPopover && !el.matches(':popover-open')) el.showPopover(); } catch (e) { /* segue sem popover */ }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.className = 'toast';
      try { if (el.hidePopover && el.matches(':popover-open')) el.hidePopover(); } catch (e) { /* ok */ }
    }, kind === 'err' ? 6000 : 2600);
  };

  /** Executa uma ação e mostra o erro em português, em vez de quebrar a tela. */
  B.guard = async (fn) => {
    try { return await fn(); }
    catch (e) { console.error(e); B.toast(e && e.message ? e.message : 'Algo deu errado. Tente de novo.', 'err'); return undefined; }
  };

  /* ---------- Janela inferior (sheet) e confirmação ---------- */

  B.sheet = {
    el: null,
    open(html) {
      const el = (this.el = this.el || B.$('#sheet'));
      el.innerHTML = '<div class="sheet-body">' + html + '</div>';
      if (!el.open) el.showModal();
      el.scrollTop = 0;
    },
    set(html) { // troca o conteúdo mantendo a rolagem das listas internas
      const el = this.el;
      const keep = B.$$('[data-keep-scroll]', el).map((n) => n.scrollTop);
      const top = el.querySelector('.sheet-body') ? el.querySelector('.sheet-body').scrollTop : 0;
      el.innerHTML = '<div class="sheet-body">' + html + '</div>';
      B.$$('[data-keep-scroll]', el).forEach((n, i) => { n.scrollTop = keep[i] || 0; });
      const body = el.querySelector('.sheet-body');
      if (body) body.scrollTop = top;
    },
    close() { if (this.el && this.el.open) this.el.close(); },
  };

  /** Pergunta com botões. actions: [{label, value, kind: 'danger'|'primary'|''}]. Devolve o value escolhido ou null. */
  B.ask = ({ title, text, actions, confirmWord }) => new Promise((resolve) => {
    const dlg = B.$('#ask');
    const word = confirmWord ? '<label class="field"><span>Digite <b>' + B.esc(confirmWord) + '</b> para confirmar</span><input id="ask-word" autocomplete="off" autocapitalize="characters"></label>' : '';
    dlg.innerHTML = '<div class="sheet-body"><h2 class="sheet-title">' + B.esc(title) + '</h2><p class="muted-text">' + B.esc(text || '') + '</p>' + word +
      '<div class="stack">' + actions.map((a, i) => '<button type="button" class="btn ' + (a.kind || '') + '" data-i="' + i + '">' + B.esc(a.label) + '</button>').join('') +
      '<button type="button" class="btn ghost" data-i="x">Cancelar</button></div></div>';
    const done = (v) => { dlg.onclose = null; dlg.close(); resolve(v); };
    dlg.onclose = () => resolve(null);
    dlg.onclick = (e) => {
      if (e.target === dlg) return done(null);
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      if (b.dataset.i === 'x') return done(null);
      const a = actions[+b.dataset.i];
      if (confirmWord && B.$('#ask-word').value.trim().toUpperCase() !== confirmWord) { B.$('#ask-word').focus(); B.$('#ask-word').classList.add('bad'); return; }
      done(a.value);
    };
    dlg.showModal();
  });

  /* ---------- Gravação (grava primeiro; só atualiza a tela se deu certo) ---------- */

  B.reload = async () => {
    S.data = await S.store.load();
    B.applyShares();
    await B.reconcileShares();
  };
  B.settings = () => S.data.settings || {};
  /** Grava configurações (valor null apaga) e guarda na tela. */
  B.saveSettings = async (patch) => {
    await S.store.saveSettings(patch);
    const next = Object.assign({}, B.settings(), patch);
    for (const k of Object.keys(next)) if (next[k] == null) delete next[k];
    S.data.settings = next;
  };

  /** Carimbo de lançamento para o que o sistema cria sozinho (conta fixa, backup): conta como lançado no próprio dia,
      então nunca vira "ajuste" de mês fechado. Dia que ainda não chegou usa o momento de agora. */
  B.stampOn = (dateStr) => {
    const at = new Date(dateStr + 'T12:00:00'), now = new Date();
    return (isNaN(at) || at > now ? now : at).toISOString();
  };

  const isVirt = (id) => typeof id === 'string' && id.indexOf('share:') === 0;
  /** Campos do lançamento que a outra pessoa enxerga no pedido. */
  const SHARE_WATCH = ['description', 'amount', 'date', 'month', 'card_id', 'installment_no', 'installments_total', 'split_with', 'split_share', 'split_paid'];

  B.addTxs = async (rows) => {
    const wants = rows.filter((r) => r.share_partner).map((r) => r.id); // pedido para a pessoa vinculada
    rows = rows.map((r) => pick('transactions', r));
    await S.store.insert('transactions', rows);
    // o banco carimba sozinho a hora do lançamento; aqui a tela fica com o mesmo carimbo sem precisar recarregar
    const now = new Date().toISOString();
    S.data.transactions.push(...rows.map((r) => (r.created_at ? r : Object.assign({}, r, { created_at: now }))));
    if (wants.length) {
      try { await syncShares(wants, wants); }
      catch (e) { // sem o pedido a divisão não vale: desfaz a gravação para não sobrar conta pela metade
        try { await S.store.remove('transactions', rows.map((r) => r.id)); } catch (_) { /* a próxima carga acerta */ }
        const gone = new Set(rows.map((r) => r.id));
        S.data.transactions = S.data.transactions.filter((t) => !gone.has(t.id));
        throw e;
      }
    }
  };
  B.updTx = async (id, patch, opts) => {
    if (isVirt(id)) return B.updSharedTx(id, patch);
    return B.updTxs([id], patch, opts);
  };
  B.updTxs = async (ids, patch, opts) => {
    opts = opts || {};
    const virt = ids.filter(isVirt);
    ids = ids.filter((id) => !isVirt(id));
    for (const id of virt) await B.updSharedTx(id, patch);
    if (!ids.length) return;
    const prev = {};
    for (const id of ids) {
      const t = B.findTx(id);
      prev[id] = {};
      if (t) for (const k of Object.keys(patch)) prev[id][k] = t[k] === undefined ? null : t[k];
    }
    await S.store.updateMany('transactions', ids, patch);
    const set = new Set(ids);
    for (const t of S.data.transactions) if (set.has(t.id)) Object.assign(t, patch);
    const touches = Object.keys(patch).some((k) => SHARE_WATCH.includes(k));
    if (touches || opts.sharePartner !== undefined) {
      try { await syncShares(ids, opts.sharePartner === true ? ids : [], opts.sharePartner === false ? ids : []); }
      catch (e) { // o pedido não acompanhou: volta o lançamento ao que era
        for (const id of ids) {
          try { await S.store.update('transactions', id, prev[id]); Object.assign(B.findTx(id), prev[id]); } catch (_) { /* a próxima carga acerta */ }
        }
        throw e;
      }
    }
  };
  B.delTxs = async (ids) => {
    ids = ids.filter((id) => !isVirt(id));
    if (!ids.length) return;
    const own = ids.map((id) => B.ownShare(id)).filter(Boolean);
    await S.store.remove('transactions', ids);
    const set = new Set(ids);
    S.data.transactions = S.data.transactions.filter((t) => !set.has(t.id));
    if (own.length) { // o pedido acompanha: aceito vira "cancelado" (a outra pessoa é avisada), o resto some
      try {
        const accepted = own.filter((x) => x.status === 'accepted').map((x) => x.id);
        if (accepted.length) await updShares(accepted, { status: 'cancelled' });
        await dropShares(own.filter((x) => x.status !== 'accepted').map((x) => x.id));
      } catch (e) { console.error(e); /* na próxima carga o app acerta */ }
    }
  };

  /** Dar baixa na devolução: a outra pessoa pagou a parte dela. Cria uma entrada ("Fulano devolveu: ...") e marca as contas como devolvidas.
      Se não conseguir marcar, desfaz tudo, para o dinheiro não contar duas vezes. Devolve { name, cents, count } para o aviso. */
  B.settleSplit = async (ids) => {
    const list = ids.map((id) => B.findTx(id)).filter((t) => t && F.hasSplit(t) && !t.split_paid);
    if (!list.length) return null;
    const cents = list.reduce((s, t) => s + F.othersCents(t), 0);
    const name = list[0].split_with;
    const what = list.length === 1 ? name + ' devolveu: ' + list[0].description : name + ' devolveu ' + list.length + ' contas';
    const today = F.todayStr();
    const row = {
      id: F.uid(), kind: 'receita', description: what.slice(0, 80), amount: cents / 100, date: today, month: F.monthOf(today),
      category: null, card_id: null, source: 'outra', paid: true, skipped: false,
      recurring_id: null, group_id: null, installment_no: null, installments_total: null,
    };
    const sh = list.map((t) => B.ownShare(t.id)).filter((x) => x && x.status === 'accepted').map((x) => x.id);
    if (sh.length) await updShares(sh, { owner_received: true });
    try {
      await B.addTxs([row]);
      try { await B.updTxs(list.map((t) => t.id), { split_paid: true }); }
      catch (e) { await B.delTxs([row.id]); throw e; }
    } catch (e) {
      if (sh.length) { try { await updShares(sh, { owner_received: false }); } catch (_) { /* segue */ } }
      throw e;
    }
    return { name, cents, count: list.length };
  };
  /** Desfazer a baixa de uma conta dividida (marcou "recebi" sem ter recebido). Não mexe na entrada já criada: ela aparece no Extrato para apagar. */
  B.unsettleSplit = async (ids) => {
    const sh = ids.map((id) => B.ownShare(id)).filter((x) => x && x.status === 'accepted' && x.owner_received).map((x) => x.id);
    await B.updTxs(ids, { split_paid: false });
    if (sh.length) await updShares(sh, { owner_received: false });
  };

  /* ---------- Dividir conta com a pessoa vinculada (pedido, aceite, "paguei" e "recebi") ---------- */

  const me = () => (S.user && S.user.id) || null;
  const shares = () => (S.data && S.data.shares) || [];
  B.shares = shares;
  /** O banco já tem a atualização 05 (tabelas de vínculo e pedidos)? */
  B.socialReady = () => !!(S.store.mode === 'supabase' && S.data && S.data.social && S.data.social.ready);
  B.socialError = () => (S.data && S.data.social && S.data.social.error) || '';

  /** Vínculo atual: { state: 'none' | 'sent' | 'received' | 'linked', link, id, theirName, nick, name }.
      name é como VOCÊ chama a outra pessoa (o apelido que você deu, ou o nome que ela usa). */
  B.partner = () => {
    const links = (S.data && S.data.links) || [];
    const my = me();
    const l = links.find((x) => x.status === 'accepted') ||
      links.find((x) => x.status === 'pending' && x.addressee_id === my) || links.find((x) => x.status === 'pending' && x.requester_id === my);
    if (!l) return { state: 'none', name: '', nick: F.tagClean(B.settings().parceiro_apelido) };
    const mine = l.requester_id === my;
    const theirName = F.tagClean(mine ? l.addressee_name : l.requester_name);
    const nick = F.tagClean(B.settings().parceiro_apelido);
    const state = l.status === 'accepted' ? 'linked' : mine ? 'sent' : 'received';
    return { state, link: l, id: mine ? l.addressee_id : l.requester_id, theirName, nick, name: (state === 'linked' ? nick : '') || theirName || 'a outra pessoa' };
  };
  B.ownShare = (txId) => shares().find((x) => x.owner_id === me() && x.tx_id === txId) || null;
  B.shareById = (id) => shares().find((x) => x.id === id) || null;

  const virtualTx = (x, ownerName) => {
    const cid = SHARED_PREFIX + x.card_name;
    S.sharedCards[cid] = { name: x.card_name + ' de ' + ownerName, color: F.safeColor(x.card_color, null) };
    return {
      id: 'share:' + x.id, share_id: x.id, kind: 'despesa', description: x.description, amount: x.amount, date: x.date, month: x.month,
      category: x.partner_category || x.suggested_category || 'outros', card_id: cid, source: x.partner_source || 'definir',
      paid: !!(x.partner_paid || x.owner_received), skipped: false, recurring_id: null, group_id: x.group_id,
      installment_no: x.installment_no, installments_total: x.installments_total, tag: null, split_with: null, split_share: null, split_paid: null,
      created_at: x.created_at, share_owner_received: !!x.owner_received,
    };
  };
  /** As contas que a outra pessoa dividiu com você e você aceitou entram nas suas listas como lançamentos seus (só você mexe no nicho, na renda e no "paguei"). */
  B.applyShares = () => {
    if (!S.data) return;
    S.sharedCards = {};
    const my = me();
    const owner = B.partner().name;
    const real = (S.data.transactions || []).filter((t) => !t.share_id);
    const virt = shares().filter((x) => x.partner_id === my && x.status === 'accepted').map((x) => virtualTx(x, owner));
    S.data.transactions = real.concat(virt);
  };

  async function updShares(ids, patch) {
    const rows = await S.store.updateRows('shares', ids, patch);
    if (!rows.length) throw new Error('Pedido não encontrado. Talvez já tenha mudado em outro aparelho.');
    if (!S.data.shares) S.data.shares = [];
    for (const r of rows) { const i = S.data.shares.findIndex((x) => x.id === r.id); if (i >= 0) S.data.shares[i] = r; else S.data.shares.push(r); }
    B.applyShares();
    return rows;
  }
  async function dropShares(ids) {
    if (!ids.length) return;
    await S.store.remove('shares', ids);
    const set = new Set(ids);
    S.data.shares = shares().filter((x) => !set.has(x.id));
    B.applyShares();
  }

  const SNAP_KEYS = ['description', 'amount', 'date', 'month', 'card_name', 'card_color', 'installment_no', 'installments_total', 'group_id', 'suggested_category'];
  /** O que a outra pessoa precisa ver da sua compra: descrição, a parte dela, quando vence e em qual cartão. Nada além. */
  B.shareSnapshot = (t) => {
    const card = t.card_id ? B.card(t.card_id) : null;
    const due = B.isBilledTx(t) ? F.invoiceDates(card, t.month).dueDate : t.date;
    return {
      description: t.description, amount: F.othersCents(t) / 100, date: due, month: t.month,
      card_name: card ? card.name : F.CASH_NAME, card_color: card ? card.color : null,
      installment_no: t.installment_no || null, installments_total: t.installments_total || null, group_id: t.group_id || null,
      suggested_category: F.CATEGORIES.some((c) => c.key === t.category) ? t.category : null,
    };
  };
  const sameSnap = (x, snap) => SNAP_KEYS.every((k) => (k === 'amount' ? Math.round(x[k] * 100) === Math.round(snap[k] * 100) : (x[k] == null ? null : x[k]) === (snap[k] == null ? null : snap[k])));

  /** Alinha os pedidos com os lançamentos já gravados. wantIds: lançamentos que devem ganhar pedido para a pessoa vinculada; offIds: os que não devem ter. */
  async function syncShares(ids, wantIds, offIds) {
    const want = new Set(wantIds || []), off = new Set(offIds || []);
    const P = B.partner();
    for (const id of ids) {
      const t = B.findTx(id);
      if (!t) continue;
      const cur = B.ownShare(id);
      if (!cur && !want.has(id)) continue;
      if (want.has(id) && !B.socialReady()) throw new Error(B.socialError() || 'O banco ainda não tem a divisão de contas.');
      const live = cur && (cur.status === 'pending' || cur.status === 'accepted');
      const active = F.hasSplit(t) && !off.has(id) && (want.has(id) || live);
      if (!active) { // não deve (mais) ter pedido
        if (cur && cur.status === 'pending') await dropShares([cur.id]);
        else if (cur && cur.status === 'accepted') await updShares([cur.id], { status: 'cancelled' });
        continue;
      }
      if (cur && !live) { await dropShares([cur.id]); } // pedido recusado ou cancelado antes: começa um novo
      const now = live ? cur : null;
      const snap = B.shareSnapshot(t);
      if (now) {
        if (!sameSnap(now, snap)) await updShares([now.id], snap);
      } else {
        if (P.state !== 'linked') throw new Error('Vincule a outra pessoa em Mais antes de dividir a conta com ela.');
        const rows = await S.store.insertRows('shares', [Object.assign({ id: F.uid(), partner_id: P.id, tx_id: id }, snap)]);
        if (!S.data.shares) S.data.shares = [];
        S.data.shares.push(...rows);
        B.applyShares();
      }
    }
  }

  /** O que sobrou no seu lado depois de abrir o app: pedidos recusados voltam a ser só seus; pedidos de lançamentos que sumiram são encerrados. */
  B.reconcileShares = async () => {
    const my = me();
    if (!my || !B.socialReady()) return;
    try {
      for (const x of shares().filter((y) => y.owner_id === my)) {
        const t = S.data.transactions.find((y) => y.id === x.tx_id);
        if (!t) {
          if (x.status === 'accepted') await updShares([x.id], { status: 'cancelled' });
          else if (x.status === 'pending') await dropShares([x.id]);
          continue;
        }
        if (x.status === 'refused' && F.hasSplit(t) && !t.split_paid) {
          const clear = { split_with: null, split_share: null, split_paid: null };
          await S.store.update('transactions', t.id, clear);
          Object.assign(t, clear);
        }
      }
    } catch (e) { console.error(e); }
  };

  /** Mudanças que a outra pessoa pode fazer numa conta que aceitou: nicho, renda e "paguei". */
  B.updSharedTx = async (vid, patch) => {
    const x = B.shareById(vid.slice(6));
    if (!x) throw new Error('Esse pedido não existe mais.');
    const sp = {};
    if ('paid' in patch) {
      if (x.owner_received && !patch.paid) throw new Error(B.partner().name + ' já confirmou que recebeu.');
      if (!x.owner_received) sp.partner_paid = !!patch.paid;
    }
    if ('category' in patch) sp.partner_category = patch.category;
    if ('source' in patch) sp.partner_source = patch.source;
    if (Object.keys(sp).length) await updShares([x.id], sp);
  };

  /** Pedidos esperando a sua resposta, juntando as parcelas da mesma compra. */
  B.requestsForMe = () => {
    const groups = new Map();
    for (const x of shares().filter((y) => y.partner_id === me() && y.status === 'pending')) {
      const k = x.group_id || x.id;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(x);
    }
    return [...groups.values()].map((list) => {
      list.sort((a, b) => (a.installment_no || 0) - (b.installment_no || 0) || (a.date < b.date ? -1 : 1));
      const f = list[0];
      return {
        key: f.group_id || f.id, ids: list.map((x) => x.id), items: list, first: f, count: list.length,
        total: list.reduce((s, x) => s + Math.round(x.amount * 100), 0) / 100,
        changed: list.some((x) => x.changed),
        prevTotal: list.some((x) => x.changed && x.prev_amount != null) ? list.reduce((s, x) => s + Math.round((x.changed && x.prev_amount != null ? x.prev_amount : x.amount) * 100), 0) / 100 : null,
      };
    });
  };
  /** Avisos que terminam com "Entendi", juntando as parcelas: pedido cancelado por quem mandou (aparece para você) ou recusado por quem recebeu (aparece para quem mandou). */
  B.noticesForMe = () => {
    const groups = new Map();
    for (const x of shares()) {
      const refused = x.owner_id === me() && x.status === 'refused', cancelled = x.partner_id === me() && x.status === 'cancelled';
      if (!refused && !cancelled) continue;
      const k = (refused ? 'r:' : 'c:') + (x.group_id || x.id);
      if (!groups.has(k)) groups.set(k, { key: k, kind: refused ? 'refused' : 'cancelled', list: [] });
      groups.get(k).list.push(x);
    }
    return [...groups.values()].map((g) => ({
      key: g.key, kind: g.kind, ids: g.list.map((x) => x.id), first: g.list[0], count: g.list.length,
      total: g.list.reduce((s, x) => s + Math.round(x.amount * 100), 0) / 100,
    }));
  };
  /** O que outras pessoas devem a você: só entra o que a pessoa vinculada já aceitou (pedido pendente ainda não é dívida). */
  B.receivables = () => F.receivables(S.data.transactions.filter((t) => { if (t.share_id) return false; const x = B.ownShare(t.id); return !x || x.status === 'accepted'; }));
  /** Pedidos seus que a outra pessoa ainda não respondeu. */
  B.waitingAccept = () => {
    const pend = shares().filter((x) => x.owner_id === me() && x.status === 'pending');
    return { count: new Set(pend.map((x) => x.group_id || x.id)).size, cents: pend.reduce((s, x) => s + Math.round(x.amount * 100), 0) };
  };

  B.acceptShares = async (ids, choice) => {
    await updShares(ids, { status: 'accepted', partner_category: choice.category, partner_source: choice.source });
  };
  B.refuseShares = async (ids) => { await updShares(ids, { status: 'refused' }); };
  B.dismissShares = async (ids) => { await dropShares(ids); };

  /* ---------- Vínculo com a outra pessoa ---------- */

  B.reloadSocial = async () => {
    const x = await S.store.loadSocial();
    S.data.shares = x.shares; S.data.links = x.links; S.data.social = x.social;
    B.applyShares();
  };
  B.invitePartner = async (email, name) => {
    await S.store.rpc('convidar_parceiro', { p_email: email, p_nome: name });
    await B.saveSettings({ meu_nome: name });
    await B.reloadSocial();
  };
  B.answerInvite = async (accept, name) => {
    const l = B.partner().link;
    if (!l) throw new Error('Esse convite não existe mais.');
    await S.store.rpc('responder_convite', { p_id: l.id, p_aceitar: !!accept, p_nome: name || '' });
    if (accept && name) await B.saveSettings({ meu_nome: name });
    await B.reloadSocial();
  };
  /** Desfaz o vínculo (ou cancela o convite enviado). Pedidos sem resposta somem; os já aceitos continuam valendo para os dois. */
  B.unlinkPartner = async () => {
    await S.store.rpc('desfazer_vinculo');
    await B.reloadSocial();
  };

  B.addCard = async (c) => {
    const row = pick('cards', c);
    await S.store.insert('cards', [row]);
    S.data.cards.push(row);
    return row;
  };
  B.updCard = async (id, patch) => {
    await S.store.update('cards', id, patch);
    Object.assign(S.data.cards.find((c) => c.id === id), patch);
  };
  B.delCard = async (id) => {
    await S.store.remove('cards', [id]);
    S.data.cards = S.data.cards.filter((c) => c.id !== id);
    for (const r of S.data.transactions.concat(S.data.recurring)) if (r.card_id === id) r.card_id = null;
  };

  /* ---------- Faturas do cartão ---------- */

  /** O que muda nas compras ainda não pagas de um cartão quando o fechamento, o vencimento ou a renda dele mudam.
      As pagas ficam como estão. Devolve { groups: [{ ids, patch }], recs: [id das contas fixas], count }. */
  B.rebillPlan = (card) => {
    const out = { groups: [], recs: [], count: 0 };
    if (!F.isBilled(card)) return out;
    const byPatch = new Map();
    for (const t of S.data.transactions) {
      if (t.card_id !== card.id || t.kind !== 'despesa' || t.paid || t.skipped || t.recurring_id) continue;
      const month = F.invoiceOf(card, t.date).month;
      const source = card.pay_source || 'definir';
      if (month === t.month && source === t.source) continue;
      const k = month + '|' + source;
      if (!byPatch.has(k)) byPatch.set(k, { ids: [], patch: { month, source } });
      byPatch.get(k).ids.push(t.id);
      out.count++;
    }
    out.groups = [...byPatch.values()];
    out.recs = S.data.recurring.filter((r) => r.card_id === card.id && r.active && r.kind === 'despesa').map((r) => r.id);
    out.count += S.data.transactions.filter((t) => out.recs.includes(t.recurring_id) && !t.paid && !t.skipped && t.month >= B.curMonth()).length;
    return out;
  };

  B.applyRebill = async (card) => {
    const plan = B.rebillPlan(card);
    for (const g of plan.groups) await B.updTxs(g.ids, g.patch);
    for (const id of plan.recs) await purgePending(id);
    if (plan.recs.length) await B.ensureRecurring(S.month);
    return plan.count;
  };

  /** Todas as compras (não puladas) de uma fatura. */
  B.invoiceOf = (cardId, month) => F.invoices(S.data.transactions, S.data.cards).find((i) => i.card_id === cardId && i.month === month) || null;

  B.setInvoicePaid = async (cardId, month, paid) => {
    const inv = B.invoiceOf(cardId, month);
    if (!inv) return;
    await B.updTxs(inv.ids, { paid });
  };

  B.setInvoiceSource = async (cardId, month, source) => {
    const inv = B.invoiceOf(cardId, month);
    if (!inv) return;
    await B.updTxs(inv.ids, { source });
  };

  B.addCategory = async (c) => {
    const row = pick('categories', c);
    await S.store.insert('categories', [row]);
    S.data.categories.push(row);
    return row;
  };
  B.delCategory = async (id) => {
    const txIds = S.data.transactions.filter((t) => t.category === id).map((t) => t.id);
    const recIds = S.data.recurring.filter((r) => r.category === id).map((r) => r.id);
    if (txIds.length) await B.updTxs(txIds, { category: 'outros' });
    if (recIds.length) {
      await S.store.updateMany('recurring', recIds, { category: 'outros' });
      for (const r of S.data.recurring) if (recIds.includes(r.id)) r.category = 'outros';
    }
    await S.store.remove('categories', [id]);
    S.data.categories = S.data.categories.filter((c) => c.id !== id);
  };

  /** Cria os lançamentos que faltam das contas fixas até o mês pedido. */
  B.ensureRecurring = async (through) => {
    const target = through > B.maxMonth() ? B.maxMonth() : through;
    const miss = F.missingRecurring(S.data.recurring, S.data.transactions, target, S.data.cards);
    if (!miss.length) return 0;
    const real = await S.store.insertIgnore('transactions', miss.map((r) => pick('transactions', Object.assign({}, r, { created_at: B.stampOn(r.date) }))));
    const key = (r) => r.recurring_id + '|' + r.month;
    const have = new Set(S.data.transactions.filter((t) => t.recurring_id).map(key));
    let n = 0;
    for (const r of real) if (!have.has(key(r))) { S.data.transactions.push(r); n++; }
    return n;
  };

  /** Apaga as contas ainda não pagas (do mês atual em diante) de uma conta fixa; elas voltam sozinhas com os dados novos. */
  async function purgePending(recId) {
    const cur = B.curMonth();
    const ids = S.data.transactions.filter((t) => t.recurring_id === recId && !t.paid && !t.skipped && t.month >= cur).map((t) => t.id);
    await B.delTxs(ids);
  }

  B.addRecurring = async (rec, firstTx) => {
    const row = pick('recurring', rec);
    await S.store.insert('recurring', [row]);
    S.data.recurring.push(row);
    if (firstTx) await B.addTxs([Object.assign({}, firstTx, { recurring_id: row.id })]);
    await B.ensureRecurring(S.month);
    return row;
  };
  B.updRecurring = async (id, patch) => {
    await S.store.update('recurring', id, patch);
    Object.assign(B.findRec(id), patch);
    await purgePending(id);
    await B.ensureRecurring(S.month);
  };
  B.delRecurring = async (id) => {
    await purgePending(id);
    await S.store.remove('recurring', [id]);
    S.data.recurring = S.data.recurring.filter((r) => r.id !== id);
    for (const t of S.data.transactions) if (t.recurring_id === id) t.recurring_id = null;
  };

  /* ---------- Backup ---------- */

  B.exportJSON = () => JSON.stringify({
    app: 'bolso', version: 1, exported_at: new Date().toISOString(),
    data: {
      cards: S.data.cards.map((r) => pick('cards', r)),
      categories: S.data.categories.map((r) => pick('categories', r)),
      recurring: S.data.recurring.map((r) => pick('recurring', r)),
      transactions: S.data.transactions.filter((r) => !r.share_id).map((r) => pick('transactions', r)),
      settings: B.settings(),
    },
  }, null, 2);

  B.exportCSV = () => F.toCSV(S.data.transactions, { catName: B.catName, cardName: B.cardName });

  B.IMPORT_MAX_BYTES = 5 * 1024 * 1024;
  B.importJSON = async (text) => {
    if (typeof text !== 'string' || text.length > B.IMPORT_MAX_BYTES) throw new Error('Esse arquivo é grande demais para ser um backup do Bolso (o limite é 5 MB).');
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('Esse arquivo não é um backup do Bolso.'); }
    if (!obj || obj.app !== 'bolso' || !obj.data || typeof obj.data !== 'object') throw new Error('Esse arquivo não é um backup do Bolso.');
    const tables = ['cards', 'categories', 'recurring', 'transactions'];
    const total = tables.reduce((n, t) => n + (Array.isArray(obj.data[t]) ? obj.data[t].length : 0), 0);
    if (total > F.IMPORT_LIMITS.rows) throw new Error('Esse backup tem linhas demais (o limite é ' + F.IMPORT_LIMITS.rows + ').');
    // primeiro confere tudo; só grava depois, para um arquivo ruim não deixar o backup pela metade
    const plan = {}, skipped = {};
    let skippedTotal = 0;
    for (const t of tables) {
      const have = new Set(S.data[t].map((r) => r.id));
      const rows = [];
      skipped[t] = 0;
      for (const raw of (Array.isArray(obj.data[t]) ? obj.data[t] : [])) {
        if (raw && raw.id && have.has(raw.id)) continue; // já existe: não duplica
        const res = F.cleanRow(t, raw, { looseIds: S.store.mode !== 'supabase' });
        if (res.skip) { skipped[t]++; skippedTotal++; continue; }
        if (have.has(res.row.id)) continue;
        have.add(res.row.id);
        const r = pick(t, res.row);
        // backup antigo não tinha a data de lançamento: restaurar não pode virar "ajuste" em tudo
        if (t === 'transactions' && !r.created_at && r.date) r.created_at = B.stampOn(r.date);
        rows.push(r);
      }
      plan[t] = rows;
    }
    const added = {};
    for (const t of tables) {
      if (plan[t].length) await S.store.insert(t, plan[t]);
      added[t] = plan[t].length;
    }
    added.skipped = skippedTotal;
    // saldo inicial: só entra se a pessoa ainda não tem um
    const op = F.openingOf(obj.data.settings);
    if (op && !F.openingOf(B.settings())) { await B.saveSettings({ saldo_inicial: { mes: op.month, valor: op.amount } }); added.settings = 1; }
    await B.reload();
    return added;
  };

  B.download = (filename, text, mime) => {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = root.document.createElement('a');
    a.href = url; a.download = filename;
    root.document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  /* ---------- Navegação ---------- */

  B.go = (path) => { root.location.hash = '#/' + path; };
  B.setMonth = async (ym) => {
    if (ym > B.maxMonth()) ym = B.maxMonth();
    if (ym < '2000-01') return;
    S.month = ym;
    await B.guard(() => B.ensureRecurring(ym));
    B.render();
  };

  /** Mês de renda em foco nas Análises (o de hoje, se ninguém escolheu outro). */
  B.anaCycle = () => S.ana.cycle || F.cycleOf(B.today());
  B.setCycle = async (ym) => {
    const top = F.addMonths(B.maxMonth(), -1); // o mês de renda M usa lançamentos de M e de M+1
    if (ym > top) ym = top;
    if (ym < '2000-01') return;
    S.ana.cycle = ym === F.cycleOf(B.today()) ? '' : ym;
    await B.guard(() => B.ensureRecurring(F.addMonths(ym, 1)));
    B.render();
  };

  B.views = {};
  B.acts = {};
  B.render = () => {};
})(window);
