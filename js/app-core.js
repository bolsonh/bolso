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
    transactions: ['id', 'kind', 'description', 'amount', 'date', 'month', 'category', 'card_id', 'source', 'paid', 'skipped', 'recurring_id', 'group_id', 'installment_no', 'installments_total', 'tag', 'created_at'],
  };
  // Colunas novas (fatura do cartão, etiqueta): só seguem para o banco quando têm valor, assim cartões antigos gravam igual a antes.
  const OPTIONAL = { cards: ['closing_day', 'due_day', 'pay_source'], transactions: ['created_at', 'tag'] };
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

  B.cat = (key) => F.categoryInfo(key, S.data.categories);
  B.catName = (key) => B.cat(key).name;
  B.card = (id) => (id ? S.data.cards.find((c) => c.id === id) || null : null);
  B.cardName = (id) => (!id || id === '_dinheiro' ? F.CASH_NAME : (B.card(id) || { name: 'Cartão removido' }).name);
  B.cardColor = (id) => (id && B.card(id) ? B.card(id).color : 'var(--muted)');
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

  B.reload = async () => { S.data = await S.store.load(); };
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

  B.addTxs = async (rows) => {
    rows = rows.map((r) => pick('transactions', r));
    await S.store.insert('transactions', rows);
    // o banco carimba sozinho a hora do lançamento; aqui a tela fica com o mesmo carimbo sem precisar recarregar
    const now = new Date().toISOString();
    S.data.transactions.push(...rows.map((r) => (r.created_at ? r : Object.assign({}, r, { created_at: now }))));
  };
  B.updTx = async (id, patch) => {
    await S.store.update('transactions', id, patch);
    Object.assign(B.findTx(id), patch);
  };
  B.updTxs = async (ids, patch) => {
    await S.store.updateMany('transactions', ids, patch);
    const set = new Set(ids);
    for (const t of S.data.transactions) if (set.has(t.id)) Object.assign(t, patch);
  };
  B.delTxs = async (ids) => {
    if (!ids.length) return;
    await S.store.remove('transactions', ids);
    const set = new Set(ids);
    S.data.transactions = S.data.transactions.filter((t) => !set.has(t.id));
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
      transactions: S.data.transactions.map((r) => pick('transactions', r)),
      settings: B.settings(),
    },
  }, null, 2);

  B.exportCSV = () => F.toCSV(S.data.transactions, { catName: B.catName, cardName: B.cardName });

  B.importJSON = async (text) => {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('Esse arquivo não é um backup do Bolso.'); }
    if (!obj || obj.app !== 'bolso' || !obj.data) throw new Error('Esse arquivo não é um backup do Bolso.');
    const added = {};
    for (const t of ['cards', 'categories', 'recurring', 'transactions']) {
      const have = new Set(S.data[t].map((r) => r.id));
      const rows = (Array.isArray(obj.data[t]) ? obj.data[t] : []).filter((r) => r && r.id && !have.has(r.id)).map((r) => pick(t, r));
      if (t === 'transactions' || t === 'recurring') for (const r of rows) r.amount = Number(r.amount) || 0;
      // backup antigo não tinha a data de lançamento: restaurar não pode virar "ajuste" em tudo
      if (t === 'transactions') for (const r of rows) if (!r.created_at && r.date) r.created_at = B.stampOn(r.date);
      if (rows.length) await S.store.insert(t, rows);
      added[t] = rows.length;
    }
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
