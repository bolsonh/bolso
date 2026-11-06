/* Bolso: views.js
   As telas: Resumo, Extrato, Análises e Mais (contas fixas, cartões, nichos, dados). */
(function (root) {
  'use strict';
  const F = root.Fin, C = root.Charts, B = root.Bolso;
  const S = B.S, esc = B.esc;
  const V = (B.V = {});

  /* ---------- Ícones (traço) ---------- */
  const ICON = {
    resumo: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 8h6V4h-6z"/>',
    extrato: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    analises: '<path d="M5 20V11M12 20V4M19 20v-7"/>',
    mais: '<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 8v5M12 16.5h.01"/><circle cx="12" cy="12" r="9"/>',
    up: '<path d="m7 17 10-10M9 7h8v8"/>',
    down: '<path d="m7 7 10 10M17 9v8H9"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    repeat: '<path d="M17 3l3 3-3 3M20 6H8a4 4 0 0 0-4 4v1M7 21l-3-3 3-3M4 18h12a4 4 0 0 0 4-4v-1"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18"/>',
    tag: '<path d="M3 12V4h8l9 9-8 8z"/><path d="M7.5 8.5h.01"/>',
    data: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
  };
  const icon = (n, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + '</svg>';
  B.icon = icon;

  const brl = F.fmtBRL;
  const R = (v) => '<span class="num">' + brl(v) + '</span>';

  /* ---------- Cabeçalho com mês ---------- */

  function monthHead(extraHtml) {
    const isCur = S.month === B.curMonth();
    const next = S.month >= B.maxMonth();
    return '<header class="head"><div class="head-title"><h1>' + F.monthName(S.month) + ' <span class="yr">' + S.month.slice(0, 4) + '</span></h1>' +
      (isCur ? '' : '<button type="button" class="link-btn" data-act="month-today">Ir para o mês atual</button>') + '</div>' +
      '<div class="mnav"><button type="button" class="icon-btn" data-act="month-prev" aria-label="Mês anterior">' + icon('left') + '</button>' +
      '<button type="button" class="icon-btn" data-act="month-next" aria-label="Próximo mês"' + (next ? ' disabled' : '') + '>' + icon('right') + '</button></div></header>' +
      (extraHtml || '');
  }

  function srcDot(key) { return '<i class="dot" style="--c:' + B.srcVar(key) + '"></i>'; }

  function dueInfo(t) {
    const d = B.daysUntil(t.date);
    const dd = F.pad(F.dayOf(t.date)) + '/' + t.date.slice(5, 7);
    if (d < 0) return { late: true, text: 'Venceu em ' + dd };
    if (d === 0) return { late: false, text: 'Vence hoje' };
    if (d === 1) return { late: false, text: 'Vence amanhã' };
    if (d <= 7) return { late: false, text: 'Vence em ' + d + ' dias (' + dd + ')' };
    return { late: false, text: 'Vence em ' + dd };
  }

  /* ---------- Linha de lançamento (Extrato e Resumo) ---------- */

  function txRow(t, o) {
    o = o || {};
    const isIn = t.kind === 'receita';
    const cat = isIn ? { emoji: '💵', name: 'Entrada' } : B.cat(t.category);
    const chips = [];
    if (!isIn || t.card_id) chips.push('<span class="chip"><i class="dot" style="--c:' + esc(B.cardColor(t.card_id)) + '"></i>' + esc(B.cardName(t.card_id)) + '</span>');
    chips.push('<span class="chip">' + srcDot(t.source) + esc(B.srcName(t.source)) + '</span>');
    if (B.isBilledTx(t)) chips.push('<span class="chip">' + icon('card', 'xs') + 'Fatura de ' + F.monthName(t.month).toLowerCase() + '</span>');
    if (t.recurring_id) chips.push('<span class="chip">' + icon('repeat', 'xs') + 'Fixa</span>');
    if (t.installments_total) chips.push('<span class="chip">' + t.installment_no + '/' + t.installments_total + '</span>');
    if (isIn && t.month !== F.monthOf(t.date)) chips.push('<span class="chip">Vale para ' + F.monthName(t.month).toLowerCase() + '</span>');
    const label = t.skipped ? 'Pulada' : t.paid ? (isIn ? 'Recebido' : 'Pago') : (isIn ? 'A receber' : 'Pendente');
    const pillAct = t.skipped ? 'toggle-skip' : 'toggle-paid';
    const cls = t.skipped ? 'skip' : t.paid ? 'ok' : 'pend';
    return '<div class="tx' + (t.skipped ? ' is-skipped' : '') + '" role="button" tabindex="0" data-act="edit-tx" data-id="' + t.id + '">' +
      '<span class="ico">' + cat.emoji + '</span>' +
      '<span class="tx-main"><span class="tx-desc">' + esc(t.description) + '</span><span class="tx-meta">' + chips.join('') + '</span></span>' +
      '<span class="tx-side"><b class="num ' + (isIn ? 'in' : 'out') + '">' + (isIn ? '+ ' : '') + brl(t.amount) + '</b>' +
      '<button type="button" class="pill ' + cls + '" data-act="' + pillAct + '" data-id="' + t.id + '">' + (t.paid && !t.skipped ? icon('check', 'xs') : '') + label + '</button></span></div>';
  }
  V.txRow = txRow;

  /* ---------- Fatura do cartão: uma saída só, no dia do vencimento ---------- */

  function invoiceTitle(inv) { return 'Fatura ' + B.cardName(inv.card_id); }
  V.invoiceTitle = invoiceTitle;

  function invoiceRow(inv) {
    const src = inv.source || 'definir';
    const chips = ['<span class="chip"><i class="dot" style="--c:' + esc(B.cardColor(inv.card_id)) + '"></i>' + inv.count + (inv.count === 1 ? ' compra' : ' compras') + '</span>',
      '<span class="chip">' + (inv.source ? srcDot(src) + esc(B.srcName(src)) : 'Mais de uma renda') + '</span>'];
    const cls = inv.paid ? 'ok' : 'pend';
    return '<div class="tx" role="button" tabindex="0" data-act="open-invoice" data-card="' + inv.card_id + '" data-month="' + inv.month + '">' +
      '<span class="ico">' + icon('card') + '</span>' +
      '<span class="tx-main"><span class="tx-desc">' + esc(invoiceTitle(inv)) + '</span><span class="tx-meta">' + chips.join('') + '</span></span>' +
      '<span class="tx-side"><b class="num out">' + brl(inv.total) + '</b>' +
      '<button type="button" class="pill ' + cls + '" data-act="toggle-invoice-paid" data-card="' + inv.card_id + '" data-month="' + inv.month + '">' + (inv.paid ? icon('check', 'xs') + 'Paga' : 'Pendente') + '</button></span></div>';
  }
  V.invoiceRow = invoiceRow;

  /** Uma compra dentro da janela da fatura. */
  V.invoiceItem = function (t) {
    const cat = B.cat(t.category);
    const chips = ['<span class="chip">' + F.pad(F.dayOf(t.date)) + '/' + t.date.slice(5, 7) + '</span>'];
    if (t.recurring_id) chips.push('<span class="chip">' + icon('repeat', 'xs') + 'Fixa</span>');
    if (t.installments_total) chips.push('<span class="chip">' + t.installment_no + '/' + t.installments_total + '</span>');
    return '<div class="tx" role="button" tabindex="0" data-act="edit-tx" data-id="' + t.id + '">' +
      '<span class="ico">' + cat.emoji + '</span>' +
      '<span class="tx-main"><span class="tx-desc">' + esc(t.description) + '</span><span class="tx-meta">' + chips.join('') + '</span></span>' +
      '<span class="tx-side"><b class="num out">' + brl(t.amount) + '</b></span></div>';
  };

  /* ---------- Resumo ---------- */

  V.resumo = function () {
    const m = S.month, T = S.data.transactions;
    const sum = F.summarize(T, m);
    const brandNew = !T.length && !S.data.cards.length && !S.data.recurring.length;
    const neg = sum.sobra < 0;
    const heroTxt = F.fmtNum(Math.abs(sum.sobra));

    let html = monthHead();
    if (brandNew) {
      html += '<section class="start"><h2>Comece por aqui</h2><p class="muted-text">Três passos e o Bolso já mostra para onde vai o seu dinheiro.</p>' +
        '<div class="start-list">' +
        '<button type="button" class="start-item" data-act="go" data-to="mais/cartoes"><span class="ico">' + icon('card') + '</span><span><b>Cadastre seus cartões</b><small>Crédito, débito, o que você usa.</small></span>' + icon('chev', 'end') + '</button>' +
        '<button type="button" class="start-item" data-act="new-tx" data-kind="receita"><span class="ico">' + icon('plus') + '</span><span><b>Lance seu salário e seu vale</b><small>Marque como conta fixa e ele volta todo mês.</small></span>' + icon('chev', 'end') + '</button>' +
        '<button type="button" class="start-item" data-act="new-tx" data-kind="despesa"><span class="ico">' + icon('plus') + '</span><span><b>Lance um gasto</b><small>Escolha o nicho, o cartão e se saiu do salário ou do vale.</small></span>' + icon('chev', 'end') + '</button>' +
        '</div></section>';
    }

    html += '<div class="cols-2"><div class="col-a">';

    html += '<section class="hero-block"><p class="lbl">' + (neg ? icon('alert', 'xs neg') + ' Falta no mês' : 'Sobra do mês') + '</p>' +
      '<p class="hero' + (heroTxt.length > 10 ? ' long' : '') + (neg ? ' neg' : '') + '"><small>R$</small>' + heroTxt + '</p>' +
      '<dl class="trio"><div><dt>Entrou</dt><dd class="num">' + brl(sum.receitas) + '</dd></div>' +
      '<div><dt>Saiu</dt><dd class="num">' + brl(sum.despesas) + '</dd></div>' +
      '<div><dt>Falta pagar</dt><dd class="num">' + brl(sum.faltaPagar) + '</dd></div></dl>' +
      (sum.faltaReceber > 0 ? '<p class="note">Inclui ' + brl(sum.faltaReceber) + ' que ainda vão cair na conta.</p>' : '') +
      '</section>';

    // Salário e vale
    html += '<section><h2>Salário e vale</h2><div class="envs">';
    for (const s of F.SOURCES) {
      const f = sum.fontes[s.key];
      const used = f.entrou > 0 || f.gastou > 0;
      if ((s.key === 'outra' || s.key === 'definir') && !used) continue;
      const over = f.resta < 0;
      html += '<div class="env"><div class="env-top"><span class="env-name">' + srcDot(s.key) + '<b>' + s.name + '</b></span>' +
        (used ? '<span class="env-left' + (over ? ' neg' : '') + '">' + (over ? icon('alert', 'xs') + 'Passou ' + brl(-f.resta) : 'Resta ' + brl(f.resta)) + '</span>' : '<span class="muted-text">Nada lançado</span>') + '</div>' +
        (used ? C.meter(f.gastou, f.entrou, B.srcVar(s.key)) +
          '<p class="env-sub">' + (f.entrou > 0 ? 'Gastou ' + brl(f.gastou) + ' de ' + brl(f.entrou) : 'Gastou ' + brl(f.gastou) + ' sem entrada lançada') +
          (f.faltaReceber > 0 ? '. Falta receber ' + brl(f.faltaReceber) : '') + '</p>' : '') +
        '</div>';
    }
    html += '</div></section></div><div class="col-b">';

    // Próximas contas (compras no cartão com fatura entram como uma saída só, no vencimento)
    const bills = T.filter((t) => t.month === m && t.kind === 'despesa' && !t.paid && !t.skipped && !B.isBilledTx(t)).map((t) => ({ t, date: t.date }))
      .concat(F.invoices(T, S.data.cards).filter((i) => i.month === m && !i.paid).map((inv) => ({ inv, date: inv.dueDate })))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    html += '<section><div class="sec-head"><h2>Contas para pagar</h2>' + (bills.length > 6 ? '<button type="button" class="link-btn" data-act="go" data-to="extrato" data-status="pendente">Ver todas (' + bills.length + ')</button>' : '') + '</div>';
    if (!bills.length) {
      html += '<p class="empty-line">' + (sum.count ? 'Nada pendente neste mês.' : 'Quando você lançar contas, as que faltam pagar aparecem aqui.') + '</p>';
    } else {
      html += '<ul class="due">' + bills.slice(0, 6).map((b) => {
        const di = dueInfo({ date: b.date });
        const when = '<span class="due-when' + (di.late ? ' late' : '') + '">' + (di.late ? icon('alert', 'xs') : '') + di.text + '</span>';
        if (b.inv) {
          const inv = b.inv, nm = invoiceTitle(inv);
          return '<li class="due-row"><button type="button" class="check" data-act="toggle-invoice-paid" data-card="' + inv.card_id + '" data-month="' + inv.month + '" aria-label="Marcar ' + esc(nm) + ' como paga"></button>' +
            '<div class="due-main" role="button" tabindex="0" data-act="open-invoice" data-card="' + inv.card_id + '" data-month="' + inv.month + '"><span class="due-desc">' + esc(nm) + '</span>' + when + '</div>' +
            '<b class="num due-amt">' + brl(inv.pending) + '</b></li>';
        }
        const t = b.t;
        return '<li class="due-row"><button type="button" class="check" data-act="toggle-paid" data-id="' + t.id + '" aria-label="Marcar ' + esc(t.description) + ' como pago"></button>' +
          '<div class="due-main" role="button" tabindex="0" data-act="edit-tx" data-id="' + t.id + '"><span class="due-desc">' + esc(t.description) + '</span>' + when + '</div>' +
          '<b class="num due-amt">' + brl(t.amount) + '</b></li>';
      }).join('') + '</ul>';
    }
    html += '</section>';

    // Para onde foi
    const cats = F.byCategory(T, [m]);
    html += '<section><div class="sec-head"><h2>Para onde foi</h2>' + (cats.rows.length ? '<button type="button" class="link-btn" data-act="go" data-to="analises">Análise completa</button>' : '') + '</div>';
    if (!cats.rows.length) html += '<p class="empty-line">Sem despesas neste mês.</p>';
    else html += C.ranked(cats.rows.slice(0, 5).map((r) => ({ label: B.catName(r.key), lead: '<span class="ico sm">' + B.cat(r.key).emoji + '</span>', value: r.total, pctText: Math.round(r.pct * 100) + '%' })));
    html += '</section></div></div>';
    return html;
  };

  /* ---------- Extrato ---------- */

  function filteredTxs() {
    const f = S.f, q = f.q.trim().toLowerCase();
    return S.data.transactions.filter((t) => t.month === S.month &&
      (f.kind === 'todos' || (f.kind === 'saidas' ? t.kind === 'despesa' : t.kind === 'receita')) &&
      (!f.card || (f.card === '_dinheiro' ? !t.card_id : t.card_id === f.card)) &&
      (!f.cat || t.category === f.cat) &&
      (!f.src || t.source === f.src) &&
      (!f.status || (f.status === 'pendente' ? !t.paid && !t.skipped : f.status === 'pago' ? t.paid && !t.skipped : t.skipped)) &&
      (!q || t.description.toLowerCase().includes(q) || (t.kind === 'despesa' && B.catName(t.category).toLowerCase().includes(q))));
  }

  V.extratoList = function () {
    const f = S.f;
    let list = filteredTxs();
    // Com busca ou filtro de nicho, mostra cada compra; sem eles, as compras do cartão com fatura viram uma saída só.
    const flat = !!(f.cat || f.q.trim() || f.status === 'pulada');
    let invs = [];
    if (!flat) {
      list = list.filter((t) => t.skipped || !B.isBilledTx(t));
      invs = F.invoices(S.data.transactions, S.data.cards).filter((i) => i.month === S.month &&
        f.kind !== 'entradas' && (!f.card || i.card_id === f.card) && (!f.src || i.source === f.src) &&
        (!f.status || (f.status === 'pendente' ? !i.paid : i.paid)));
    }
    const order = S.data.transactions;
    const idx = new Map(order.map((t, i) => [t.id, i]));
    const items = list.map((t) => ({ date: t.date, t, ord: idx.get(t.id) })).concat(invs.map((inv) => ({ date: inv.dueDate, inv, ord: Infinity })));
    items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.ord === a.ord ? 0 : b.ord > a.ord ? 1 : -1));
    const cents = (it) => (it.inv ? it.inv.cents : F.toCents(it.t.amount));
    const live = items.filter((it) => it.inv || !it.t.skipped);
    const isOut = (it) => it.inv || it.t.kind === 'despesa';
    const out = live.filter(isOut).reduce((sum, it) => sum + cents(it), 0) / 100;
    const inn = live.filter((it) => !isOut(it)).reduce((sum, it) => sum + cents(it), 0) / 100;
    const hasFilter = f.kind !== 'todos' || f.card || f.cat || f.src || f.status || f.q;
    if (!items.length) {
      return '<p class="empty-box">' + (hasFilter ? 'Nenhum lançamento com esses filtros.' : 'Nenhum lançamento em ' + F.monthName(S.month).toLowerCase() + '. Toque no botão + para começar.') + '</p>';
    }
    let html = '<p class="sum-line"><span>' + live.length + (live.length === 1 ? ' lançamento' : ' lançamentos') + '</span>' +
      (out ? '<span>Saiu ' + R(out) + '</span>' : '') + (inn ? '<span>Entrou ' + R(inn) + '</span>' : '') + '</p>';
    const groups = [];
    for (const it of items) {
      const g = groups[groups.length - 1];
      if (g && g.date === it.date) g.items.push(it); else groups.push({ date: it.date, items: [it] });
    }
    for (const g of groups) {
      const dayOut = g.items.filter((it) => isOut(it) && (it.inv || !it.t.skipped)).reduce((sum, it) => sum + cents(it), 0) / 100;
      html += '<section class="day"><h3>' + F.dayLabel(g.date) + (dayOut ? '<span class="num">' + brl(dayOut) + '</span>' : '') + '</h3>' + g.items.map((it) => (it.inv ? invoiceRow(it.inv) : txRow(it.t))).join('') + '</section>';
    }
    return html;
  };

  V.extrato = function () {
    const f = S.f;
    const opt = (v, label, cur) => '<option value="' + esc(v) + '"' + (cur === v ? ' selected' : '') + '>' + esc(label) + '</option>';
    const usedCats = [...new Set(S.data.transactions.filter((t) => t.kind === 'despesa').map((t) => t.category || 'outros'))];
    const catOpts = F.CATEGORIES.concat(S.data.categories.map((c) => ({ key: c.id, emoji: c.emoji, name: c.name }))).filter((c) => usedCats.includes(c.key) || f.cat === c.key);
    let html = monthHead();
    html += '<div class="seg" role="group" aria-label="Tipo">' +
      [['todos', 'Tudo'], ['saidas', 'Saídas'], ['entradas', 'Entradas']].map(([v, l]) => '<button type="button" aria-pressed="' + (f.kind === v) + '" data-act="set-kind-filter" data-v="' + v + '">' + l + '</button>').join('') + '</div>';
    html += '<div class="filters">' +
      '<label class="sel"><span>Cartão</span><select data-filter="card">' + opt('', 'Todos', f.card) + opt('_dinheiro', F.CASH_NAME, f.card) + S.data.cards.map((c) => opt(c.id, c.name, f.card)).join('') + '</select></label>' +
      '<label class="sel"><span>Nicho</span><select data-filter="cat">' + opt('', 'Todos', f.cat) + catOpts.map((c) => opt(c.key, c.emoji + ' ' + c.name, f.cat)).join('') + '</select></label>' +
      '<label class="sel"><span>Fonte</span><select data-filter="src">' + opt('', 'Todas', f.src) + F.SOURCES.map((s) => opt(s.key, s.name, f.src)).join('') + '</select></label>' +
      '<label class="sel"><span>Situação</span><select data-filter="status">' + opt('', 'Todas', f.status) + opt('pendente', 'Pendentes', f.status) + opt('pago', 'Pagas ou recebidas', f.status) + opt('pulada', 'Puladas', f.status) + '</select></label>' +
      '</div>';
    html += '<label class="search"><span class="sr">Buscar</span><input type="search" id="q" data-filter-q placeholder="Buscar por descrição ou nicho" value="' + esc(f.q) + '" autocomplete="off"></label>';
    html += '<div id="tx-list">' + V.extratoList() + '</div>';
    return html;
  };

  /* ---------- Análises ---------- */

  function rangeLabel(months) {
    if (months.length === 1) return F.monthLabel(months[0]);
    const a = months[0], z = months[months.length - 1];
    return F.monthShort(a) + ' ' + a.slice(0, 4) + ' a ' + F.monthShort(z) + ' ' + z.slice(0, 4);
  }

  V.analises = function () {
    const T = S.data.transactions;
    const n = S.ana.range;
    const months = F.rangeMonths(S.month, n);
    const set = new Set(months);
    const exp = T.filter((t) => !t.skipped && t.kind === 'despesa' && set.has(t.month));
    const inc = T.filter((t) => !t.skipped && t.kind === 'receita' && set.has(t.month));
    const total = exp.reduce((s, t) => s + F.toCents(t.amount), 0) / 100;
    const totalIn = inc.reduce((s, t) => s + F.toCents(t.amount), 0) / 100;
    const cats = F.byCategory(T, months);
    const cards = F.byCard(T, months);
    const fixed = exp.filter((t) => t.recurring_id).reduce((s, t) => s + F.toCents(t.amount), 0) / 100;

    let html = monthHead();
    html += '<div class="seg" role="group" aria-label="Período">' +
      [[1, 'Mês'], [3, '3 meses'], [6, '6 meses'], [12, '12 meses']].map(([v, l]) => '<button type="button" aria-pressed="' + (n === v) + '" data-act="set-range" data-v="' + v + '">' + l + '</button>').join('') + '</div>';
    if (n > 1) html += '<p class="range-note">' + rangeLabel(months) + '</p>';

    if (!exp.length) {
      return html + '<p class="empty-box">Sem despesas neste período. Lance gastos no Extrato e a análise aparece aqui.</p>';
    }

    // Número principal e fatos rápidos
    const avgLabel = n === 1 ? 'Média por dia' : 'Média por mês';
    const isCur = n === 1 && S.month === B.curMonth();
    const days = isCur ? F.dayOf(B.today()) : F.daysInMonth(S.month);
    const spentSoFar = isCur ? exp.filter((t) => t.date <= B.today()).reduce((s, t) => s + F.toCents(t.amount), 0) / 100 : total;
    const avg = n === 1 ? spentSoFar / days : total / n;
    html += '<section class="hero-block"><p class="lbl">Saiu no período</p><p class="hero' + (F.fmtNum(total).length > 10 ? ' long' : '') + '"><small>R$</small>' + F.fmtNum(total) + '</p>' +
      '<dl class="trio"><div><dt>Entrou</dt><dd class="num">' + brl(totalIn) + '</dd></div>' +
      '<div><dt>' + avgLabel + '</dt><dd class="num">' + brl(avg) + '</dd></div>' +
      '<div><dt>Fixas</dt><dd class="num">' + brl(fixed) + '</dd></div></dl></section>';

    const ins = F.buildInsights({ txs: T, months, today: B.today(), catName: B.catName, cardName: B.cardName });
    html += '<div class="cols-2"><div class="col-a">';

    html += '<section><h2>Para onde foi o dinheiro</h2>' +
      C.ranked(cats.rows.map((r) => ({ label: B.catName(r.key), lead: '<span class="ico sm">' + B.cat(r.key).emoji + '</span>', value: r.total, pctText: (r.pct > 0 && r.pct < 0.005 ? '<1%' : Math.round(r.pct * 100) + '%') }))) + '</section>';

    html += '<section><h2>Evolução dos gastos</h2>' +
      C.columns(F.monthlySeries(T, S.month, Math.max(6, n)).map((x) => ({ month: x.month, value: x.despesas })), S.month) + '</section>';

    // Quando você gasta: dia da semana e parte do mês (só saídas com data até hoje)
    const when = F.spendingWhen(T, months, B.today());
    if (when.count && when.topWeekdays.length) {
      const pc = (p) => (p > 0 && p < 0.005 ? 'menos de 1%' : Math.round(p * 100) + '%');
      const bars = (rows, tops, labelOf) => C.ranked(rows.map((r) => ({
        label: labelOf(r), lead: '', value: r.total, hi: tops.some((t) => t.name === r.name),
        pctText: r.pct > 0 && r.pct < 0.005 ? '<1%' : Math.round(r.pct * 100) + '%',
      })));
      const join = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1]);
      const few = (msg) => '<p class="when-few">' + icon('info', 'sm') + '<span>' + msg + '</span></p>';

      const wTop = when.topWeekdays;
      const wLead = wTop.length === 1
        ? 'Você gasta mais ' + wTop[0].art + ' ' + wTop[0].low + ': ' + brl(wTop[0].total) + ', ' + pc(wTop[0].pct) + ' das saídas.'
        : 'Empate entre ' + join(wTop.map((r) => r.low)) + ': ' + brl(wTop[0].total) + ' em cada.';
      html += '<section class="when"><h2>Dia da semana</h2><p class="when-lead">' + esc(wLead) + '</p>' +
        bars(when.weekdays, wTop, (r) => r.name) +
        (when.fewWeekdays ? few('Poucos dados ainda: a leitura fica mais confiável depois de umas 4 semanas de uso.') : '') +
        '<p class="when-note">Conta as saídas com data até hoje. Contas fixas entram no dia do vencimento.</p></section>';

      const pTop = when.topParts;
      const pLead = pTop.length === 1
        ? 'Você gasta mais ' + pTop[0].art + ' (' + pTop[0].range + '): ' + brl(pTop[0].total) + ', ' + pc(pTop[0].pct) + ' das saídas.'
        : 'Empate entre ' + join(pTop.map((r) => r.name.toLowerCase())) + ': ' + brl(pTop[0].total) + ' em cada.';
      html += '<section class="when"><h2>Parte do mês</h2><p class="when-lead">' + esc(pLead) + '</p>' +
        bars(when.parts, pTop, (r) => r.label) +
        (when.fewParts ? few('Poucos dados ainda: a leitura fica mais confiável com 2 meses ou mais de dados.') : '') +
        '<p class="when-note">Conta as saídas com data até hoje.</p></section>';
    }

    html += '</div><div class="col-b">';

    if (ins.length) {
      html += '<section><h2>O que chama atenção</h2><ul class="insights">' + ins.map((i) =>
        '<li class="ins ' + i.tone + '">' + icon(i.tone === 'warn' ? 'up' : i.tone === 'good' ? 'down' : 'info', 'sm') + '<span>' + esc(i.text) + '</span></li>').join('') + '</ul></section>';
    }

    // Salário x Vale no período
    const fontes = {};
    for (const s of F.SOURCES) fontes[s.key] = 0;
    for (const t of exp) fontes[t.source in fontes ? t.source : 'outra'] += F.toCents(t.amount) / 100;
    const srcParts = F.SOURCES.filter((s) => fontes[s.key] > 0);
    html += '<section><h2>De onde saiu o dinheiro</h2>' +
      C.segBar(srcParts.map((s) => ({ label: s.name, value: fontes[s.key], color: B.srcVar(s.key) }))) +
      '<ul class="legend">' + srcParts.map((s) => '<li>' + srcDot(s.key) + '<span>' + s.name + '</span><b class="num">' + brl(fontes[s.key]) + '</b><span class="num pct">' + Math.round((fontes[s.key] / total) * 100) + '%</span></li>').join('') + '</ul>' +
      '<p class="muted-text sm-gap">Fixas ' + R(fixed) + ' &nbsp;e&nbsp; variáveis ' + R(total - fixed) + '</p></section>';

    html += '<section><h2>Por cartão</h2>' +
      C.ranked(cards.rows.map((r) => ({ label: B.cardName(r.key), lead: '<i class="dot lg" style="--c:' + esc(B.cardColor(r.key === '_dinheiro' ? null : r.key)) + '"></i>', value: r.total, pctText: Math.round(r.pct * 100) + '%' }))) + '</section>';

    html += '</div></div>';
    return html;
  };

  /* ---------- Mais ---------- */

  function backHead(title, right) {
    return '<header class="head sub"><button type="button" class="icon-btn" data-act="go" data-to="mais" aria-label="Voltar">' + icon('left') + '</button><h1>' + title + '</h1>' + (right || '') + '</header>';
  }

  V.mais = function () {
    const local = S.store.mode === 'local';
    const item = (to, ic, title, sub) => '<button type="button" class="list-item" data-act="go" data-to="' + to + '"><span class="ico">' + icon(ic) + '</span><span class="li-text"><b>' + title + '</b><small>' + sub + '</small></span>' + icon('chev', 'end') + '</button>';
    let html = '<header class="head"><div class="head-title"><h1>Mais</h1></div></header>';
    html += '<div class="list">' +
      item('mais/fixas', 'repeat', 'Contas fixas', S.data.recurring.filter((r) => r.active).length + ' ativas, voltam todo mês') +
      item('mais/cartoes', 'card', 'Cartões', S.data.cards.length ? S.data.cards.length + (S.data.cards.length === 1 ? ' cartão' : ' cartões') : 'Cadastre os cartões que você usa') +
      item('mais/nichos', 'tag', 'Nichos', F.CATEGORIES.length + ' padrão' + (S.data.categories.length ? ' e ' + S.data.categories.length + ' seus' : '')) +
      item('mais/dados', 'data', 'Dados e backup', 'Exportar, importar e apagar') +
      '<a class="list-item" href="privacidade.html" target="_blank" rel="noopener"><span class="ico">' + icon('info') + '</span><span class="li-text"><b>Privacidade e termos</b><small>Como tratamos os seus dados</small></span>' + icon('chev', 'end') + '</a></div>';

    html += '<section class="plain"><h2>Conta</h2>';
    if (local) {
      html += '<p class="callout">Modo local: seus dados ficam só neste aparelho. Para usar no celular e no computador com os mesmos dados, ligue o Supabase seguindo o guia que vem com o app.</p>';
    } else {
      html += '<p class="muted-text">Conectado como <b>' + esc((S.user && S.user.email) || '') + '</b>. Os dados ficam guardados na nuvem (Supabase), ligados a esse e-mail.</p><button type="button" class="btn" data-act="signout">Sair</button>';
    }
    html += '</section>';

    html += '<section class="plain" id="install"><h2>Instalar no celular</h2>' +
      (S.installEvent ? '<button type="button" class="btn primary" data-act="install-app">Instalar o Bolso</button>' : '') +
      '<p class="muted-text">No Android (Chrome): menu de três pontos, depois "Instalar app" ou "Adicionar à tela inicial".</p>' +
      '<p class="muted-text">No iPhone (Safari): botão Compartilhar, depois "Adicionar à Tela de Início".</p></section>';
    html += '<p class="version">Bolso, versão 1.0</p>';
    return html;
  };

  V.fixas = function () {
    const rec = S.data.recurring.slice().sort((a, b) => (a.kind === b.kind ? a.day - b.day : a.kind === 'receita' ? -1 : 1));
    let html = backHead('Contas fixas', '<button type="button" class="btn small primary" data-act="new-rec">' + icon('plus', 'xs') + 'Nova</button>');
    html += '<p class="muted-text lead">Contas que se repetem todo mês. Elas entram sozinhas no Extrato, já como pendentes, e você marca quando pagar.</p>';
    if (!rec.length) return html + '<p class="empty-box">Nenhuma conta fixa ainda. Cadastre aluguel, internet, salário e vale uma vez só.</p>';
    html += '<div class="list">' + rec.map((r) => {
      const cat = r.kind === 'receita' ? { emoji: '💵' } : B.cat(r.category);
      return '<button type="button" class="list-item' + (r.active ? '' : ' off') + '" data-act="edit-rec" data-id="' + r.id + '"><span class="ico">' + cat.emoji + '</span>' +
        '<span class="li-text"><b>' + esc(r.description) + '</b><small>' + (r.kind === 'receita' ? 'Entrada' : 'Saída') + ', todo dia ' + r.day + (r.month_offset ? ', vale para o mês seguinte' : '') + ', ' + esc(B.srcName(r.source)) +
        (r.card_id ? ', ' + esc(B.cardName(r.card_id)) : '') + (r.active ? '' : ', pausada') + '</small></span><b class="num">' + brl(r.amount) + '</b></button>';
    }).join('') + '</div>';
    return html;
  };

  function cardSub(c) {
    if (c.kind === 'debito') return 'Débito';
    if (!F.isBilled(c)) return 'Crédito. Falta informar o fechamento e o vencimento';
    return 'Crédito. Fecha dia ' + c.closing_day + ', vence dia ' + c.due_day + '. ' + (c.pay_source ? 'Paga com ' + esc(B.srcName(c.pay_source)) : 'Renda a definir');
  }

  V.cartoes = function () {
    const m = S.month;
    let html = backHead('Cartões', '<button type="button" class="btn small primary" data-act="new-card">' + icon('plus', 'xs') + 'Novo</button>');
    html += '<p class="muted-text lead">Gastos em ' + F.monthName(m).toLowerCase() + ' por cartão. Troque o mês no Resumo para ver outro período.</p>';
    const tot = new Map(F.byCard(S.data.transactions, [m]).rows.map((r) => [r.key, r.total]));
    html += '<div class="list"><div class="list-item static"><span class="ico"><i class="dot lg" style="--c:var(--muted)"></i></span><span class="li-text"><b>' + F.CASH_NAME + '</b><small>Sempre disponível</small></span><b class="num">' + brl(tot.get('_dinheiro') || 0) + '</b></div>' +
      S.data.cards.map((c) => '<button type="button" class="list-item" data-act="edit-card" data-id="' + c.id + '"><span class="ico"><i class="dot lg" style="--c:' + esc(c.color) + '"></i></span><span class="li-text"><b>' + esc(c.name) + '</b><small>' + cardSub(c) + '</small></span><b class="num">' + brl(tot.get(c.id) || 0) + '</b></button>').join('') + '</div>';
    if (!S.data.cards.length) html += '<p class="empty-box">Cadastre seus cartões para ver quanto cada um está gastando.</p>';
    return html;
  };

  V.nichos = function () {
    let html = backHead('Nichos', '<button type="button" class="btn small primary" data-act="new-cat">' + icon('plus', 'xs') + 'Novo</button>');
    html += '<p class="muted-text lead">Nichos são os tipos de gasto. Os padrões já cobrem o que a maioria das pessoas mais gasta; crie os seus se precisar.</p>';
    if (S.data.categories.length) {
      html += '<h2 class="h-sub">Seus nichos</h2><div class="list">' + S.data.categories.map((c) => '<button type="button" class="list-item" data-act="edit-cat" data-id="' + c.id + '"><span class="ico">' + esc(c.emoji) + '</span><span class="li-text"><b>' + esc(c.name) + '</b><small>Toque para apagar</small></span></button>').join('') + '</div>';
    }
    html += '<h2 class="h-sub">Padrão</h2><div class="tags">' + F.CATEGORIES.map((c) => '<span class="tag"><span>' + c.emoji + '</span>' + esc(c.name) + '</span>').join('') + '</div>';
    return html;
  };

  V.dados = function () {
    let html = backHead('Dados e backup');
    html += '<div class="stack lead">' +
      '<button type="button" class="btn" data-act="export-csv">Baixar planilha (CSV para Excel)</button>' +
      '<button type="button" class="btn" data-act="export-json">Baixar backup completo (JSON)</button>' +
      '<button type="button" class="btn" data-act="import-json">Restaurar de um backup</button>' +
      '<input type="file" id="file-backup" accept="application/json,.json" hidden></div>' +
      '<p class="muted-text">O backup serve também para levar os dados do modo local para o Supabase: entre no modo Supabase e use "Restaurar de um backup".</p>' +
      '<p class="muted-text">Os seus direitos sobre os dados (baixar, corrigir e apagar) estão nesta tela. Para excluir também o seu login ou tirar dúvidas, veja a <a href="privacidade.html" target="_blank" rel="noopener">política de privacidade</a>.</p>' +
      '<section class="plain danger-zone"><h2>Apagar tudo</h2><p class="muted-text">Remove todos os lançamentos, cartões, contas fixas e nichos ' + (S.store.mode === 'local' ? 'deste aparelho' : 'da sua conta no Supabase') + '. Não tem como desfazer; baixe o backup antes.</p>' +
      '<button type="button" class="btn danger" data-act="wipe">Apagar todos os dados</button></section>';
    return html;
  };

  /* ---------- Roteamento e desenho ---------- */

  const NAV = [['resumo', 'Resumo'], ['extrato', 'Extrato'], ['analises', 'Análises'], ['mais', 'Mais']];

  B.drawShell = function () {
    const link = (id, label, cls) => '<a href="#/' + id + '" class="' + (cls || 'tab') + '" data-nav="' + id + '">' + icon(id) + '<span>' + label + '</span></a>';
    B.$('#tabbar').innerHTML = link('resumo', 'Resumo') + link('extrato', 'Extrato') +
      '<button type="button" class="tab fab" data-act="new-tx" aria-label="Novo lançamento"><span class="circle">' + icon('plus') + '</span></button>' +
      link('analises', 'Análises') + link('mais', 'Mais');
    B.$('#side').innerHTML = '<div class="brand"><svg viewBox="0 0 32 32" class="brand-mark" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="var(--src-salario)"/><path d="M16 2a14 14 0 0 1 0 28z" fill="var(--src-vale)"/></svg><span>Bolso</span></div>' +
      '<button type="button" class="btn primary wide" data-act="new-tx">' + icon('plus', 'xs') + 'Novo lançamento</button><nav>' +
      NAV.map(([id, l]) => link(id, l, 'side-link')).join('') + '</nav>' +
      '<p class="side-foot">' + (S.store.mode === 'local' ? 'Modo local' : esc((S.user && S.user.email) || '')) + '</p>';
  };

  B.parseHash = function () {
    const parts = (root.location.hash || '').replace(/^#\/?/, '').split('/');
    const r = NAV.some(([id]) => id === parts[0]) ? parts[0] : 'resumo';
    const sub = r === 'mais' && ['fixas', 'cartoes', 'nichos', 'dados'].includes(parts[1]) ? parts[1] : '';
    return { r, sub };
  };

  B.render = function () {
    const { r, sub } = B.parseHash();
    const changed = r !== S.route || sub !== S.sub;
    S.route = r; S.sub = sub;
    const y = root.scrollY;
    const fn = r === 'mais' && sub ? V[sub] : V[r];
    B.$('#view').innerHTML = fn();
    B.$$('[data-nav]').forEach((a) => { if (a.dataset.nav === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    root.document.title = 'Bolso, ' + (NAV.find(([id]) => id === r) || NAV[0])[1];
    root.scrollTo(0, changed ? 0 : y);
  };

  /* ---------- Ações de clique ---------- */

  const A = B.acts;
  A['month-prev'] = () => B.setMonth(F.addMonths(S.month, -1));
  A['month-next'] = () => B.setMonth(F.addMonths(S.month, 1));
  A['month-today'] = () => B.setMonth(B.curMonth());
  A.go = (el) => {
    if (el.dataset.status) S.f.status = el.dataset.status;
    B.go(el.dataset.to);
  };
  A['set-kind-filter'] = (el) => { S.f.kind = el.dataset.v; B.render(); };
  A['set-range'] = (el) => { S.ana.range = +el.dataset.v; B.render(); };
  A['toggle-paid'] = (el) => B.guard(async () => {
    const t = B.findTx(el.dataset.id);
    await B.updTx(t.id, { paid: !t.paid });
    B.render();
  });
  A['toggle-skip'] = (el) => B.guard(async () => {
    const t = B.findTx(el.dataset.id);
    await B.updTx(t.id, { skipped: false });
    B.toast('Voltou a contar neste mês.');
    B.render();
  });
  A['toggle-invoice-paid'] = (el) => B.guard(async () => {
    const inv = B.invoiceOf(el.dataset.card, el.dataset.month);
    if (!inv) return;
    await B.setInvoicePaid(inv.card_id, inv.month, !inv.paid);
    B.toast(inv.paid ? 'Fatura voltou para pendente.' : 'Fatura marcada como paga.');
    B.render();
  });
  A.signout = () => B.guard(async () => { await S.store.auth.signOut(); });

  A['export-csv'] = () => { B.download('bolso-lancamentos.csv', B.exportCSV(), 'text/csv;charset=utf-8'); B.toast('Planilha baixada.'); };
  A['export-json'] = () => { B.download('bolso-backup-' + B.today() + '.json', B.exportJSON(), 'application/json'); B.toast('Backup baixado.'); };
  A['import-json'] = () => B.$('#file-backup').click();
  A.wipe = () => B.guard(async () => {
    const ok = await B.ask({ title: 'Apagar todos os dados?', text: 'Isso remove tudo ' + (S.store.mode === 'local' ? 'deste aparelho' : 'da sua conta') + ' e não tem volta.', confirmWord: 'APAGAR', actions: [{ label: 'Apagar tudo', value: true, kind: 'danger' }] });
    if (!ok) return;
    await S.store.wipe();
    await B.reload();
    B.toast('Tudo apagado.');
    B.render();
  });
  A['install-app'] = () => B.guard(async () => {
    if (!S.installEvent) return;
    S.installEvent.prompt();
    await S.installEvent.userChoice;
    S.installEvent = null;
    B.render();
  });
})(window);
