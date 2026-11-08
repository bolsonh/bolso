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
    '<button type="button" class="icon-btn" data-close aria-label="Fechar"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>';

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

  /** Uma ação por vez na folha: o segundo toque enquanto o primeiro grava (rede lenta) é ignorado, em vez de criar em dobro. */
  let busy = false;
  async function once(fn) {
    if (busy) return;
    busy = true;
    try { await fn(); } finally { busy = false; }
  }

  function wire() {
    const el = B.$('#sheet');
    el.addEventListener('click', (e) => {
      if (e.target === el) return B.sheet.close();
      if (e.target.closest('[data-close]')) return B.sheet.close();
      const b = e.target.closest('[data-f]');
      if (b && cur) return cur.field(b.dataset.f, b.dataset.v, b);
      if (e.target.closest('[data-del]') && cur) return once(() => cur.remove());
      if (e.target.closest('[data-skip]') && cur) return once(() => cur.skip());
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
    el.addEventListener('submit', (e) => { e.preventDefault(); if (cur) once(() => cur.submit()); });
    el.addEventListener('close', () => { if (!el.open) cur = null; }); // o evento chega depois: se outra folha já abriu, o formulário novo não pode ser zerado
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
      category: null, card_id: null, source: 'salario', repeat: 'once', n: 2, startNo: '1',
      nextMonth: false, paid: true, paidTouched: false, cardTouched: false, sourceTouched: false, catTouched: false, catFrom: '',
      recurring_id: null, group_id: null, installment_no: null, installments_total: null, skipped: false, tag: '',
      split: 'nao', splitWho: '', splitPartner: false, splitMode: 'half', splitAmt: '', splitDone: false,
    }, base || {});
  }

  const paidDefault = (d) => d.date <= B.today();
  const isPaid = (d) => (d.paidTouched || d.id ? d.paid : paidDefault(d));

  const nb = (v) => F.fmtBRL(v).replace(' ', '\u00a0'); // valor que não quebra linha no meio
  const dm = (dateStr) => F.pad(F.dayOf(dateStr)) + '/' + dateStr.slice(5, 7);
  const cardOf = (d) => (d.kind === 'despesa' && d.card_id ? B.card(d.card_id) : null);
  /** Cartão de crédito com fechamento e vencimento: a compra vai para a fatura e não pergunta salário ou vale. */
  const billedOf = (d) => { const c = cardOf(d); return F.isBilled(c) ? c : null; };

  /** Onde a compra cai: mês da fatura, renda e situação. Ao editar, só muda o que mudou de verdade. */
  function billedPlace(d, card) {
    const pl = F.placeOnInvoice(card, d.date, S.data.transactions, B.today(), d.id);
    const prev = d.id ? B.findTx(d.id) : null;
    if (!prev) return pl;
    const sameCard = prev.card_id === d.card_id;
    const month = prev.recurring_id ? prev.month : pl.month; // conta fixa mantém o mês (é a chave dela)
    const sameInvoice = sameCard && prev.month === month;
    // na mesma fatura nada muda; ao trocar de fatura vale a situação dela, mas o que já estava pago continua pago
    const paid = sameInvoice ? prev.paid : sameCard ? prev.paid || pl.paid : pl.paid;
    return Object.assign({}, pl, { month, source: sameInvoice ? prev.source : pl.source, paid });
  }

  function cardNote(d) {
    const c = cardOf(d);
    if (!c || c.kind !== 'credito') return '';
    if (!F.isBilled(c)) {
      return '<p class="hint">Este cartão ainda não tem fechamento e vencimento, então o Bolso não sabe em qual fatura a compra cai. <button type="button" class="link-btn" data-f="cfg-card">Informar agora</button></p>';
    }
    if (!d.date) return '';
    const pl = billedPlace(d, c);
    return '<p class="hint">Cai na fatura de <b>' + esc(F.monthName(pl.month).toLowerCase()) + '</b>: fecha em ' + dm(F.invoiceDates(c, pl.month).closeDate) + ' e vence em ' + dm(F.invoiceDates(c, pl.month).dueDate) + '. ' +
      (pl.source === 'definir' ? 'A renda que paga esta fatura está a definir; escolha em Mais, Cartões.' : 'Paga com ' + esc(B.srcName(pl.source)) + '.') + '</p>';
  }

  /** Renda de onde sai o gasto (sem cartão de fatura): vem da regra pela data enquanto a pessoa não escolher outra. */
  function syncSource(d) {
    if (d.id || d.kind !== 'despesa' || d.sourceTouched || billedOf(d) || !d.date) return;
    const inc = F.incomeForDate(S.data.recurring, d.date);
    d.source = inc ? inc.key : 'definir';
  }

  /** Campo "Sai de" (entrada: "Esta entrada é do"), com a dica de por que veio preenchido. */
  function srcField(d) {
    if (billedOf(d)) return '';
    const isIn = d.kind === 'receita';
    let h = '<div class="field"><span>' + (isIn ? 'Esta entrada é do' : 'Sai de') + '</span>' +
      seg('source', [['salario', 'Salário'], ['vale', 'Vale'], ['outra', 'Outra fonte']], d.source) + '</div>';
    if (!isIn && !d.id) {
      if (d.source === 'definir') {
        h += '<p class="hint">Nenhuma renda cadastrada, então este gasto fica <b>A definir</b>. Cadastre suas rendas em Mais, Contas fixas (Entrada) ou escolha uma aqui.</p>';
      } else if (!d.sourceTouched && d.date) {
        const opts = F.incomeOptions(S.data.recurring);
        h += '<p class="hint">' + (opts.length === 1
          ? 'Sai do <b>' + esc(B.srcName(d.source)) + '</b>, a única renda cadastrada.'
          : 'Pela data (' + dm(d.date) + '), sai do <b>' + esc(B.srcName(d.source)) + '</b>.') + ' Toque em outra para trocar.</p>';
      }
    }
    return h;
  }

  /** Aviso ao lançar com data antiga: se cair num mês de renda que já fechou, entra mesmo assim e fica com marca de ajuste. */
  function lateNote(d) {
    if (d.id || !d.date) return '';
    const card = d.kind === 'despesa' ? billedOf(d) : null;
    const paidOn = card ? billedPlace(d, card).dueDate : d.date; // fatura conta no vencimento; o resto, na data
    const cyc = F.cycleOf(paidOn);
    const end = F.cycleDates(cyc).end;
    if (B.today() <= end) return '';
    return '<p class="hint">Cai no mês de renda de <b>' + esc(F.monthName(cyc).toLowerCase()) + '</b>, que fechou em ' + dm(end) +
      '. Entra mesmo assim: o mês continua fechado e ganha uma marca de ajuste.</p>';
  }

  /** Parcelar só faz sentido numa saída no cartão de crédito. */
  const canInstall = (d) => { const c = cardOf(d); return !!c && c.kind === 'credito'; };
  /** Se o cartão mudou para um que não é crédito (ou a entrada virou saída de outro tipo), volta para "Só esta vez". */
  const fixRepeat = (d) => { if (!d.id && d.repeat === 'installments' && !canInstall(d)) d.repeat = 'once'; };

  function txRender(d) {
    fixRepeat(d);
    syncSource(d);
    const isIn = d.kind === 'receita';
    const edit = !!d.id;
    const m = F.parseMoney(d.amountText);
    let h = '<form id="tx-form" novalidate autocomplete="off">' + head(edit ? 'Editar lançamento' : 'Novo lançamento');
    if (!edit) h += seg('kind', [['despesa', 'Saída'], ['receita', 'Entrada']], d.kind);

    h += '<label class="field"><span>Valor' + (d.repeat === 'installments' ? ' total da compra' : '') + '</span><span class="money"><i>R$</i>' +
      '<input id="f-amount" data-in="amount" inputmode="decimal" placeholder="0,00" value="' + esc(d.amountText) + '" aria-label="Valor em reais"></span></label>';
    h += '<label class="field"><span>Descrição</span><input id="f-desc" data-in="desc" list="desc-list" maxlength="80" placeholder="' + (isIn ? 'Ex.: Salário, Freela' : 'Ex.: Mercado, Uber, Netflix') + '" value="' + esc(d.description) + '"></label>' +
      '<datalist id="desc-list">' + descSuggestions().map((x) => '<option value="' + esc(x) + '">').join('') + '</datalist>' +
      '<div id="inst-text">' + instTextHint(d) + '</div>';
    h += '<label class="field"><span>' + (isIn ? 'Data em que cai' : 'Data') + '</span><input id="f-date" data-in="date" type="date" value="' + esc(d.date) + '"></label>';

    if (!isIn) {
      const cats = F.CATEGORIES.concat(S.data.categories.map((c) => ({ key: c.id, emoji: c.emoji, name: c.name })));
      h += '<div class="field"><span>Nicho</span><div class="opts" data-keep-scroll>' + cats.map((c) =>
        '<button type="button" class="opt" aria-pressed="' + (d.category === c.key) + '" data-f="category" data-v="' + esc(c.key) + '"><span class="e">' + esc(c.emoji) + '</span>' + esc(c.name) + '</button>').join('') +
        '<button type="button" class="opt add" data-f="new-cat">+ Novo nicho</button></div></div>' +
        '<div id="cat-hint">' + catHint(d) + '</div>';
      h += '<div class="field"><span>Cartão</span><div class="opts row">' +
        '<button type="button" class="opt" aria-pressed="' + (!d.card_id) + '" data-f="card_id" data-v=""><i class="dot" style="--c:var(--muted)"></i>' + F.CASH_NAME + '</button>' +
        S.data.cards.map((c) => '<button type="button" class="opt" aria-pressed="' + (d.card_id === c.id) + '" data-f="card_id" data-v="' + c.id + '"><i class="dot" style="--c:' + esc(F.safeColor(c.color)) + '"></i>' + esc(c.name) + '</button>').join('') +
        '<button type="button" class="opt add" data-f="new-card">+ Novo cartão</button></div></div>' +
        '<div id="card-note">' + cardNote(d) + '</div>';
    }
    if (tagAllowed(d)) h += tagField(d);
    if (splitAllowed(d)) h += splitField(d);
    h += '<div id="late-note">' + lateNote(d) + '</div>';

    const billed = !!billedOf(d);
    h += '<div id="src-field">' + srcField(d) + '</div>';

    if (!edit) {
      const inst = d.repeat === 'installments';
      // "Parcelado?" só existe para cartão de crédito. Dinheiro, Pix e débito não perguntam.
      if (canInstall(d)) h += '<div class="field"><span>Parcelado?</span>' + seg('parcelado', [['nao', 'Não'], ['sim', 'Sim']], inst ? 'sim' : 'nao') + '</div>';
      if (!inst) h += '<div class="field"><span>Repetição</span>' + seg('repeat', [['once', 'Só esta vez'], ['monthly', 'Todo mês']], d.repeat) + '</div>';
      if (inst) {
        h += '<label class="field"><span>Em quantas vezes?</span><input id="f-n" data-in="n" type="number" inputmode="numeric" min="2" max="60" value="' + esc(d.n) + '"></label>' +
          '<label class="field"><span>Em qual parcela você está?</span><input id="f-start" data-in="start" type="number" inputmode="numeric" min="1" max="60" value="' + esc(d.startNo) + '"></label>' +
          '<p class="hint" id="inst-hint">' + installHint(d) + '</p>';
      } else if (d.repeat === 'monthly') {
        h += '<p class="hint" id="rep-hint">Entra sozinha todo mês, no dia ' + (d.date ? F.dayOf(d.date) : '') + ', como pendente. Para parar, pause em Mais, Contas fixas.</p>';
      }
    }
    if (isIn) {
      h += '<label class="check-row"><input type="checkbox" data-in="next"' + (d.nextMonth ? ' checked' : '') + '><span>Cai no fim do mês e vale para o <b>mês seguinte</b></span></label>';
    }
    if ((d.repeat !== 'installments' || edit) && !billed) {
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

  /** Etiqueta: só em saída que não é conta fixa (a conta fixa volta todo mês sem etiqueta). */
  const tagAllowed = (d) => d.kind === 'despesa' && d.repeat !== 'monthly';
  function tagChips(d) {
    const cur = F.tagKey(d.tag);
    return F.tagList(S.data.transactions).slice(0, 6).map((e) =>
      '<button type="button" class="opt" aria-pressed="' + (cur === e.key) + '" data-f="tag" data-v="' + esc(e.name) + '">' + esc(e.name) + '</button>').join('');
  }
  function tagField(d) {
    const all = F.tagList(S.data.transactions);
    return '<label class="field"><span>Etiqueta (opcional)</span><input id="f-tag" data-in="tag" list="tag-list" maxlength="40" placeholder="Ex.: Viagem, Reforma" value="' + esc(d.tag) + '"></label>' +
      '<datalist id="tag-list">' + all.map((e) => '<option value="' + esc(e.name) + '">').join('') + '</datalist>' +
      (all.length ? '<div class="opts row" id="tag-chips">' + tagChips(d) + '</div>' : '') +
      '<p class="hint tag-hint">Junta gastos de cartões e meses diferentes, como uma viagem ou uma reforma. Em compra parcelada, vale para todas as parcelas.</p>';
  }
  function paintTags(d) { const c = B.$('#tag-chips'); if (c) c.innerHTML = tagChips(d); }

  /** Dividir a conta com outra pessoa: só em saída que não é conta fixa (a conta fixa volta todo mês sem divisão). */
  const splitAllowed = (d) => d.kind === 'despesa' && d.repeat !== 'monthly';
  const splitOn = (d) => splitAllowed(d) && d.split === 'sim';
  /** Parte da outra pessoa em centavos pelo modo escolhido; null se ainda falta valor. */
  function splitCents(d) {
    const total = F.toCents(F.parseMoney(d.amountText));
    if (!(total > 0)) return null;
    if (d.splitMode === 'other') {
      const v = F.parseMoney(d.splitAmt);
      return v > 0 ? F.splitShareCents(total, 'other', F.toCents(v)) : null;
    }
    return F.splitShareCents(total, d.splitMode);
  }
  function splitHint(d) {
    if (!splitOn(d)) return '';
    const who = F.tagClean(d.splitWho);
    const name = who ? esc(who) : 'A outra pessoa';
    const total = F.toCents(F.parseMoney(d.amountText));
    if (!(total > 0)) return 'Digite o valor da conta para ver como fica a divisão.';
    if (d.splitMode === 'other') {
      const v = F.parseMoney(d.splitAmt);
      if (!(v > 0)) return 'Digite quanto ' + name + ' vai pagar.';
      if (F.toCents(v) > total) return name + ' não pode pagar mais do que o valor da conta.';
    }
    const other = splitCents(d);
    if (!(other > 0)) return 'Esse valor é pequeno demais para dividir.';
    return (d.repeat === 'installments' ? 'Na compra toda: você' : 'Você') + ' fica com <b>' + nb((total - other) / 100) + '</b>. ' +
      name + ' te deve <b>' + nb(other / 100) + '</b>.';
  }
  function whoChips(d) {
    const cur = F.tagKey(d.splitWho);
    const P = B.partner();
    let h = '';
    if (P.state === 'linked') h += '<button type="button" class="opt" aria-pressed="' + d.splitPartner + '" data-f="who-partner">' + icon('link', 'xs') + '<span>' + esc(P.name) + '</span></button>';
    const others = F.personList(S.data.transactions).filter((p) => !(P.state === 'linked' && p.key === F.tagKey(P.name))).slice(0, 5);
    h += others.map((p) => '<button type="button" class="opt" aria-pressed="' + (!d.splitPartner && cur === p.key) + '" data-f="who" data-v="' + esc(p.name) + '">' + esc(p.name) + '</button>').join('');
    return h;
  }
  /** Com a pessoa vinculada, o pedido vai para a conta dela e ela aceita ou recusa; com um nome solto, fica só o seu controle de "A receber". */
  function shareNote(d) {
    if (!d.splitPartner) return '';
    const P = B.partner();
    const x = d.id ? B.ownShare(d.id) : null;
    if (x && x.status === 'accepted') return '<p class="hint">' + esc(P.name) + ' já aceitou. Se você mudar o valor, a data, o cartão ou a descrição, ' + esc(P.name) + ' precisa aceitar de novo.</p>';
    if (x && x.status === 'pending') return '<p class="hint">Esperando ' + esc(P.name) + ' aceitar.</p>';
    return '<p class="hint">O pedido vai para a conta de ' + esc(P.name) + ': ela vê só a descrição, a parte dela, o cartão e o vencimento, e aceita ou recusa.</p>';
  }
  function splitField(d) {
    if (d.splitDone) { // a devolução já foi recebida: não deixa mudar a divisão sem desfazer antes
      const t = d.id ? B.findTx(d.id) : null;
      return '<p class="callout"><b>' + esc(d.splitWho) + '</b> já devolveu ' + nb((t ? F.othersCents(t) : 0) / 100) + ' desta conta. ' +
        '<button type="button" class="link-btn" data-f="unsettle">Marcar como não recebido</button></p>';
    }
    let h = '<div class="field"><span>Dividir esta conta?</span>' + seg('split', [['nao', 'Não'], ['sim', 'Sim']], d.split) + '</div>';
    if (d.split !== 'sim') return h;
    const chips = whoChips(d);
    h += '<div class="field"><span>Com quem?</span>' + (chips ? '<div class="opts row" id="who-chips">' + chips + '</div>' : '') + '</div>';
    if (!d.splitPartner) {
      h += '<label class="field"><span>Nome da pessoa</span><input id="f-who" data-in="who" list="who-list" maxlength="40" placeholder="Ex.: Maria" value="' + esc(d.splitWho) + '"></label>' +
        '<datalist id="who-list">' + F.personList(S.data.transactions).map((p) => '<option value="' + esc(p.name) + '">').join('') + '</datalist>';
    }
    h += '<div id="share-note">' + shareNote(d) + '</div>' +
      '<div class="field"><span>Como dividir?</span>' + seg('splitMode', [['half', 'Meio a meio'], ['other', 'Outro valor'], ['all', 'Paga tudo']], d.splitMode) + '</div>';
    if (d.splitMode === 'other') {
      h += '<label class="field"><span>Quanto a outra pessoa vai pagar?</span><span class="money"><i>R$</i>' +
        '<input id="f-split-amt" data-in="splitamt" inputmode="decimal" placeholder="0,00" value="' + esc(d.splitAmt) + '" aria-label="Parte da outra pessoa em reais"></span></label>';
    }
    return h + '<p class="hint" id="split-hint">' + splitHint(d) + '</p>';
  }
  function paintSplit(d) {
    const h = B.$('#split-hint'); if (h) h.innerHTML = splitHint(d);
    const c = B.$('#who-chips'); if (c) c.innerHTML = whoChips(d);
  }

  function installHint(d) {
    const total = F.parseMoney(d.amountText);
    const n = parseInt(d.n, 10);
    const k = parseInt(d.startNo, 10) || 1;
    if (!(total > 0) || !(n >= 2)) return 'Informe o valor total e o número de parcelas.';
    if (n > 60) return 'Use de 2 a 60 parcelas.';
    if (k < 1 || k > n) return 'A parcela atual vai de 1 a ' + n + '.';
    const parts = F.splitInstallments(F.toCents(total), n).slice(k - 1); // só as que faltam
    const cnt = parts.length, first = parts[0] / 100, last = parts[cnt - 1] / 100;
    const which = k === 1 ? 'A primeira' : 'A parcela ' + k;
    let where = d.date ? ' ' + which + ' vence em ' + F.dayLabel(d.date) + '.' : '';
    const card = billedOf(d);
    if (card && d.date) { // cartão com fatura: cada parcela cai numa fatura, uma por mês
      const ps = F.buildInstallments({ description: 'x', totalAmount: total, n, startNo: k, firstDate: d.date, card, txs: S.data.transactions, source: 'definir', today: B.today() });
      where = ' ' + which + ' cai na fatura de ' + F.monthName(ps[0].month).toLowerCase() + ' e a última na de ' + F.monthName(ps[cnt - 1].month).toLowerCase() + '.';
    }
    const lead = k === 1 ? '' : 'Você está na parcela ' + k + ' de ' + n + ': o Bolso lança as ' + cnt + ' que faltam (as de antes não entram). ';
    return lead + (first === last ? cnt + 'x de ' + F.fmtBRL(first) + '.' + where
      : cnt + ' parcelas: ' + F.fmtBRL(first) + ' e as últimas de ' + F.fmtBRL(last) + ' (diferença de centavos).' + where);
  }

  /** Descrição como "Netflix 3/10": o 3/10 é a parcela atual, não o nome. Oferece lançar como parcelada. */
  function instTextHint(d) {
    if (d.id || d.kind !== 'despesa' || d.repeat === 'installments' || !canInstall(d)) return '';
    const it = F.installmentFromText(d.description);
    if (!it) return '';
    return '<p class="hint">Parece a parcela <b>' + it.no + ' de ' + it.total + '</b>. <button type="button" class="link-btn" data-f="from-text">Lançar como parcelada, na parcela ' + it.no + ' de ' + it.total + '</button> (o valor que você digitou vale para cada parcela).</p>';
  }

  /** Nicho sugerido pela descrição: o que a pessoa usou antes em lançamento igual ou parecido. Escolha dela vale mais. */
  function suggestNiche(d) {
    if (d.kind !== 'despesa' || d.id || d.catTouched) return false;
    const valid = new Set(F.CATEGORIES.map((c) => c.key).concat(S.data.categories.map((c) => c.id)));
    const g = F.guessCategory(S.data.transactions, d.description, valid);
    const cat = g ? g.category : null, from = g ? g.from : '';
    if (cat === d.category && from === d.catFrom) return false;
    d.category = cat; d.catFrom = from;
    return true;
  }
  const catHint = (d) => (d.catFrom && !d.catTouched ? '<p class="hint">Nicho sugerido pelo seu lançamento <b>' + esc(d.catFrom) + '</b>. Toque em outro para trocar.</p>' : '');
  /** Atualiza só os botões de nicho e a dica, sem refazer a tela (refazer no meio do toque perde o clique). */
  function paintNiche(d) {
    document.querySelectorAll('#sheet [data-f="category"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === d.category)));
    const h = B.$('#cat-hint');
    if (h) h.innerHTML = catHint(d);
  }

  function autofill(d) {
    const key = d.description.trim().toLowerCase();
    if (!key || d.id) return false;
    const prev = S.data.transactions.slice().reverse().find((t) => t.kind === d.kind && t.description.trim().toLowerCase() === key);
    if (!prev) return false;
    let changed = false;
    if (!d.cardTouched && d.kind === 'despesa' && d.card_id !== prev.card_id) { d.card_id = prev.card_id; changed = true; }
    if (d.kind === 'receita' && !d.sourceTouched && d.source !== prev.source) { d.source = prev.source; changed = true; } // gasto: a renda vem da data
    if (!F.parseMoney(d.amountText) > 0 && prev.amount > 0 && d.repeat !== 'installments') { d.amountText = F.fmtNum(prev.amount); changed = true; }
    return changed;
  }

  function txMonth(d) {
    const c = billedOf(d);
    if (c) return billedPlace(d, c).month;
    return d.kind === 'receita' && d.nextMonth ? F.addMonths(F.monthOf(d.date), 1) : F.monthOf(d.date);
  }

  function openTxSheet(kind, base) {
    const d = newTxDraft(kind, base);
    if (d.category) d.catTouched = true; // veio pronto: a sugestão não troca
    const ctrl = {
      draft: d,
      render: () => txRender(d),
      field(name, v) {
        if (name === 'kind') { d.kind = v; if (v === 'receita') { d.category = null; d.catFrom = ''; if (d.repeat === 'installments') d.repeat = 'once'; } else suggestNiche(d); if (!d.sourceTouched) d.source = 'salario'; return redraw(); }
        if (name === 'category') { d.category = v; d.catTouched = true; d.catFrom = ''; return redraw(); }
        if (name === 'tag') { d.tag = F.tagKey(d.tag) === F.tagKey(v) ? '' : v; const el = B.$('#f-tag'); if (el) el.value = d.tag; return paintTags(d); }
        if (name === 'split') { d.split = v; if (v === 'sim' && !d.splitWho) { const P = B.partner(); if (P.state === 'linked') { d.splitPartner = true; d.splitWho = P.name; } } return redraw(); }
        if (name === 'splitMode') { d.splitMode = v; redraw(); if (v === 'other') { const el = B.$('#f-split-amt'); if (el) el.focus(); } return; }
        if (name === 'who-partner') { const P = B.partner(); d.splitPartner = !d.splitPartner; d.splitWho = d.splitPartner ? P.name : ''; return redraw(); }
        if (name === 'who') { const was = d.splitPartner; d.splitPartner = false; d.splitWho = !was && F.tagKey(d.splitWho) === F.tagKey(v) ? '' : v; if (was) return redraw(); const el = B.$('#f-who'); if (el) el.value = d.splitWho; return paintSplit(d); }
        if (name === 'unsettle') return ctrl.unsettle();
        if (name === 'card_id') { d.card_id = v || null; d.cardTouched = true; return redraw(); }
        if (name === 'source') { d.source = v; d.sourceTouched = true; return redraw(); }
        if (name === 'repeat') { d.repeat = v; return redraw(); }
        if (name === 'parcelado') { d.repeat = v === 'sim' ? 'installments' : 'once'; return redraw(); }
        if (name === 'from-text') { // "Netflix 3/10": parcela 3 de 10; o valor digitado é o de cada parcela
          const it = F.installmentFromText(d.description);
          if (!it) return;
          const each = F.parseMoney(d.amountText);
          d.repeat = 'installments'; d.n = String(it.total); d.startNo = String(it.no);
          if (it.name) d.description = it.name;
          if (each > 0) d.amountText = F.fmtNum(Math.round(each * it.total * 100) / 100);
          if (it.name) suggestNiche(d);
          return redraw();
        }
        if (name === 'new-card') return openCardSheet(null, d);
        if (name === 'cfg-card') return openCardSheet(d.card_id, d);
        if (name === 'new-cat') return openCategorySheet(d);
      },
      input(name, el) {
        if (name === 'amount') { d.amountText = el.value; paintSplit(d); }
        if (name === 'who') { d.splitWho = el.value; paintSplit(d); }
        if (name === 'splitamt') { d.splitAmt = el.value; paintSplit(d); }
        if (name === 'tag') { d.tag = el.value; paintTags(d); }
        if (name === 'desc') { d.description = el.value; if (suggestNiche(d)) paintNiche(d); const it = B.$('#inst-text'); if (it) it.innerHTML = instTextHint(d); }
        if (name === 'date') {
          d.date = el.value;
          const cb = B.$('[data-in="paid"]');
          if (cb && !d.paidTouched && !d.id) cb.checked = paidDefault(d);
          const rh = B.$('#rep-hint');
          const cn = B.$('#card-note');
          if (cn) cn.innerHTML = cardNote(d);
          const ln = B.$('#late-note');
          if (ln) ln.innerHTML = lateNote(d);
          syncSource(d);
          const sf = B.$('#src-field');
          if (sf) sf.innerHTML = srcField(d);
          if (rh && d.date) rh.textContent = 'Entra sozinha todo mês, no dia ' + F.dayOf(d.date) + ', como pendente. Para parar, pause em Mais, Contas fixas.';
        }
        if (name === 'n') d.n = el.value;
        if (name === 'start') d.startNo = el.value;
        if (name === 'amount' || name === 'n' || name === 'start' || name === 'date') { const h = B.$('#inst-hint'); if (h) h.textContent = installHint(d); }
      },
      change(name, el) {
        if (name === 'paid') { d.paid = el.checked; d.paidTouched = true; }
        if (name === 'next') d.nextMonth = el.checked;
        if (name === 'amount') { const v = F.parseMoney(el.value); if (v > 0) { d.amountText = F.fmtNum(v); el.value = d.amountText; paintSplit(d); } }
        if (name === 'splitamt') { const v = F.parseMoney(el.value); if (v > 0) { d.splitAmt = F.fmtNum(v); el.value = d.splitAmt; paintSplit(d); } }
        if (name === 'desc') { const sug = suggestNiche(d); if (autofill(d)) redraw(); else if (sug) paintNiche(d); }
      },
      async submit() {
        fixRepeat(d);
        syncSource(d);
        const amount = F.parseMoney(d.amountText);
        if (!(amount > 0)) return showErr('Digite um valor maior que zero.', '#f-amount');
        if (!d.date) return showErr('Escolha a data.', '#f-date');
        if (d.kind === 'despesa' && !d.category) return showErr('Escolha o nicho do gasto.');
        let n = 1;
        if (d.repeat === 'installments') {
          n = parseInt(d.n, 10);
          if (!(n >= 2 && n <= 60)) return showErr('Use de 2 a 60 parcelas.', '#f-n');
          const k = parseInt(d.startNo, 10) || 1;
          if (!(k >= 1 && k <= n)) return showErr('A parcela atual vai de 1 a ' + n + '.', '#f-start');
        }
        let who = '', splitCt = 0;
        if (splitOn(d) && !d.splitDone) {
          if (d.splitPartner && B.partner().state !== 'linked') return showErr('O vínculo com a outra pessoa foi desfeito. Escolha um nome ou vincule de novo em Mais.');
          who = d.splitPartner ? B.partner().name : F.personResolve(S.data.transactions, d.splitWho);
          if (!who) return showErr('Escreva com quem você divide.', '#f-who');
          if (d.splitMode === 'other') {
            const v = F.parseMoney(d.splitAmt);
            if (!(v > 0)) return showErr('Digite quanto ' + who + ' vai pagar.', '#f-split-amt');
            if (F.toCents(v) > F.toCents(amount)) return showErr(who + ' não pode pagar mais do que o valor da conta.', '#f-split-amt');
          }
          splitCt = splitCents(d) || 0;
          if (!(splitCt > 0)) return showErr('Esse valor é pequeno demais para dividir.');
        }
        const description = d.description.trim() || (d.kind === 'despesa' ? B.catName(d.category) : B.srcName(d.source));
        const tag = tagAllowed(d) ? F.tagResolve(S.data.transactions, d.tag) : '';
        const btn = B.$('#f-save');
        btn.disabled = true;
        const card = billedOf(d);
        const place = card ? billedPlace(d, card) : null;
        const month = place ? place.month : txMonth(d);
        const ok = await B.guard(async () => {
          const base = {
            kind: d.kind, description, amount, date: d.date, month,
            category: d.kind === 'despesa' ? d.category : null, card_id: d.kind === 'despesa' ? d.card_id : null,
            source: place ? place.source : d.source, paid: place ? place.paid : isPaid(d), skipped: d.skipped,
          };
          if (d.id) {
            // a coluna da etiqueta só vai para o banco quando a etiqueta mudou
            const before = F.tagClean((B.findTx(d.id) || {}).tag);
            const changed = d.kind === 'despesa' && tag !== before;
            let shareOpt;
            let patch = changed ? Object.assign({}, base, { tag: tag || null }) : base;
            // as colunas da divisão só vão para o banco quando a divisão mudou (conta com devolução já recebida fica como está)
            if (d.kind === 'despesa' && !d.splitDone) {
              const prev = B.findTx(d.id) || {};
              const had = F.hasSplit(prev), wants = splitCt > 0;
              const sh = B.ownShare(d.id);
              const hadShare = !!sh && (sh.status === 'pending' || sh.status === 'accepted');
              const wantsShare = wants && d.splitPartner;
              const same = had === wants && hadShare === wantsShare && (!had || (F.tagKey(prev.split_with) === F.tagKey(who) && F.toCents(prev.split_share) === splitCt));
              if (!same) patch = Object.assign({}, patch, wants ? { split_with: who, split_share: splitCt / 100, split_paid: false } : { split_with: null, split_share: null, split_paid: null });
              shareOpt = wantsShare ? true : hadShare ? false : undefined;
            }
            await B.updTx(d.id, patch, shareOpt === undefined ? undefined : { sharePartner: shareOpt });
            // etiqueta é da compra inteira: vale para todas as parcelas
            if (changed && d.group_id) {
              const others = S.data.transactions.filter((x) => x.group_id === d.group_id && x.id !== d.id).map((x) => x.id);
              if (others.length) await B.updTxs(others, { tag: tag || null });
            }
          } else if (d.repeat === 'installments') {
            const parcelas = F.buildInstallments({ description, totalAmount: amount, n, startNo: parseInt(d.startNo, 10) || 1, firstDate: d.date, category: d.category, card_id: d.card_id, card, txs: S.data.transactions, source: d.source, today: B.today(), tag, splitWith: who, splitTotal: splitCt / 100 });
            if (splitCt && d.splitPartner) for (const r of parcelas) r.share_partner = true;
            await B.addTxs(parcelas);
          } else if (d.repeat === 'monthly') {
            const rec = {
              id: F.uid(), kind: d.kind, description, amount, day: F.dayOf(d.date), category: base.category, card_id: base.card_id,
              source: (place ? place.source : d.source) === 'definir' ? 'outra' : (place ? place.source : d.source), month_offset: d.kind === 'receita' && d.nextMonth ? 1 : 0, start_month: month, active: true,
            };
            await B.addRecurring(rec, Object.assign({ id: F.uid(), group_id: null, installment_no: null, installments_total: null }, base));
          } else {
            await B.addTxs([Object.assign({ id: F.uid(), recurring_id: null, group_id: null, installment_no: null, installments_total: null, tag: tag || null, split_with: splitCt ? who : null, split_share: splitCt ? splitCt / 100 : null, split_paid: splitCt ? false : null, share_partner: !!(splitCt && d.splitPartner) }, base)]);
          }
          return true;
        });
        if (btn) btn.disabled = false;
        if (!ok) return;
        B.sheet.close();
        const moved = month !== S.month;
        if (moved) await B.setMonth(month); else B.render();
        B.toast(d.id ? 'Alterações salvas.' : card ? 'Salvo na fatura de ' + F.monthName(month).toLowerCase() + '.' : moved ? 'Salvo em ' + F.monthLabel(month) + '.' : 'Lançamento salvo.');
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
      async unsettle() {
        const t = d.id ? B.findTx(d.id) : null;
        if (!t) return;
        const ok = await B.ask({
          title: 'Marcar como não recebido?', text: d.splitWho + ' volta a aparecer em "A receber". A entrada "' + d.splitWho + ' devolveu" que o Bolso criou continua no Extrato; exclua se não recebeu mesmo.',
          actions: [{ label: 'Marcar como não recebido', value: true }],
        });
        if (!ok) return;
        const done = await B.guard(async () => { await B.unsettleSplit([d.id]); return true; });
        if (!done) return;
        d.splitDone = false;
        redraw();
        B.render();
        B.toast('Voltou para "A receber".');
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
    if (t.share_id) return openSharedSheet(t);
    const base = {
      id: t.id, kind: t.kind, amountText: F.fmtNum(t.amount), description: t.description, date: t.date, category: t.category,
      card_id: t.card_id, source: t.source, paid: t.paid, paidTouched: true, nextMonth: t.kind === 'receita' && t.month !== F.monthOf(t.date),
      recurring_id: t.recurring_id, group_id: t.group_id, installment_no: t.installment_no, installments_total: t.installments_total, skipped: t.skipped, cardTouched: true, sourceTouched: true, tag: t.tag || '',
    };
    if (F.hasSplit(t)) { // refaz a escolha de divisão a partir do que está salvo
      const tc = F.toCents(t.amount), sc = F.toCents(t.split_share);
      Object.assign(base, {
        split: 'sim', splitWho: F.tagClean(t.split_with), splitDone: !!t.split_paid, splitAmt: F.fmtNum(t.split_share),
        splitMode: sc >= tc ? 'all' : sc === Math.floor(tc / 2) ? 'half' : 'other',
        splitPartner: (() => { const x = B.ownShare(t.id); return !!x && (x.status === 'pending' || x.status === 'accepted'); })(),
      });
    }
    openTxSheet(t.kind, base);
  };

  /* ---------- Conta que outra pessoa dividiu com você ---------- */

  const allCats = () => F.CATEGORIES.concat(S.data.categories.map((c) => ({ key: c.id, emoji: c.emoji, name: c.name })));
  function nichePicker(selected) {
    return '<div class="field"><span>Nicho</span><div class="opts" data-keep-scroll>' + allCats().map((c) =>
      '<button type="button" class="opt" aria-pressed="' + (selected === c.key) + '" data-f="category" data-v="' + esc(c.key) + '"><span class="e">' + esc(c.emoji) + '</span>' + esc(c.name) + '</button>').join('') + '</div></div>';
  }
  function sourcePicker(d, dateStr) {
    let h = '<div class="field"><span>Sai de</span>' + seg('source', [['salario', 'Salário'], ['vale', 'Vale'], ['outra', 'Outra fonte']], d.source) + '</div>';
    if (d.source === 'definir') {
      h += '<p class="hint">Nenhuma renda cadastrada, então fica <b>A definir</b>. Escolha uma aqui ou cadastre em Mais, Contas fixas.</p>';
    } else if (!d.sourceTouched && dateStr) {
      h += '<p class="hint">Pela data (' + dm(dateStr) + '), sai do <b>' + esc(B.srcName(d.source)) + '</b>. Toque em outra para trocar.</p>';
    }
    return h;
  }
  const defaultSource = (dateStr) => { const inc = F.incomeForDate(S.data.recurring, dateStr); return inc ? inc.key : 'definir'; };

  /** Aceitar um pedido de divisão: escolher o nicho e de qual renda sai. Aceita todas as parcelas da compra de uma vez. */
  B.openAcceptSheet = (key) => {
    const g = B.requestsForMe().find((r) => r.key === key);
    if (!g) return;
    const f = g.first, P = B.partner();
    const d = { category: f.suggested_category || 'outros', source: defaultSource(f.date), sourceTouched: false };
    const ctrl = {
      draft: d,
      render() {
        const card = f.card_name === F.CASH_NAME ? '' : ' no cartão <b>' + esc(f.card_name) + '</b>';
        const when = g.count > 1 ? plural2(g.count, 'parcela', 'parcelas') + ' de ' + nb(f.amount) + ', a primeira vence em ' + dm(f.date) : 'vence em ' + dm(f.date);
        return '<form id="acc-form" novalidate>' + head('Aceitar divisão') +
          '<p class="muted-text share-sum"><b>' + esc(f.description) + '</b>: ' + esc(P.name) + ' colocou <b>' + nb(g.total) + '</b> para você pagar' + card + ', ' + when + '.</p>' +
          nichePicker(d.category) + sourcePicker(d, f.date) +
          '<p class="form-err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary" id="f-save">Aceitar</button></div></form>';
      },
      field(name, v) {
        if (name === 'category') { d.category = v; return redraw(); }
        if (name === 'source') { d.source = v; d.sourceTouched = true; return redraw(); }
      },
      async submit() {
        const btn = B.$('#f-save'); btn.disabled = true;
        const ok = await B.guard(async () => { await B.acceptShares(g.ids, { category: d.category, source: d.source }); return true; });
        if (btn) btn.disabled = false;
        if (!ok) return;
        B.sheet.close(); B.render(); B.toast('Aceito. A conta entrou no seu mês.');
      },
    };
    open(ctrl);
  };
  const plural2 = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  /** Conta que você aceitou: o valor e o vencimento são de quem lançou; você muda o nicho, de onde sai e se já pagou. */
  function openSharedSheet(t) {
    const x = B.shareById(t.share_id);
    if (!x) return;
    const P = B.partner();
    const d = { category: t.category, source: t.source, sourceTouched: true, paid: t.paid };
    const ctrl = {
      draft: d,
      render() {
        const parc = x.installments_total ? ', parcela ' + x.installment_no + ' de ' + x.installments_total : '';
        let h = '<form id="shr-form" novalidate>' + head('Conta dividida') +
          '<p class="callout"><b>' + esc(P.name) + '</b> lançou esta conta e dividiu com você. Para mudar o valor, a data ou o cartão, peça para ' + esc(P.name) + '.</p>' +
          '<p class="muted-text share-sum"><b>' + esc(t.description) + '</b>' + parc + '<br>Sua parte: <b>' + nb(t.amount) + '</b><br>' + esc(B.cardName(t.card_id)) + ', vence em ' + dm(t.date) + '.</p>' +
          nichePicker(d.category) + sourcePicker(d, null);
        if (x.owner_received) h += '<p class="callout">' + esc(P.name) + ' confirmou que recebeu. Está paga.</p>';
        else h += '<label class="check-row"><input type="checkbox" data-in="paid"' + (d.paid ? ' checked' : '') + '><span>Já paguei para ' + esc(P.name) + '</span></label>';
        return h + '<p class="form-err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary" id="f-save">Salvar</button></div></form>';
      },
      field(name, v) {
        if (name === 'category') { d.category = v; return redraw(); }
        if (name === 'source') { d.source = v; return redraw(); }
      },
      change(name, el) { if (name === 'paid') d.paid = el.checked; },
      async submit() {
        const btn = B.$('#f-save'); btn.disabled = true;
        const ok = await B.guard(async () => { await B.updTx(t.id, { category: d.category, source: d.source, paid: d.paid }); return true; });
        if (btn) btn.disabled = false;
        if (!ok) return;
        B.sheet.close(); B.render(); B.toast('Alterações salvas.');
      },
    };
    open(ctrl);
  }

  /* ---------- Cartão ---------- */

  const CARD_COLORS = ['#2a78d6', '#6250d6', '#e87ba4', '#e34948', '#eb6834', '#eda100', '#1baf7a', '#008300', '#52514e', '#0b0b0b'];

  /** Rendas que podem pagar a fatura: só as já cadastradas como entrada fixa. A atual do cartão sempre aparece. */
  function payChoice(d, current) {
    const opts = F.incomeOptions(S.data.recurring);
    if (current && !opts.some((o) => o.key === current)) opts.push({ key: current, name: B.srcName(current), day: null });
    const due = F.dayInt(d.due);
    const sug = due ? F.suggestPaySource(S.data.recurring, due) : null;
    let value = null;
    if (opts.length === 1) value = opts[0].key;
    else if (opts.length > 1) value = d.payTouched && opts.some((o) => o.key === d.pay) ? d.pay : (sug && opts.some((o) => o.key === sug.key) ? sug.key : opts[0].key);
    return { opts, sug, value, due };
  }

  function payBlock(d, current) {
    const { opts, sug, value, due } = payChoice(d, current);
    let h = '<span>Paga com qual renda?</span>';
    if (!opts.length) {
      h += '<p class="callout">A definir. Cadastre o seu salário e o seu vale em Mais, Contas fixas (como entrada) e volte aqui para escolher. Até lá, as compras deste cartão ficam como "A definir".</p>';
    } else if (opts.length === 1) {
      h += '<p class="muted-text">' + esc(opts[0].name) + ', a sua única renda cadastrada.</p>';
    } else {
      h += seg('pay', opts.map((o) => [o.key, o.name]), value);
      if (sug) {
        const name = esc(B.srcName(sug.key));
        h += '<p class="hint">Sugestão: ' + name + ', que cai no dia ' + sug.day + (sug.day <= due ? ', até o vencimento (dia ' + due + ').' : ' do mês anterior ao vencimento (dia ' + due + ').') + '</p>';
      } else {
        h += '<p class="hint">Digite o dia do vencimento para ver a sugestão.</p>';
      }
    }
    return h;
  }

  function openCardSheet(id, returnToTx) {
    const ex = id ? S.data.cards.find((c) => c.id === id) : null;
    const d = {
      name: ex ? ex.name : '', kind: ex ? ex.kind : 'credito', color: ex ? ex.color : CARD_COLORS[S.data.cards.length % CARD_COLORS.length],
      close: ex && ex.closing_day ? String(ex.closing_day) : '', due: ex && ex.due_day ? String(ex.due_day) : '',
      pay: ex ? ex.pay_source || null : null, payTouched: !!(ex && ex.pay_source),
    };
    const exPay = ex ? ex.pay_source || null : null;
    const back = () => { if (returnToTx) { cur = null; openTxFromDraft(returnToTx); } else B.sheet.close(); };
    const ctrl = {
      draft: d,
      render: () => '<form id="card-form" novalidate autocomplete="off">' + head(ex ? 'Editar cartão' : 'Novo cartão') +
        '<label class="field"><span>Nome</span><input id="f-name" data-in="name" maxlength="30" placeholder="Ex.: Nubank, Itaú, Débito Caixa" value="' + esc(d.name) + '"></label>' +
        '<div class="field"><span>Tipo</span>' + seg('kind', [['credito', 'Crédito'], ['debito', 'Débito']], d.kind) + '</div>' +
        (d.kind === 'credito'
          ? '<div class="two"><label class="field"><span>Fecha no dia</span><input id="f-close" data-in="close" type="number" inputmode="numeric" min="1" max="31" placeholder="Ex.: 11" value="' + esc(d.close) + '"></label>' +
            '<label class="field"><span>Vence no dia</span><input id="f-due" data-in="due" type="number" inputmode="numeric" min="1" max="31" placeholder="Ex.: 15" value="' + esc(d.due) + '"></label></div>' +
            '<p class="hint">Compra antes do dia do fechamento entra na fatura que fecha neste mês. No dia do fechamento ou depois, entra na do mês seguinte. Em mês curto vale o último dia.</p>' +
            '<div class="field" id="pay-block">' + payBlock(d, exPay) + '</div>'
          : '') +
        '<div class="field"><span>Cor</span><div class="swatches">' + CARD_COLORS.map((c) => '<button type="button" class="sw" aria-label="Cor ' + c + '" aria-pressed="' + (d.color === c) + '" data-f="color" data-v="' + c + '" style="--c:' + c + '"></button>').join('') + '</div></div>' +
        '<p class="form-err" id="f-err" role="alert"></p><div class="sheet-actions"><button type="submit" class="btn primary" id="f-save">Salvar</button>' +
        (ex ? '<button type="button" class="btn danger-text" data-del>Excluir cartão</button>' : '') + '</div></form>',
      field(name, v) {
        if (name === 'pay') { d.pay = v; d.payTouched = true; } else d[name] = v;
        redraw();
      },
      input(name, el) {
        if (name === 'name') d.name = el.value;
        if (name === 'close') d.close = el.value;
        if (name === 'due') { d.due = el.value; const pb = B.$('#pay-block'); if (pb) pb.innerHTML = payBlock(d, exPay); }
      },
      async submit() {
        const name = d.name.trim();
        if (!name) return showErr('Dê um nome ao cartão.', '#f-name');
        const patch = { name, kind: d.kind, color: d.color };
        if (d.kind === 'credito') {
          const c = F.dayInt(d.close), v = F.dayInt(d.due);
          const mustHave = !ex || F.isBilled(ex) || d.close !== '' || d.due !== '';
          if (mustHave && !c) return showErr('Digite o dia do fechamento, de 1 a 31.', '#f-close');
          if (mustHave && !v) return showErr('Digite o dia do vencimento, de 1 a 31.', '#f-due');
          if (c && v) Object.assign(patch, { closing_day: c, due_day: v, pay_source: payChoice(d, exPay).value });
        } else if (ex && (ex.closing_day || ex.due_day || ex.pay_source)) {
          Object.assign(patch, { closing_day: null, due_day: null, pay_source: null });
        }
        const next = Object.assign({}, ex || {}, patch, { id: ex ? ex.id : 'novo' });
        const billChanged = F.isBilled(next) && (!ex || ex.closing_day !== next.closing_day || ex.due_day !== next.due_day || (ex.pay_source || null) !== (next.pay_source || null));
        if (ex && billChanged) {
          const plan = B.rebillPlan(next);
          if (plan.count) {
            const ok = await B.ask({
              title: 'Refazer as faturas em aberto?',
              text: plan.count + (plan.count === 1 ? ' compra ainda não paga' : ' compras ainda não pagas') + ' deste cartão ' + (plan.count === 1 ? 'vai' : 'vão') + ' para a fatura certa e sair da renda escolhida. O que já foi pago não muda.',
              actions: [{ label: 'Salvar e refazer', value: true, kind: 'primary' }],
            });
            if (!ok) return;
          }
        }
        const row = await B.guard(async () => {
          if (ex) {
            await B.updCard(ex.id, patch);
            if (billChanged) await B.applyRebill(B.card(ex.id));
            return ex;
          }
          return B.addCard(Object.assign({ id: F.uid() }, patch));
        });
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

  /* ---------- Fatura do cartão ---------- */

  function openInvoiceSheet(cardId, month) {
    const ctrl = {
      draft: { cardId, month },
      render() {
        const card = B.card(cardId), inv = B.invoiceOf(cardId, month);
        if (!card || !inv) return '<div>' + head('Fatura') + '<p class="muted-text">Esta fatura não tem mais compras.</p></div>';
        const opts = F.incomeOptions(S.data.recurring);
        if (inv.source && inv.source !== 'definir' && !opts.some((o) => o.key === inv.source)) opts.push({ key: inv.source, name: B.srcName(inv.source) });
        let h = '<div>' + head('Fatura ' + esc(card.name));
        h += '<p class="inv-total"><b class="num">' + F.fmtBRL(inv.total) + '</b><span>' + inv.count + (inv.count === 1 ? ' compra' : ' compras') + '</span></p>';
        h += '<p class="muted-text inv-dates">Fecha em ' + dm(inv.closeDate) + '. Vence em ' + dm(inv.dueDate) + '/' + inv.dueDate.slice(0, 4) + '.</p>';
        h += '<div class="field"><span>Paga com qual renda?</span>';
        if (!opts.length) h += '<p class="callout">A definir. Cadastre o seu salário e o seu vale em Mais, Contas fixas (como entrada) para escolher aqui.</p>';
        else {
          h += seg('inv-src', opts.map((o) => [o.key, o.name]), inv.source);
          if (!inv.source) h += '<p class="hint">As compras desta fatura estão com rendas diferentes. Escolha uma para igualar.</p>';
          else if (inv.source === 'definir') h += '<p class="hint">Ainda está a definir. Escolha a renda que paga esta fatura.</p>';
        }
        h += '</div>';
        h += '<div class="sheet-actions"><button type="button" class="btn ' + (inv.paid ? '' : 'primary') + '" data-f="inv-paid">' + (inv.paid ? 'Voltar para pendente' : 'Marcar fatura como paga') + '</button></div>';
        h += '<h3 class="h-sub inv-h">Compras desta fatura</h3><div class="inv-list">' +
          inv.items.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).map((t) => B.V.invoiceItem(t)).join('') + '</div></div>';
        return h;
      },
      async field(name, v) {
        const ok = await B.guard(async () => {
          if (name === 'inv-src') await B.setInvoiceSource(cardId, month, v);
          if (name === 'inv-paid') { const inv = B.invoiceOf(cardId, month); await B.setInvoicePaid(cardId, month, !inv.paid); }
          return true;
        });
        if (!ok) return;
        redraw(); B.render();
      },
    };
    open(ctrl);
  }
  B.openInvoiceSheet = openInvoiceSheet;

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
            S.data.cards.map((c) => '<button type="button" class="opt" aria-pressed="' + (d.card_id === c.id) + '" data-f="card_id" data-v="' + c.id + '"><i class="dot" style="--c:' + esc(F.safeColor(c.color)) + '"></i>' + esc(c.name) + '</button>').join('') + '</div></div>';
        }
        const billedRec = !isIn && F.isBilled(B.card(d.card_id));
        if (billedRec) h += '<p class="hint">Entra na fatura do cartão, no dia ' + esc(d.day) + ' de cada mês. A renda que paga é a da fatura.</p>';
        else h += '<div class="field"><span>' + (isIn ? 'Entrada do' : 'Pago com o') + '</span>' + seg('source', [['salario', 'Salário'], ['vale', 'Vale'], ['outra', 'Outra fonte']], d.source) + '</div>';
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
        const rcard = d.kind === 'despesa' && F.isBilled(B.card(d.card_id)) ? B.card(d.card_id) : null;
        const fields = {
          kind: d.kind, description: d.description.trim(), amount, day, category: d.kind === 'despesa' ? d.category : null,
          card_id: d.kind === 'despesa' ? d.card_id : null, source: rcard ? (rcard.pay_source || 'outra') : d.source, month_offset: d.kind === 'receita' && d.nextMonth ? 1 : 0,
        };
        // no cartão com fatura, start_month é o mês da fatura em que cai a cobrança deste mês
        const startMonth = rcard ? F.invoiceOf(rcard, F.dateIn(B.curMonth(), day)).month : B.curMonth();
        const btn = B.$('#f-save');
        btn.disabled = true;
        const ok = await B.guard(async () => {
          if (ex) await B.updRecurring(ex.id, Object.assign(fields, { active: d.active }));
          else await B.addRecurring(Object.assign({ id: F.uid(), start_month: startMonth, active: true }, fields), null);
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
  A['open-invoice'] = (el) => openInvoiceSheet(el.dataset.card, el.dataset.month);
  A['new-rec'] = () => openRecurringSheet(null);
  A['edit-rec'] = (el) => openRecurringSheet(el.dataset.id);
})(window);
