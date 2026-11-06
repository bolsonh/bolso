/* Bolso: sheets.js
   Formulários em janela: lançamento, cartão, nicho e conta fixa. */
(function (root) {
  'use strict';
  const F = root.Fin, B = root.Bolso;
  const S = B.S, esc = B.esc, icon = B.icon;

  let cur = null; // formulário aberto: { draft, render(), field(), input(), change(), submit(), remove() }

  const seg = (name, opts, value) => '<div class="seg" role="group">' + opts.map(([v, l]) =>
    '<button type="button" aria-pressed="' + (value === v) + '" data-f="' + name + '" data-v="' + v + '">' + l + '</button>').join('') + '</div>';

  const head = (title) => '<div class="sheet-head"><h2 class="sheet-title">' + title + '</h2>' +
    '<button type="button" class="icon-btn" data-close aria-label="Fechar"><svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>';

  function showErr(msg, focusSel) {
    const el = B.$('#f-err');
    if (el) el.textContent = msg;
    if (focusSel) { const f = B.$(focusSel); if (f) { f.focus(); f.classList.add('bad'); } }
    return false;
  }

  function open(ctrl, focusSel) {
    cur = ctrl;
    B.sheet.open(ctrl.render());
    if (focusSel) setTimeout(() => { const f = B.$(focusSel); if (f) f.focus(); }, 60);
  }
  const redraw = () => { if (cur) B.sheet.set(cur.render()); };

  function wire() {
    const el = B.$('#sheet');
    el.addEventListener('click', (e) => {
      if (e.target === el) return B.sheet.close();
      if (e.target.closest('[data-close]')) return B.sheet.close();
      const b = e.target.closest('[data-f]');
      if (b && cur) return cur.field(b.dataset.f, b.dataset.v, b);
      if (e.target.closest('[data-del]') && cur) return cur.remove();
      if (e.target.closest('[data-skip]') && cur) return cur.skip();
      if (e.target.closest('[data-open-rec]') && cur) { const id = cur.draft.recurring_id; B.sheet.close(); return B.openRecurringSheet(id); }
    });
    el.addEventListener('input', (e) => {
      e.target.classList.remove('bad');
      const n = e.target.dataset.in;
      if (n && cur && cur.input) cur.input(n, e.target);
    });
    el.addEventListener('change', (e) => {
      const n = e.target.dataset.in;
      if (n && cur && cur.change) cur.change(n, e.target);
    });
    el.addEventListener('submit', (e) => { e.preventDefault(); if (cur) cur.submit(); });
    el.addEventListener('close', () => { cur = null; });
  }
  B.wireSheets = wire;

  /* ---------- Lançamento ---------- */

  function descSuggestions() {
    const count = new Map();
    for (const t of S.data.transactions.slice(-400)) count.set(t.description, (count.get(t.description) || 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([d]) => d);
  }

  function newTxDraft(kind, base) {
    return Object.assign({
      id: null, kind: kind || 'despesa', amountText: '', description: '', date: B.today(),
      category: null, card_id: null, source: 'salario', repeat: 'once', n: 2,
      nextMonth: false, paid: true, paidTouched: false, cardTouched: false, sourceTouched: false,
      recurring_id: null, group_id: null, installment_no: null, installments_total: null, skipped: false,
    }, base || {});
  }

  const paidDefault = (d) => d.date <= B.today();
  const isPaid = (d) => (d.paidTouched || d.id ? d.paid : paidDefault(d));

  function txRender(d) {
    const isIn = d.kind === 'receita';
    const edit = !!d.id;
    const m = F.parseMoney(d.amountText);
    let h = '<form id="tx-form" novalidate autocomplete="off">' + head(edit ? 'Editar lançamento' : 'Novo lançamento');
    if (!edit) h += seg('kind', [['despesa', 'Saída'], ['receita', 'Entrada']], d.kind);

    h += '<label class="field"><span>Valor' + (d.repeat === 'installments' ? ' total da compra' : '') + '</span><span class="money"><i>R$</i>' +
      '<input id="f-amount" data-in="amount" inputmode="decimal" placeholder="0,00" value="' + esc(d.amountText) + '" aria-label="Valor em reais"></span></label>';
    h += '<label class="field"><span>Descrição</span><input id="f-desc" data-in="desc" list="desc-list" maxlength="80" placeholder="' + (isIn ? 'Ex.: Salário, Freela' : 'Ex.: Mercado, Uber, Netflix') + '" value="' + esc(d.description) + '"></label>' +
      '<datalist id="desc-list">' + descSuggestions().map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist>';
    h += '<label class="field"><span>' + (isIn ? 'Data em que cai' : 'Data') + '</span><input id="f-date" data-in="date" type="date" value="' + esc(d.date) + '"></label>';

    if (!isIn) {
      const cats = F.CATEGORIES.concat(S.data.categories.map((c) => ({ key: c.id, emoji: c.emoji, name: c.name })));
      h += '<div class="field"><span>Nicho</span><div class="opts" data-keep-scroll>' + cats.map((c) =>
        '<button type="button" class="opt" aria-pressed="' + (d.category === c.key) + '" data-f="category" data-v="' + esc(c.key) + '"><span class="e">' + esc(c.emoji) + '</span>' + esc(c.name) + '</button>').join('') +
        '<button type="button" class="opt add" data-f="new-cat">+ Novo nicho</button></div></div>';
      h += '<div class="field"><span>Cartão</span><div class="opts row">' +
        '<button type="button" class="opt" aria-pressed="' + (!d.card_id) + '" data-f="card_id" data-v=""><i class="dot" style="--c:var(--muted)"></i>' + F.CASH_NAME + '</button>' +
        S.data.cards.map((c) => '<button type="button" class="opt" aria-pressed="' + (d.card_id === c.id) + '" data-f="card_id" data-v="' + c.id + '"><i class="dot" style="--c:' + esc(c.color) + '"></i>' + esc(c.name) + '</button>').join('') +
        '<button type="button" class="opt add" data-f="new-card">+ Novo cartão</button></div></div>';
    }

    h += '<div class="field"><span>' + (isIn ? 'Esta entrada é do' : 'Pago com o') + '</span>' + seg('source', [['salario', 'Salário'], ['vale', 'Vale'], ['outra', 'Outra fonte']], d.source) + '</div>';

    if (!edit) {
      h += '<div class="field"><span>Repetição</span>' + seg('repeat', isIn ? [['once', 'Só esta vez'], ['monthly', 'Todo mês']] : [['once', 'Só esta vez'], ['monthly', 'Todo mês'], ['installments', 'Parcelado']], d.repeat) + '</div>';
      if (d.repeat === 'installments') {
        h += '<label class="field"><span>Número de parcelas</span><input id="f-n" data-in="n" type="number" inputmode="numeric" min="2" max="60" value="' + esc(d.n) + '"></label>' +
          '<p class="hint" id="inst-hint">' + installHint(d) + '</p>';
      } else if (d.repeat === 'monthly') {
        h += '<p class="hint" id="rep-hint">Entra sozinha todo mês, no dia ' + (d.date ? F.dayOf(d.date) : '') + ', como pendente. Para parar, pause em Mais, Contas fixas.</p>';
      }
    }
    if (isIn) {
      h += '<label class="check-row"><input type="checkbox" data-in="next"' + (d.nextMonth ? ' checked' : '') + '><span>Cai no fim do mês e vale para o <b>mês seguinte</b></span></label>';
    }
    if (d.repeat !== 'installments' || edit) {
      h += '<label class="check-row"><input type="checkbox" data-in="paid"' + (isPaid(d) ? ' checked' : '') + '><span>' + (isIn ? 'Já recebi' : 'Já paguei') + '</span></label>';
    }

    if (edit && d.recurring_id) {
      h += '<p class="callout">Esta é uma conta fixa. Mudar aqui vale só para este mês. Para mudar os próximos meses, <button type="button" class="link-btn" data-open-rec>edite a conta fixa</button>.</p>';
    }
    if (edit && d.installments_total) h += '<p class="callout">Parcela ' + d.installment_no + ' de ' + d.installments_total + '. Mudar aqui altera só esta parcela.</p>';

    h += '<p class="form-err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary" id="f-save">Salvar</button>';
    if (edit && d.recurring_id) h += '<button type="button" class="btn" data-skip>' + (d.skipped ? 'Voltar a contar neste mês' : 'Pular este mês') + '</button>';
    else if (edit) h += '<button type="button" class="btn danger-text" data-del>Excluir</button>';
    h += '</div></form>';
    return h;
  }

  function installHint(d) {
    const total = F.parseMoney(d.amountText);
    const n = parseInt(d.n, 10);
    if (!(total > 0) || !(n >= 2)) return 'Informe o valor total e o número de parcelas.';
    const parts = F.splitInstallments(F.toCents(total), n);
    const first = parts[0] / 100, last = parts[n - 1] / 100;
    return first === last ? n + 'x de ' + F.fmtBRL(first) + '. A primeira vence em ' + F.dayLabel(d.date) + '.'
      : n + ' parcelas: ' + F.fmtBRL(first) + ' e as últimas de ' + F.fmtBRL(last) + ' (diferença de centavos).';
  }

  function autofill(d) {
    const key = d.description.trim().toLowerCase();
    if (!key || d.id) return false;
    const prev = S.data.transactions.slice().reverse().find((t) => t.kind === d.kind && t.description.trim().toLowerCase() === key);
    if (!prev) return false;
    let changed = false;
    if (d.kind === 'despesa' && !d.category && prev.category) { d.category = prev.category; changed = true; }
    if (!d.cardTouched && d.kind === 'despesa' && d.card_id !== prev.card_id) { d.card_id = prev.card_id; changed = true; }
    if (!d.sourceTouched && d.source !== prev.source) { d.source = prev.source; changed = true; }
    if (!F.parseMoney(d.amountText) > 0 && prev.amount > 0 && d.repeat !== 'installments') { d.amountText = F.fmtNum(prev.amount); changed = true; }
    return changed;
  }

  function txMonth(d) { return d.kind === 'receita' && d.nextMonth ? F.addMonths(F.monthOf(d.date), 1) : F.monthOf(d.date); }

  function openTxSheet(kind, base) {
    const d = newTxDraft(kind, base);
    const ctrl = {
      draft: d,
      render: () => txRender(d),
      field(name, v) {
        if (name === 'kind') { d.kind = v; if (v === 'receita') { d.category = null; if (d.repeat === 'installments') d.repeat = 'once'; } return redraw(); }
        if (name === 'category') { d.category = v; return redraw(); }
        if (name === 'card_id') { d.card_id = v || null; d.cardTouched = true; return redraw(); }
        if (name === 'source') { d.source = v; d.sourceTouched = true; return redraw(); }
        if (name === 'repeat') { d.repeat = v; return redraw(); }
        if (name === 'new-card') return openCardSheet(null, d);
        if (name === 'new-cat') return openCategorySheet(d);
      },
      input(name, el) {
        if (name === 'amount') d.amountText = el.value;
        if (name === 'desc') d.description = el.value;
        if (name === 'date') {
          d.date = el.value;
          const cb = B.$('[data-in="paid"]');
          if (cb && !d.paidTouched && !d.id) cb.checked = paidDefault(d);
          const rh = B.$('#rep-hint');
          if (rh && d.date) rh.textContent = 'Entra sozinha todo mês, no dia ' + F.dayOf(d.date) + ', como pendente. Para parar, pause em Mais, Contas fixas.';
        }
        if (name === 'n') d.n = el.value;
        if (name === 'amount' || name === 'n' || name === 'date') { const h = B.$('#inst-hint'); if (h) h.textContent = installHint(d); }
      },
      change(name, el) {
        if (name === 'paid') { d.paid = el.checked; d.paidTouched = true; }
        if (name === 'next') d.nextMonth = el.checked;
        if (name === 'amount') { const v = F.parseMoney(el.value); if (v > 0) { d.amountText = F.fmtNum(v); el.value = d.amountText; } }
        if (name === 'desc' && autofill(d)) redraw();
      },
      async submit() {
        const amount = F.parseMoney(d.amountText);
        if (!(amount > 0)) return showErr('Digite um valor maior que zero.', '#f-amount');
        if (!d.date) return showErr('Escolha a data.', '#f-date');
        if (d.kind === 'despesa' && !d.category) return showErr('Escolha o nicho do gasto.');
        let n = 1;
        if (d.repeat === 'installments') {
          n = parseInt(d.n, 10);
          if (!(n >= 2 && n <= 60)) return showErr('Use de 2 a 60 parcelas.', '#f-n');
        }
        const description = d.description.trim() || (d.kind === 'despesa' ? B.catName(d.category) : B.srcName(d.source));
        const btn = B.$('#f-save');
        btn.disabled = true;
        const month = txMonth(d);
        const ok = await B.guard(async () => {
          const base = {
            kind: d.kind, description, amount, date: d.date, month,
            category: d.kind === 'despesa' ? d.category : null, card_id: d.kind === 'despesa' ? d.card_id : null,
            source: d.source, paid: isPaid(d), skipped: d.skipped,
          };
          if (d.id) {
            await B.updTx(d.id, base);
          } else if (d.repeat === 'installments') {
            await B.addTxs(F.buildInstallments({ description, totalAmount: amount, n, firstDate: d.date, category: d.category, card_id: d.card_id, source: d.source, today: B.today() }));
          } else if (d.repeat === 'monthly') {
            const rec = {
              id: F.uid(), kind: d.kind, description, amount, day: F.dayOf(d.date), category: base.category, card_id: base.card_id,
              source: d.source, month_offset: d.kind === 'receita' && d.nextMonth ? 1 : 0, start_month: month, active: true,
            };
            await B.addRecurring(rec, Object.assign({ id: F.uid(), group_id: null, installment_no: null, installments_total: null }, base));
          } else {
            await B.addTxs([Object.assign({ id: F.uid(), recurring_id: null, group_id: null, installment_no: null, installments_total: null }, base)]);
          }
          return true;
        });
        if (btn) btn.disabled = false;
        if (!ok) return;
        B.sheet.close();
        const moved = month !== S.month;
        if (moved) await B.setMonth(month); else B.render();
        B.toast(d.id ? 'Alterações salvas.' : moved ? 'Salvo em ' + F.monthLabel(month) + '.' : 'Lançamento salvo.');
      },
      async remove() {
        const t = B.findTx(d.id);
        let ids = [d.id];
        if (t.installments_total > 1) {
          const choice = await B.ask({
            title: 'Excluir parcela?', text: 'Esta compra tem ' + t.installments_total + ' parcelas.',
            actions: [{ label: 'Só esta parcela', value: 'one', kind: 'danger' }, { label: 'Esta e as próximas', value: 'next', kind: 'danger' }, { label: 'Todas as parcelas', value: 'all', kind: 'danger' }],
          });
          if (!choice) return;
          const group = S.data.transactions.filter((x) => x.group_id === t.group_id);
          if (choice === 'next') ids = group.filter((x) => x.installment_no >= t.installment_no).map((x) => x.id);
          if (choice === 'all') ids = group.map((x) => x.id);
        } else {
          const ok = await B.ask({ title: 'Excluir este lançamento?', text: t.description + ', ' + F.fmtBRL(t.amount) + '.', actions: [{ label: 'Excluir', value: true, kind: 'danger' }] });
          if (!ok) return;
        }
        const done = await B.guard(async () => { await B.delTxs(ids); return true; });
        if (!done) return;
        B.sheet.close(); B.render(); B.toast(ids.length > 1 ? ids.length + ' lançamentos excluídos.' : 'Lançamento excluído.');
      },
      async skip() {
        const done = await B.guard(async () => { await B.updTx(d.id, { skipped: !d.skipped }); return true; });
        if (!done) return;
        B.sheet.close(); B.render(); B.toast(d.skipped ? 'Voltou a contar neste mês.' : 'Conta pulada neste mês.');
      },
    };
    open(ctrl, d.id ? null : '#f-amount');
  }

  B.openTxSheet = openTxSheet;
  B.editTx = (id) => {
    const t = B.findTx(id);
    if (!t) return;
    const base = {
      id: t.id, kind: t.kind, amountText: F.fmtNum(t.amount), description: t.description, date: t.date, category: t.category,
      card_id: t.card_id, source: t.source, paid: t.paid, paidTouched: true, nextMonth: t.kind === 'receita' && t.month !== F.monthOf(t.date),
      recurring_id: t.recurring_id, group_id: t.group_id, installment_no: t.installment_no, installments_total: t.installments_total, skipped: t.skipped, cardTouched: true, sourceTouched: true,
    };
    openTxSheet(t.kind, base);
  };

  /* ---------- Cartão ---------- */

  const CARD_COLORS = ['#2a78d6', '#6250d6', '#e87ba4', '#e34948', '#eb6834', '#eda100', '#1baf7a', '#008300', '#52514e', '#0b0b0b'];

  function openCardSheet(id, returnToTx) {
    const ex = id ? S.data.cards.find((c) => c.id === id) : null;
    const d = { name: ex ? ex.name : '', kind: ex ? ex.kind : 'credito', color: ex ? ex.color : CARD_COLORS[S.data.cards.length % CARD_COLORS.length] };
    const back = () => { if (returnToTx) { cur = null; openTxFromDraft(returnToTx); } else B.sheet.close(); };
    const ctrl = {
      draft: d,
      render: () => '<form id="card-form" novalidate autocomplete="off">' + head(ex ? 'Editar cartão' : 'Novo cartão') +
        '<label class="field"><span>Nome</span><input id="f-name" data-in="name" maxlength="30" placeholder="Ex.: Nubank, Itaú, Débito Caixa" value="' + esc(d.name) + '"></label>' +
        '<div class="field"><span>Tipo</span>' + seg('kind', [['credito', 'Crédito'], ['debito', 'Débito']], d.kind) + '</div>' +
        '<div class="field"><span>Cor</span><div class="swatches">' + CARD_COLORS.map((c) => '<button type="button" class="sw" aria-label="Cor ' + c + '" aria-pressed="' + (d.color === c) + '" data-f="color" data-v="' + c + '" style="--c:' + c + '"></button>').join('') + '</div></div>' +
        '<p class="form-err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary" id="f-save">Salvar</button>' +
        (ex ? '<button type="button" class="btn danger-text" data-del>Excluir cartão</button>' : '') + '</div></form>',
      field(name, v) { d[name] = v; redraw(); },
      input(name, el) { if (name === 'name') d.name = el.value; },
      async submit() {
        const name = d.name.trim();
        if (!name) return showErr('Dê um nome ao cartão.', '#f-name');
        const row = await B.guard(async () => (ex ? (await B.updCard(ex.id, { name, kind: d.kind, color: d.color }), ex) : B.addCard({ id: F.uid(), name, kind: d.kind, color: d.color })));
        if (!row) return;
        if (returnToTx) { returnToTx.card_id = row.id; returnToTx.cardTouched = true; back(); }
        else { B.sheet.close(); B.render(); B.toast('Cartão salvo.'); }
      },
      async remove() {
        const ok = await B.ask({ title: 'Excluir ' + ex.name + '?', text: 'Os lançamentos continuam no Extrato e passam a aparecer como ' + F.CASH_NAME + '.', actions: [{ label: 'Excluir cartão', value: true, kind: 'danger' }] });
        if (!ok) return;
        const done = await B.guard(async () => { await B.delCard(ex.id); return true; });
        if (!done) return;
        B.sheet.close(); B.render(); B.toast('Cartão excluído.');
      },
    };
    open(ctrl, ex ? null : '#f-name');
  }
  B.openCardSheet = openCardSheet;

  /* Reabre o formulário de lançamento com o rascunho que já estava preenchido. */
  function openTxFromDraft(d) {
    const ctrlKind = d.kind;
    openTxSheet(ctrlKind, d);
  }

  /* ---------- Nicho ---------- */

  const EMOJI_PICKS = ['🍕', '☕', '🚗', '🏋️', '🎮', '👶', '🎓', '🧰', '💼', '🏥', '🐶', '🌱', '🎬', '🛠️', '📦', '💈'];

  function openCategorySheet(returnToTx) {
    const d = { emoji: '📦', name: '' };
    const ctrl = {
      draft: d,
      render: () => '<form id="cat-form" novalidate autocomplete="off">' + head('Novo nicho') +
        '<label class="field"><span>Nome</span><input id="f-name" data-in="name" maxlength="30" placeholder="Ex.: Academia, Filhos, Empresa" value="' + esc(d.name) + '"></label>' +
        '<div class="field"><span>Ícone</span><div class="opts row">' + EMOJI_PICKS.map((e) => '<button type="button" class="opt emoji" aria-pressed="' + (d.emoji === e) + '" data-f="emoji" data-v="' + e + '">' + e + '</button>').join('') + '</div></div>' +
        '<p class="form-err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary" id="f-save">Salvar nicho</button></div></form>',
      field(name, v) { d[name] = v; redraw(); },
      input(name, el) { if (name === 'name') d.name = el.value; },
      async submit() {
        const name = d.name.trim();
        if (!name) return showErr('Dê um nome ao nicho.', '#f-name');
        if (F.CATEGORIES.concat(S.data.categories).some((c) => c.name.toLowerCase() === name.toLowerCase())) return showErr('Já existe um nicho com esse nome.', '#f-name');
        const row = await B.guard(() => B.addCategory({ id: F.uid(), name, emoji: d.emoji }));
        if (!row) return;
        if (returnToTx) { returnToTx.category = row.id; cur = null; openTxFromDraft(returnToTx); }
        else { B.sheet.close(); B.render(); B.toast('Nicho criado.'); }
      },
    };
    open(ctrl, '#f-name');
  }
  B.openCategorySheet = openCategorySheet;

  /* ---------- Conta fixa ---------- */

  function openRecurringSheet(id) {
    const ex = id ? B.findRec(id) : null;
    const d = ex ? {
      kind: ex.kind, description: ex.description, amountText: F.fmtNum(ex.amount), day: ex.day, category: ex.category, card_id: ex.card_id,
      source: ex.source, nextMonth: ex.month_offset === 1, active: ex.active,
    } : { kind: 'despesa', description: '', amountText: '', day: 5, category: null, card_id: null, source: 'salario', nextMonth: false, active: true };
    const ctrl = {
      draft: d,
      render() {
        const isIn = d.kind === 'receita';
        let h = '<form id="rec-form" novalidate autocomplete="off">' + head(ex ? 'Editar conta fixa' : 'Nova conta fixa');
        if (!ex) h += seg('kind', [['despesa', 'Saída'], ['receita', 'Entrada']], d.kind);
        h += '<label class="field"><span>Descrição</span><input id="f-desc" data-in="desc" maxlength="80" placeholder="' + (isIn ? 'Ex.: Salário, Vale' : 'Ex.: Aluguel, Internet') + '" value="' + esc(d.description) + '"></label>' +
          '<label class="field"><span>Valor todo mês</span><span class="money"><i>R$</i><input id="f-amount" data-in="amount" inputmode="decimal" placeholder="0,00" value="' + esc(d.amountText) + '" aria-label="Valor em reais"></span></label>' +
          '<label class="field"><span>Dia do mês</span><input id="f-day" data-in="day" type="number" inputmode="numeric" min="1" max="31" value="' + esc(d.day) + '"></label>';
        if (!isIn) {
          const cats = F.CATEGORIES.concat(S.data.categories.map((c) => ({ key: c.id, emoji: c.emoji, name: c.name })));
          h += '<div class="field"><span>Nicho</span><div class="opts" data-keep-scroll>' + cats.map((c) =>
            '<button type="button" class="opt" aria-pressed="' + (d.category === c.key) + '" data-f="category" data-v="' + esc(c.key) + '"><span class="e">' + esc(c.emoji) + '</span>' + esc(c.name) + '</button>').join('') + '</div></div>';
          h += '<div class="field"><span>Cartão</span><div class="opts row"><button type="button" class="opt" aria-pressed="' + (!d.card_id) + '" data-f="card_id" data-v=""><i class="dot" style="--c:var(--muted)"></i>' + F.CASH_NAME + '</button>' +
            S.data.cards.map((c) => '<button type="button" class="opt" aria-pressed="' + (d.card_id === c.id) + '" data-f="card_id" data-v="' + c.id + '"><i class="dot" style="--c:' + esc(c.color) + '"></i>' + esc(c.name) + '</button>').join('') + '</div></div>';
        }
        h += '<div class="field"><span>' + (isIn ? 'Entrada do' : 'Pago com o') + '</span>' + seg('source', [['salario', 'Salário'], ['vale', 'Vale'], ['outra', 'Outra fonte']], d.source) + '</div>';
        if (isIn) h += '<label class="check-row"><input type="checkbox" data-in="next"' + (d.nextMonth ? ' checked' : '') + '><span>Cai no fim do mês e vale para o <b>mês seguinte</b></span></label>';
        if (ex) {
          h += '<label class="check-row"><input type="checkbox" data-in="active"' + (d.active ? ' checked' : '') + '><span>Ativa (desmarque para pausar)</span></label>' +
            '<p class="hint">Ao salvar, as contas ainda pendentes deste mês em diante são refeitas com os dados novos. O que já foi pago não muda.</p>';
        } else {
          h += '<p class="hint">Começa neste mês e se repete sozinha. Entra como pendente e você marca quando pagar.</p>';
        }
        h += '<p class="form-err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary" id="f-save">Salvar</button>' + (ex ? '<button type="button" class="btn danger-text" data-del>Excluir conta fixa</button>' : '') + '</div></form>';
        return h;
      },
      field(name, v) {
        if (name === 'kind') { d.kind = v; if (v === 'receita') d.category = null; }
        else if (name === 'card_id') d.card_id = v || null;
        else d[name] = v;
        redraw();
      },
      input(name, el) {
        if (name === 'desc') d.description = el.value;
        if (name === 'amount') d.amountText = el.value;
        if (name === 'day') d.day = el.value;
      },
      change(name, el) {
        if (name === 'next') d.nextMonth = el.checked;
        if (name === 'active') d.active = el.checked;
        if (name === 'amount') { const v = F.parseMoney(el.value); if (v > 0) { d.amountText = F.fmtNum(v); el.value = d.amountText; } }
      },
      async submit() {
        const amount = F.parseMoney(d.amountText);
        const day = parseInt(d.day, 10);
        if (!d.description.trim()) return showErr('Dê um nome à conta.', '#f-desc');
        if (!(amount > 0)) return showErr('Digite um valor maior que zero.', '#f-amount');
        if (!(day >= 1 && day <= 31)) return showErr('O dia deve ser de 1 a 31.', '#f-day');
        if (d.kind === 'despesa' && !d.category) return showErr('Escolha o nicho.');
        const fields = {
          kind: d.kind, description: d.description.trim(), amount, day, category: d.kind === 'despesa' ? d.category : null,
          card_id: d.kind === 'despesa' ? d.card_id : null, source: d.source, month_offset: d.kind === 'receita' && d.nextMonth ? 1 : 0,
        };
        const btn = B.$('#f-save');
        btn.disabled = true;
        const ok = await B.guard(async () => {
          if (ex) await B.updRecurring(ex.id, Object.assign(fields, { active: d.active }));
          else await B.addRecurring(Object.assign({ id: F.uid(), start_month: B.curMonth(), active: true }, fields), null);
          return true;
        });
        btn.disabled = false;
        if (!ok) return;
        B.sheet.close(); B.render(); B.toast('Conta fixa salva.');
      },
      async remove() {
        const yes = await B.ask({ title: 'Excluir ' + ex.description + '?', text: 'As contas pendentes de agora em diante somem. O que já foi pago continua no Extrato.', actions: [{ label: 'Excluir conta fixa', value: true, kind: 'danger' }] });
        if (!yes) return;
        const done = await B.guard(async () => { await B.delRecurring(ex.id); return true; });
        if (!done) return;
        B.sheet.close(); B.render(); B.toast('Conta fixa excluída.');
      },
    };
    open(ctrl, ex ? null : '#f-desc');
  }
  B.openRecurringSheet = openRecurringSheet;

  /* ---------- Ações de clique ---------- */

  const A = B.acts;
  A['new-tx'] = (el) => openTxSheet(el.dataset.kind || 'despesa');
  A['edit-tx'] = (el) => B.editTx(el.dataset.id);
  A['new-card'] = () => openCardSheet(null);
  A['edit-card'] = (el) => openCardSheet(el.dataset.id);
  A['new-cat'] = () => openCategorySheet(null);
  A['edit-cat'] = (el) => B.guard(async () => {
    const c = S.data.categories.find((x) => x.id === el.dataset.id);
    const used = S.data.transactions.filter((t) => t.category === c.id).length;
    const ok = await B.ask({ title: 'Apagar o nicho ' + c.name + '?', text: used ? used + ' lançamentos passam para "Outros".' : 'Nenhum lançamento usa este nicho.', actions: [{ label: 'Apagar nicho', value: true, kind: 'danger' }] });
    if (!ok) return;
    await B.delCategory(c.id);
    B.render(); B.toast('Nicho apagado.');
  });
  A['new-rec'] = () => openRecurringSheet(null);
  A['edit-rec'] = (el) => openRecurringSheet(el.dataset.id);
})(window);
