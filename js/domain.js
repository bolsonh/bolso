/* Bolso: domain.js
   Regras puras (sem tela): dinheiro, datas, contas fixas, parcelas, somas e frases de análise.
   Roda no navegador e no Node, por isso os testes usam este mesmo arquivo. */
(function (root) {
  'use strict';

  /* ---------- Listas fixas ---------- */

  const CATEGORIES = [
    { key: 'mercado', emoji: '🛒', name: 'Mercado' },
    { key: 'restaurantes', emoji: '🍽️', name: 'Restaurantes e delivery' },
    { key: 'transporte', emoji: '🚌', name: 'Transporte e apps' },
    { key: 'combustivel', emoji: '⛽', name: 'Combustível' },
    { key: 'moradia', emoji: '🏠', name: 'Aluguel e condomínio' },
    { key: 'contas', emoji: '💡', name: 'Luz, água e gás' },
    { key: 'internet', emoji: '📶', name: 'Internet e celular' },
    { key: 'saude', emoji: '🩺', name: 'Saúde' },
    { key: 'farmacia', emoji: '💊', name: 'Farmácia' },
    { key: 'higiene', emoji: '🧴', name: 'Higiene e beleza' },
    { key: 'educacao', emoji: '📚', name: 'Educação' },
    { key: 'lazer', emoji: '🎉', name: 'Lazer' },
    { key: 'assinaturas', emoji: '📺', name: 'Assinaturas' },
    { key: 'roupas', emoji: '👕', name: 'Roupas e calçados' },
    { key: 'casa', emoji: '🛋️', name: 'Casa e utilidades' },
    { key: 'pet', emoji: '🐾', name: 'Pet' },
    { key: 'presentes', emoji: '🎁', name: 'Presentes e doações' },
    { key: 'viagem', emoji: '✈️', name: 'Viagem' },
    { key: 'dividas', emoji: '💳', name: 'Dívidas, juros e taxas' },
    { key: 'impostos', emoji: '🧾', name: 'Impostos' },
    { key: 'outros', emoji: '📦', name: 'Outros' },
  ];

  const SOURCES = [
    { key: 'salario', name: 'Salário' },
    { key: 'vale', name: 'Vale' },
    { key: 'outra', name: 'Outra fonte' },
    { key: 'definir', name: 'A definir' }, // fatura de cartão cuja renda ainda não foi escolhida
  ];

  const CASH_NAME = 'Dinheiro ou Pix';

  /* ---------- Dinheiro (sempre somado em centavos inteiros) ---------- */

  const toCents = (n) => Math.round(Number(n) * 100);

  /** Aceita "1.234,56", "1234,56", "1234.56", "R$ 12", 12.5. Devolve número com 2 casas, ou NaN. */
  function parseMoney(input) {
    if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) / 100 : NaN;
    let s = String(input == null ? '' : input).replace(/[R$\s ]/g, '');
    if (!s || /[^0-9.,]/.test(s)) return NaN;
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes('.')) {
      const parts = s.split('.');
      const last = parts[parts.length - 1];
      const milhar = parts.length > 2 || (last.length === 3 && parts[0] !== '0' && parts[0] !== '');
      if (milhar) s = parts.join('');
    }
    if ((s.match(/\./g) || []).length > 1) return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }

  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const num = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

  const fmtBRL = (v) => brl.format(Number(v) || 0).replace(/ /g, ' ');
  const fmtNum = (v) => num.format(Number(v) || 0);
  const fmtCompact = (v) => compact.format(Number(v) || 0);

  /** Divide um total em N parcelas sem perder centavo; a sobra vai para as primeiras. */
  function splitInstallments(totalCents, n) {
    const base = Math.floor(totalCents / n);
    const rem = totalCents - base * n;
    return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
  }

  /* ---------- Datas (texto AAAA-MM-DD e AAAA-MM; sem fuso) ---------- */

  const pad = (n) => String(n).padStart(2, '0');
  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  const todayStr = (d) => {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };
  const monthOf = (dateStr) => dateStr.slice(0, 7);
  const dayOf = (dateStr) => Number(dateStr.slice(8, 10));

  function addMonths(ym, n) {
    const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
    const t = y * 12 + (m - 1) + n;
    return Math.floor(t / 12) + '-' + pad((t % 12) + 1);
  }
  function monthDiff(a, b) { // b - a em meses
    return (Number(b.slice(0, 4)) * 12 + Number(b.slice(5, 7))) - (Number(a.slice(0, 4)) * 12 + Number(a.slice(5, 7)));
  }
  function daysInMonth(ym) {
    return new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  }
  function dateIn(ym, day) { return ym + '-' + pad(Math.min(day, daysInMonth(ym))); }

  /** n meses terminando em endYm, do mais antigo ao mais novo. */
  function rangeMonths(endYm, n) {
    return Array.from({ length: n }, (_, i) => addMonths(endYm, i - (n - 1)));
  }

  const monthLabel = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4);
  const monthName = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1];
  const monthShort = (ym) => MONTHS_SHORT[Number(ym.slice(5, 7)) - 1];

  function dayLabel(dateStr) {
    const d = new Date(Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)) - 1, Number(dateStr.slice(8, 10)));
    return WEEKDAYS[d.getDay()] + ', ' + pad(d.getDate()) + ' ' + MONTHS_SHORT[d.getMonth()];
  }

  /* ---------- Identificadores ---------- */

  function uid() {
    const c = root.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    const b = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  /* ---------- Nichos e cartões (consulta) ---------- */

  function categoryInfo(key, custom) {
    const d = CATEGORIES.find((c) => c.key === key);
    if (d) return d;
    const c = (custom || []).find((x) => x.id === key);
    if (c) return { key: c.id, emoji: c.emoji, name: c.name, custom: true };
    return CATEGORIES[CATEGORIES.length - 1];
  }

  /* ---------- Nicho sugerido pela descrição ---------- */

  const keyCache = new Map();
  /**
   * Texto para comparar descrições: sem maiúscula, acento, pontuação, "3/10" de parcela
   * e números soltos (comprovante, pedido). "99" sozinho no começo é nome de app e fica.
   */
  function descKey(s) {
    const raw = String(s || '');
    if (keyCache.has(raw)) return keyCache.get(raw);
    const words = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
    const key = words.filter((w, i) => !/^\d+$/.test(w) || (i === 0 && w.length <= 2)).join(' ');
    if (keyCache.size > 3000) keyCache.clear();
    keyCache.set(raw, key);
    return key;
  }

  /** Uma descrição começa com a outra, palavra por palavra ("uber" e "uber trip"). */
  const startsWithWords = (long, short) => long === short || long.startsWith(short + ' ');

  /**
   * Nicho que a pessoa usou antes para uma descrição igual ou parecida.
   * Igual (ignorando maiúscula, acento e números): vale o mais recente.
   * Parecida (uma começa com a outra): só sugere se todos os parecidos usam o mesmo nicho.
   * Devolve { category, from } com a descrição de onde veio, ou null.
   */
  function guessCategory(txs, description, validKeys) {
    const key = descKey(description);
    if (key.length < 2) return null;
    const rows = [];
    for (const t of txs) {
      if (t.kind !== 'despesa' || t.skipped || !t.category) continue;
      if (validKeys && !validKeys.has(t.category)) continue;
      const k = descKey(t.description);
      if (k) rows.push({ t, k });
    }
    const latest = (list) => list.reduce((a, b) => (b.t.date >= a.t.date ? b : a));
    const same = rows.filter((r) => r.k === key);
    if (same.length) { const r = latest(same); return { category: r.t.category, from: r.t.description }; }
    if (key.length < 3 && !/^\d+$/.test(key)) return null; // curto demais para dizer que é parecido
    let kin = [], best = 0;
    for (const r of rows) {
      const [s, l] = r.k.length <= key.length ? [r.k, key] : [key, r.k]; // s é a mais curta
      if (!startsWithWords(l, s) || !(s.length >= 3 || /^\d+$/.test(s))) continue;
      if (s.length > best) { best = s.length; kin = []; } // o parecido mais específico vence ("uber eats" antes de "uber")
      if (s.length === best) kin.push(r);
    }
    if (!kin.length || new Set(kin.map((r) => r.t.category)).size !== 1) return null;
    const r = latest(kin);
    return { category: r.t.category, from: r.t.description };
  }

  /* ---------- Cartão de crédito: fechamento, vencimento e fatura ---------- */

  const dayInt = (v) => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 31 ? n : 0; };

  /** Cartão de crédito com dia de fechamento e dia de vencimento informados. Os demais seguem como antes. */
  function isBilled(card) {
    return !!card && card.kind === 'credito' && dayInt(card.closing_day) > 0 && dayInt(card.due_day) > 0;
  }

  /** Em qual fatura cai uma compra feita em dateStr.
      Compra antes do dia do fechamento entra na fatura que fecha neste mês; no dia do fechamento ou depois, na do mês seguinte.
      Se o vencimento é maior que o fechamento, vence no mês do fechamento; senão, no mês seguinte.
      Mês curto usa o último dia. A fatura é identificada pelo mês do vencimento (month). */
  function invoiceOf(card, dateStr) {
    const c = dayInt(card.closing_day), d = dayInt(card.due_day);
    const ym = monthOf(dateStr);
    const closeMonth = dayOf(dateStr) < Math.min(c, daysInMonth(ym)) ? ym : addMonths(ym, 1);
    const month = d > c ? closeMonth : addMonths(closeMonth, 1);
    return { month, closeMonth, closeDate: dateIn(closeMonth, c), dueDate: dateIn(month, d) };
  }

  /** Datas de fechamento e de vencimento da fatura que vence em month (AAAA-MM). */
  function invoiceDates(card, month) {
    const c = dayInt(card.closing_day), d = dayInt(card.due_day);
    const closeMonth = d > c ? month : addMonths(month, -1);
    return { closeDate: dateIn(closeMonth, c), dueDate: dateIn(month, d) };
  }

  /** Compras de uma fatura (cartão + mês do vencimento), sem as puladas. */
  const invoiceTxs = (txs, cardId, month, exceptId) =>
    txs.filter((t) => t.kind === 'despesa' && !t.skipped && t.card_id === cardId && t.month === month && t.id !== exceptId);

  /** Onde uma compra no cartão cai: mês da fatura, de qual renda sai e se já está paga.
      Se a fatura já existe, a compra acompanha a renda e a situação dela; senão usa a renda do cartão ("A definir" se não houver)
      e conta como paga só se o vencimento já passou. */
  function placeOnInvoice(card, dateStr, txs, today, exceptId) {
    const inv = invoiceOf(card, dateStr);
    const mates = invoiceTxs(txs, card.id, inv.month, exceptId);
    const sources = new Set(mates.map((t) => t.source));
    return {
      month: inv.month, closeDate: inv.closeDate, dueDate: inv.dueDate, joins: mates.length,
      source: sources.size === 1 ? [...sources][0] : (card.pay_source || 'definir'),
      paid: mates.length ? mates.every((t) => t.paid) : inv.dueDate <= today,
    };
  }

  /** Faturas (uma saída por cartão e mês de vencimento). Só cartões de crédito com fechamento e vencimento. */
  function invoices(txs, cards) {
    const byId = new Map(cards.map((c) => [c.id, c]));
    const map = new Map();
    for (const t of txs) {
      if (t.kind !== 'despesa' || t.skipped || !t.card_id) continue;
      const card = byId.get(t.card_id);
      if (!isBilled(card)) continue;
      const key = t.card_id + '|' + t.month;
      let inv = map.get(key);
      if (!inv) {
        inv = Object.assign({ key, card_id: t.card_id, month: t.month, cents: 0, pendingCents: 0, count: 0, paidCount: 0, sources: new Set(), ids: [], items: [] }, invoiceDates(card, t.month));
        map.set(key, inv);
      }
      const c = toCents(t.amount);
      inv.cents += c; inv.count++; inv.ids.push(t.id); inv.items.push(t); inv.sources.add(t.source);
      if (t.paid) inv.paidCount++; else inv.pendingCents += c;
    }
    return [...map.values()].map((inv) => Object.assign(inv, {
      total: inv.cents / 100, pending: inv.pendingCents / 100, paid: inv.paidCount === inv.count,
      source: inv.sources.size === 1 ? [...inv.sources][0] : null,
    }));
  }

  const SOURCE_KEYS = ['salario', 'vale', 'outra'];
  const incomeKey = (k) => (SOURCE_KEYS.includes(k) ? k : 'outra');

  /** Rendas fixas cadastradas (entradas ativas), sem repetir a fonte: [{ key, name, day }]. */
  function incomeOptions(recurring) {
    const best = new Map();
    for (const r of recurring) {
      if (r.kind !== 'receita' || !r.active) continue;
      const key = incomeKey(r.source);
      const cur = best.get(key);
      if (!cur || Number(r.day) < cur.day) best.set(key, { key, name: SOURCES.find((x) => x.key === key).name, day: Number(r.day) });
    }
    return SOURCE_KEYS.filter((k) => best.has(k)).map((k) => best.get(k));
  }

  /** Renda sugerida para pagar uma fatura: a que cai no dia do vencimento ou logo antes dele.
      Se nenhuma cai antes (vencimento no começo do mês), vale a última que caiu no mês anterior. */
  function suggestPaySource(recurring, dueDay) {
    const rows = recurring.filter((r) => r.kind === 'receita' && r.active);
    if (!rows.length) return null;
    const before = rows.filter((r) => Number(r.day) <= dueDay);
    const pool = before.length ? before : rows;
    const top = pool.reduce((a, r) => (Number(r.day) > Number(a.day) ? r : a));
    return { key: incomeKey(top.source), day: Number(top.day) };
  }

  /** De qual renda sai um gasto sem cartão de fatura, pela data (#17): cada renda sustenta o período até a próxima chegar.
      Vale a renda que chegou mais recentemente até aquele dia (no mês, ou no mês anterior se nenhuma chegou ainda).
      Com uma renda só, ela sustenta o ciclo inteiro. Sem renda cadastrada devolve null (o gasto fica "a definir"). */
  function incomeForDate(recurring, dateStr) {
    const rows = (recurring || []).filter((r) => r.kind === 'receita' && r.active);
    if (!rows.length || !dateStr) return null;
    const m = monthOf(dateStr);
    let best = null;
    for (const mm of [m, addMonths(m, -1)]) {
      for (const r of rows) {
        const arrives = dateIn(mm, Number(r.day)); // mês curto: a renda do dia 30 cai no último dia
        if (arrives <= dateStr && (!best || arrives > best.arrives)) best = { key: incomeKey(r.source), arrives };
      }
      if (best) break;
    }
    return best;
  }

  function addDays(dateStr, n) {
    const p = dateStr.split('-').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }

  /** Data de uma cobrança que se repete todo mês (dia day) dentro da fatura que vence em invMonth.
      Se o dia não existe naquele ciclo (fechamento 31 em fevereiro, por exemplo), usa o último dia antes do fechamento. */
  function chargeDate(card, invMonth, day) {
    const { closeDate } = invoiceDates(card, invMonth);
    const closeMonth = monthOf(closeDate);
    const prev = dateIn(addMonths(closeMonth, -1), day), same = dateIn(closeMonth, day);
    const order = day >= dayInt(card.closing_day) ? [prev, same] : [same, prev];
    return order.find((x) => invoiceOf(card, x).month === invMonth) || addDays(closeDate, -1);
  }

  /* ---------- Contas fixas ---------- */

  /** Lançamento de uma conta fixa. Em conta fixa no cartão de crédito com fatura, month é o mês da fatura (vencimento). */
  function instanceOf(r, month, card, txs) {
    const billed = r.kind === 'despesa' && isBilled(card);
    const base = addMonths(month, -(r.month_offset || 0));
    let date = dateIn(base, r.day), source = r.source;
    if (billed) {
      date = chargeDate(card, month, r.day);
      const mates = invoiceTxs(txs || [], card.id, month);
      const sources = new Set(mates.map((t) => t.source));
      source = sources.size === 1 ? [...sources][0] : (card.pay_source || 'definir');
    }
    return {
      id: uid(), kind: r.kind, description: r.description, amount: r.amount,
      date, month, category: r.category || null, card_id: r.card_id || null,
      source, paid: false, skipped: false,
      recurring_id: r.id, group_id: null, installment_no: null, installments_total: null,
    };
  }

  /** Lançamentos que faltam criar para as contas fixas, de fromMonth até toMonth. */
  function missingRecurring(recurring, txs, toMonth, cards) {
    const out = [];
    const active = recurring.filter((r) => r.active);
    if (!active.length) return out;
    const byId = new Map((cards || []).map((c) => [c.id, c]));
    const have = new Set(txs.filter((t) => t.recurring_id).map((t) => t.recurring_id + '|' + t.month));
    for (const r of active) {
      let m = r.start_month;
      let guard = 0;
      while (m <= toMonth && guard++ < 240) {
        if (!have.has(r.id + '|' + m)) out.push(instanceOf(r, m, byId.get(r.card_id), txs));
        m = addMonths(m, 1);
      }
    }
    return out;
  }

  /* ---------- Parcelas ---------- */

  /**
   * Cria as parcelas de uma compra. startNo (opcional) é a parcela em que a pessoa já está:
   * começa nela, na data informada, e as de antes não entram (já passaram).
   */
  function buildInstallments(o) {
    const parts = splitInstallments(toCents(o.totalAmount), o.n);
    const group = uid();
    const startMonth = monthOf(o.firstDate);
    const day = dayOf(o.firstDate);
    const billed = isBilled(o.card);
    const startNo = Math.min(Math.max(parseInt(o.startNo, 10) || 1, 1), o.n);
    return parts.slice(startNo - 1).map((c, j) => {
      const i = startNo - 1 + j;
      const date = dateIn(addMonths(startMonth, j), day);
      let month = monthOf(date), source = o.source, paid = date <= o.today;
      if (billed) { // cartão com fatura: cada parcela cai na fatura da sua data
        const pl = placeOnInvoice(o.card, date, o.txs || [], o.today);
        month = pl.month; source = pl.source; paid = pl.paid;
      }
      return {
        id: uid(), kind: 'despesa', description: o.description, amount: c / 100,
        date, month, category: o.category || null, card_id: o.card_id || null, source,
        paid, skipped: false,
        recurring_id: null, group_id: group, installment_no: i + 1, installments_total: o.n,
      };
    });
  }

  /** Lê "3/10" ou "3 de 10" na descrição: parcela atual e total. Devolve o nome sem esse trecho. */
  function installmentFromText(text) {
    const s = String(text || '');
    const m = /(^|[\s(\-\u2013])(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})(?=$|[\s).,;])/i.exec(s);
    if (!m) return null;
    const no = Number(m[2]), total = Number(m[3]);
    if (!(total >= 2 && total <= 60 && no >= 1 && no <= total)) return null;
    const name = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/\s+/g, ' ').replace(/^[\s\-\u2013(),;:]+|[\s\-\u2013(),;:]+$/g, '');
    return { no, total, name };
  }

  /**
   * Compras parceladas, uma por compra (junta os cartões), para a tela de parcelas.
   * Cada uma traz quantas já foram pagas, qual é a próxima, quanto falta e quando termina.
   * Parcelas de antes do registro (a compra foi lançada já na 3 de 10) contam como pagas.
   */
  function installmentPlans(txs) {
    const groups = new Map();
    for (const t of txs) {
      if (t.kind !== 'despesa' || t.skipped || !t.group_id || !(Number(t.installments_total) >= 2)) continue;
      if (!groups.has(t.group_id)) groups.set(t.group_id, []);
      groups.get(t.group_id).push(t);
    }
    const sum = (list) => list.reduce((c, r) => c + toCents(r.amount), 0) / 100;
    const plans = [];
    for (const [id, rows] of groups) {
      rows.sort((a, b) => a.installment_no - b.installment_no);
      const first = rows[0], last = rows[rows.length - 1];
      const n = Math.max.apply(null, rows.map((r) => Number(r.installments_total)));
      const open = rows.filter((r) => !r.paid);
      const next = open[0] || null;
      const before = Math.max(0, Number(first.installment_no) - 1);
      plans.push({
        id, rows, n, description: first.description, card_id: first.card_id || null, category: first.category || null,
        paidNo: before + rows.length - open.length, next, nextNo: next ? Number(next.installment_no) : n,
        remaining: open.length, remainingAmount: sum(open), total: sum(rows),
        nextAmount: (next || last).amount, nextMonth: next ? next.month : null, lastMonth: last.month, done: !next,
      });
    }
    return plans.sort((a, b) => (a.done - b.done) || String(a.nextMonth).localeCompare(String(b.nextMonth)) || a.description.localeCompare(b.description, 'pt-BR'));
  }

  /** Quanto de parcela cai em cada mês, de fromMonth em diante. O que está atrasado entra no primeiro mês. */
  function installmentMonths(plans, fromMonth, count) {
    const sums = new Map();
    const later = { count: 0, cents: 0 };
    const end = addMonths(fromMonth, count - 1);
    for (const p of plans) {
      for (const r of p.rows) {
        if (r.paid) continue;
        const m = r.month < fromMonth ? fromMonth : r.month;
        if (m > end) { later.count++; later.cents += toCents(r.amount); continue; }
        sums.set(m, (sums.get(m) || 0) + toCents(r.amount));
      }
    }
    const series = [];
    for (let i = 0; i < count; i++) { const m = addMonths(fromMonth, i); series.push({ month: m, value: (sums.get(m) || 0) / 100 }); }
    return { series, later: { count: later.count, amount: later.cents / 100 } };
  }

  /* ---------- Saldo que passa de um mês para o seguinte ---------- */

  /** Saldo com que a pessoa começou ({ mes: 'AAAA-MM', valor }; negativo é dívida), ou null se não informou. */
  function openingOf(settings) {
    const o = settings && settings.saldo_inicial;
    if (!o || !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(o.mes)) || !Number.isFinite(Number(o.valor)) || Number(o.valor) === 0) return null;
    return { month: o.mes, amount: Math.round(Number(o.valor) * 100) / 100 };
  }

  /**
   * Quanto veio do mês anterior: a soma do que sobrou (ou faltou) em cada mês desde o começo.
   * list traz lançamentos com month = o período (mês comum, ou mês de renda via cycleView).
   * O começo é o mês do saldo inicial, se a pessoa informou, ou o primeiro mês que tem lançamento.
   * Devolve { amount, start, has }: has é falso quando não há nada para passar.
   */
  function carryOver(list, month, opening) {
    const net = new Map();
    let first = '';
    for (const t of list) {
      if (t.skipped || !t.month) continue;
      net.set(t.month, (net.get(t.month) || 0) + (t.kind === 'receita' ? 1 : -1) * toCents(t.amount));
      if (!first || t.month < first) first = t.month;
    }
    const start = opening ? opening.month : first;
    if (!start || month < start) return { amount: 0, start: start || '', has: false };
    let c = opening ? toCents(opening.amount) : 0;
    let m = start;
    for (let i = 0; m < month && i < 600; i++) { c += net.get(m) || 0; m = addMonths(m, 1); }
    return { amount: c / 100, start, has: c !== 0 };
  }

  /* ---------- Somas ---------- */

  const live = (txs) => txs.filter((t) => !t.skipped);

  function summarize(txs, month) {
    const fontes = {};
    for (const s of SOURCES) fontes[s.key] = { entrou: 0, gastou: 0, faltaReceber: 0 };
    let inC = 0, outC = 0, pendOut = 0, pendIn = 0, fixedOut = 0, count = 0;
    for (const t of txs) {
      if (t.skipped || t.month !== month) continue;
      count++;
      const c = toCents(t.amount);
      const f = fontes[t.source] || fontes.outra;
      if (t.kind === 'receita') {
        inC += c; f.entrou += c;
        if (!t.paid) { pendIn += c; f.faltaReceber += c; }
      } else {
        outC += c; f.gastou += c;
        if (!t.paid) pendOut += c;
        if (t.recurring_id) fixedOut += c;
      }
    }
    const d = (c) => c / 100;
    for (const k of Object.keys(fontes)) {
      const f = fontes[k];
      f.resta = d(f.entrou - f.gastou);
      f.entrou = d(f.entrou); f.gastou = d(f.gastou); f.faltaReceber = d(f.faltaReceber);
    }
    return {
      count, receitas: d(inC), despesas: d(outC), sobra: d(inC - outC),
      faltaPagar: d(pendOut), faltaReceber: d(pendIn),
      fixas: d(fixedOut), variaveis: d(outC - fixedOut), fontes,
    };
  }

  function rankBy(list, keyFn) {
    const m = new Map();
    let total = 0;
    for (const t of list) {
      const c = toCents(t.amount);
      const k = keyFn(t);
      m.set(k, (m.get(k) || 0) + c);
      total += c;
    }
    const rows = [...m].map(([key, c]) => ({ key, total: c / 100, pct: total ? c / total : 0 }))
      .sort((a, b) => b.total - a.total || String(a.key).localeCompare(String(b.key)));
    return { rows, total: total / 100 };
  }

  const expensesIn = (txs, monthSet) => txs.filter((t) => !t.skipped && t.kind === 'despesa' && monthSet.has(t.month));

  const byCategory = (txs, months) => rankBy(expensesIn(txs, new Set(months)), (t) => t.category || 'outros');
  const byCard = (txs, months) => rankBy(expensesIn(txs, new Set(months)), (t) => t.card_id || '_dinheiro');

  function monthlySeries(txs, endMonth, n) {
    return rangeMonths(endMonth, n).map((month) => {
      let d = 0, r = 0;
      for (const t of txs) {
        if (t.skipped || t.month !== month) continue;
        if (t.kind === 'despesa') d += toCents(t.amount); else r += toCents(t.amount);
      }
      return { month, despesas: d / 100, receitas: r / 100 };
    });
  }

  /* ---------- Mês de renda: de um dia 15 até o dia 14 do mês seguinte (#15) ---------- */

  const CYCLE_FIRST_DAY = 15;

  /** O mês de renda M vai de 15/M até 14/(M+1): o vale chega dia 15, o salário dia 30 e sustenta até o dia 14.
      Cada renda leva o nome do mês em que é recebida. Devolve o mês de renda (AAAA-MM) a que uma data pertence. */
  function cycleOf(dateStr) {
    const ym = monthOf(dateStr);
    return dayOf(dateStr) >= CYCLE_FIRST_DAY ? ym : addMonths(ym, -1);
  }

  /** Primeiro e último dia do mês de renda. */
  function cycleDates(month) {
    return { start: dateIn(month, CYCLE_FIRST_DAY), end: dateIn(addMonths(month, 1), CYCLE_FIRST_DAY - 1) };
  }

  /** Dia em que a despesa de fato sai do bolso: no cartão com fatura é o vencimento da fatura; no resto, a data do lançamento. */
  function payDate(t, cardsById) {
    if (t.kind === 'despesa' && t.card_id && cardsById) {
      const card = cardsById.get(t.card_id);
      if (isBilled(card)) return invoiceDates(card, t.month).dueDate;
    }
    return t.date;
  }

  /** Os lançamentos vistos por mês de renda: cada um com month = mês de renda do dia do pagamento (e payDate).
      Gasto conta quando é pago, então a fatura entra no vencimento. Lançamentos pulados ficam de fora. */
  function cycleView(txs, cards) {
    const byId = new Map((cards || []).map((c) => [c.id, c]));
    const out = [];
    for (const t of txs) {
      if (t.skipped) continue;
      const pd = payDate(t, byId);
      out.push(Object.assign({}, t, { month: cycleOf(pd), payDate: pd }));
    }
    return out;
  }

  /** Situação da medição de um ou mais meses de renda (months em ordem, do mais antigo ao mais novo).
      É parcial enquanto o último período não terminou: débito, Pix e dinheiro continuam entrando até o dia 14, e uma fatura
      que vence dentro do período já fechou antes do vencimento, então só falta o período acabar. Depois disso, mês fechado. */
  function cycleStatus(months, today) {
    const start = cycleDates(months[0]).start, end = cycleDates(months[months.length - 1]).end;
    return { start, end, closed: today > end, started: today >= start };
  }

  /** Dia (AAAA-MM-DD, no relógio do aparelho) de um carimbo de data e hora. */
  function stampDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** Marca de ajuste: lançamentos que entraram depois que o mês de renda deles fechou.
      view vem de cycleView. Quem não tem data de lançamento (dados antigos) não conta. */
  function lateEntries(view, months) {
    const set = new Set(months);
    const items = [];
    let cents = 0;
    for (const t of view) {
      if (t.skipped || !set.has(t.month) || !t.created_at) continue;
      const made = stampDate(t.created_at);
      if (made && made > cycleDates(t.month).end) {
        items.push(t);
        if (t.kind === 'despesa') cents += toCents(t.amount);
      }
    }
    items.sort((a, b) => (a.payDate < b.payDate ? -1 : a.payDate > b.payDate ? 1 : 0));
    return { items, count: items.length, spent: cents / 100 };
  }

  /** Recebi, gastei e sobra de cada renda nos meses de renda indicados, e o total. view vem de cycleView. */
  function incomeSummary(view, months) {
    const set = new Set(months);
    const raw = {};
    for (const s of SOURCES) raw[s.key] = { recebi: 0, gastei: 0, faltaReceber: 0, faltaPagar: 0 };
    for (const t of view) {
      if (t.skipped || !set.has(t.month)) continue;
      const f = raw[t.source] || raw.outra;
      const c = toCents(t.amount);
      if (t.kind === 'receita') { f.recebi += c; if (!t.paid) f.faltaReceber += c; }
      else { f.gastei += c; if (!t.paid) f.faltaPagar += c; }
    }
    const fontes = {}, tot = { recebi: 0, gastei: 0, faltaReceber: 0, faltaPagar: 0 };
    for (const k of Object.keys(raw)) {
      const f = raw[k];
      for (const key of Object.keys(tot)) tot[key] += f[key];
      fontes[k] = { recebi: f.recebi / 100, gastei: f.gastei / 100, faltaReceber: f.faltaReceber / 100, faltaPagar: f.faltaPagar / 100, sobra: (f.recebi - f.gastei) / 100 };
    }
    return {
      fontes,
      total: { recebi: tot.recebi / 100, gastei: tot.gastei / 100, faltaReceber: tot.faltaReceber / 100, faltaPagar: tot.faltaPagar / 100, sobra: (tot.recebi - tot.gastei) / 100 },
    };
  }

  /* ---------- Quando você gasta: dia da semana e parte do mês ---------- */

  const WEEKDAY_ROWS = [ // índice = Date#getDay (0 = domingo)
    { dow: 1, name: 'Segunda-feira', short: 'Seg', art: 'na', low: 'segunda-feira' },
    { dow: 2, name: 'Terça-feira', short: 'Ter', art: 'na', low: 'terça-feira' },
    { dow: 3, name: 'Quarta-feira', short: 'Qua', art: 'na', low: 'quarta-feira' },
    { dow: 4, name: 'Quinta-feira', short: 'Qui', art: 'na', low: 'quinta-feira' },
    { dow: 5, name: 'Sexta-feira', short: 'Sex', art: 'na', low: 'sexta-feira' },
    { dow: 6, name: 'Sábado', short: 'Sáb', art: 'no', low: 'sábado' },
    { dow: 0, name: 'Domingo', short: 'Dom', art: 'no', low: 'domingo' },
  ];

  const MONTH_PARTS = [
    { key: 'inicio', name: 'Início do mês', range: 'dias 1 a 10', label: 'Início (1 a 10)', from: 1, to: 10, art: 'no início do mês' },
    { key: 'meio', name: 'Meio do mês', range: 'dias 11 a 20', label: 'Meio (11 a 20)', from: 11, to: 20, art: 'no meio do mês' },
    { key: 'fim', name: 'Fim do mês', range: 'dia 21 em diante', label: 'Fim (21 em diante)', from: 21, to: 31, art: 'no fim do mês' },
  ];

  const WEEKDAY_MIN_DAYS = 28; // menos de 4 semanas de dados: avisa que ainda é pouco
  const PART_MIN_MONTHS = 2;   // menos de 2 meses com gastos: avisa que ainda é pouco

  /** Dia da semana (0 = domingo) de uma data AAAA-MM-DD, sem depender de fuso. */
  function dowOf(dateStr) {
    const p = String(dateStr).split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  }

  const dayNumber = (dateStr) => { const p = String(dateStr).split('-').map(Number); return Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000); };

  /** Em que dia da semana e em que parte do mês saiu mais dinheiro.
      Conta só despesas já ocorridas (data até hoje), no mesmo período da tela. Contas fixas contam no dia do vencimento. */
  function spendingWhen(txs, months, today) {
    const exp = expensesIn(txs, new Set(months)).filter((t) => t.date && t.date <= today);
    const wd = new Map(WEEKDAY_ROWS.map((w) => [w.dow, { cents: 0, count: 0 }]));
    const pt = new Map(MONTH_PARTS.map((p) => [p.key, { cents: 0, count: 0 }]));
    const monthsSeen = new Set();
    let totalC = 0, first = null, last = null;
    for (const t of exp) {
      const c = toCents(t.amount);
      totalC += c;
      const w = wd.get(dowOf(t.date)); w.cents += c; w.count++;
      const d = Number(t.date.slice(8, 10));
      const part = MONTH_PARTS.find((p) => d >= p.from && d <= p.to);
      const q = pt.get(part.key); q.cents += c; q.count++;
      monthsSeen.add(t.date.slice(0, 7));
      if (first === null || t.date < first) first = t.date;
      if (last === null || t.date > last) last = t.date;
    }
    const row = (base, v) => Object.assign({}, base, { total: v.cents / 100, count: v.count, pct: totalC ? v.cents / totalC : 0 });
    const weekdays = WEEKDAY_ROWS.map((w) => row(w, wd.get(w.dow)));
    const parts = MONTH_PARTS.map((p) => row(p, pt.get(p.key)));
    const topOf = (rows) => {
      const max = Math.max.apply(null, rows.map((r) => r.total));
      return max > 0 ? rows.filter((r) => r.total === max) : [];
    };
    const spanDays = first ? dayNumber(last) - dayNumber(first) + 1 : 0;
    return {
      count: exp.length, total: totalC / 100, weekdays, parts,
      topWeekdays: topOf(weekdays), topParts: topOf(parts),
      spanDays, monthsWithData: monthsSeen.size,
      fewWeekdays: spanDays < WEEKDAY_MIN_DAYS, fewParts: monthsSeen.size < PART_MIN_MONTHS,
    };
  }

  /* ---------- Frases de análise ---------- */

  const pctText = (p) => (p > 0 && p < 0.005 ? 'menos de 1%' : Math.round(p * 100) + '%');

  function buildInsights(o) {
    const { txs, months, today, catName, cardName } = o;
    // Com cycle, os meses são meses de renda (15 a 14) e as datas são as do pagamento (txs vem de cycleView).
    const cyc = !!o.cycle;
    const curMonth = cyc ? cycleOf(today) : monthOf(today);
    const dateOf = (t) => (cyc ? t.payDate || t.date : t.date);
    const set = new Set(months);
    const exp = expensesIn(txs, set);
    const out = [];
    if (!exp.length) return out;

    const total = exp.reduce((s, t) => s + toCents(t.amount), 0) / 100;
    const cats = rankBy(exp, (t) => t.category || 'outros');
    const top = cats.rows[0];
    out.push({ tone: 'info', text: catName(top.key) + ' é onde mais saiu dinheiro: ' + pctText(top.pct) + ' das despesas (' + fmtBRL(top.total) + ').' });

    // Comparação com o período anterior (no mês atual, compara até o mesmo dia).
    const n = months.length;
    const last = months[n - 1];
    const prevMonths = rangeMonths(addMonths(months[0], -1), n);
    let nowVal = total, prevVal = 0, prefix = 'Você gastou';
    let label = n === 1 ? (cyc ? 'no mês de renda anterior' : 'no mês anterior') : 'no período anterior';
    if (n === 1 && last === curMonth && cyc) {
      // até o mesmo ponto do período: quantos dias já se passaram desde o dia 15
      const k = dayNumber(today) - dayNumber(cycleDates(last).start);
      const pStart = dayNumber(cycleDates(prevMonths[0]).start);
      nowVal = exp.filter((t) => dateOf(t) <= today).reduce((s, t) => s + toCents(t.amount), 0) / 100;
      prevVal = expensesIn(txs, new Set(prevMonths)).filter((t) => dayNumber(dateOf(t)) - pStart <= k).reduce((s, t) => s + toCents(t.amount), 0) / 100;
      prefix = 'Até hoje você gastou';
      label = 'no mesmo ponto do mês de renda anterior';
    } else if (n === 1 && last === curMonth) {
      const day = dayOf(today);
      nowVal = exp.filter((t) => dayOf(t.date) <= day && t.date <= today).reduce((s, t) => s + toCents(t.amount), 0) / 100;
      prevVal = expensesIn(txs, new Set(prevMonths)).filter((t) => dayOf(t.date) <= day).reduce((s, t) => s + toCents(t.amount), 0) / 100;
      prefix = 'Até o dia ' + day + ' você gastou';
      label = 'até o dia ' + day + ' do mês anterior';
    } else if (last < curMonth) {
      prevVal = expensesIn(txs, new Set(prevMonths)).reduce((s, t) => s + toCents(t.amount), 0) / 100;
    }
    // Período que inclui o mês atual (incompleto) com mais de um mês: não compara.
    if (prevVal > 0) {
      const diff = (nowVal - prevVal) / prevVal;
      if (Math.abs(diff) < 0.01) {
        out.push({ tone: 'info', text: prefix + ' praticamente o mesmo que ' + label + ' (' + fmtBRL(prevVal) + ').' });
      } else if (diff > 0) {
        out.push({ tone: 'warn', text: prefix + ' ' + Math.round(diff * 100) + '% a mais que ' + label + ' (' + fmtBRL(prevVal) + ').' });
      } else {
        out.push({ tone: 'good', text: prefix + ' ' + Math.round(-diff * 100) + '% a menos que ' + label + ' (' + fmtBRL(prevVal) + ').' });
      }
    }

    // Contas fixas
    const fixed = exp.filter((t) => t.recurring_id).reduce((s, t) => s + toCents(t.amount), 0) / 100;
    if (fixed > 0 && total > 0) {
      out.push({ tone: 'info', text: 'Contas fixas somam ' + pctText(fixed / total) + ' das despesas (' + fmtBRL(fixed) + ').' });
    }

    // Média
    if (n === 1) {
      const isCur = last === curMonth;
      const spent = isCur ? exp.filter((t) => dateOf(t) <= today).reduce((s, t) => s + toCents(t.amount), 0) / 100 : total;
      let days;
      if (cyc) { const cd = cycleDates(last); days = isCur ? dayNumber(today) - dayNumber(cd.start) + 1 : dayNumber(cd.end) - dayNumber(cd.start) + 1; }
      else days = isCur ? dayOf(today) : daysInMonth(last);
      if (spent > 0 && days > 0) out.push({ tone: 'info', text: 'Em média, ' + fmtBRL(spent / days) + ' por dia' + (isCur ? ' até agora.' : '.') });
    } else {
      out.push({ tone: 'info', text: 'Média de ' + fmtBRL(total / n) + ' por mês no período.' });
    }

    // Cartão
    const cards = rankBy(exp, (t) => t.card_id || '_dinheiro');
    const topCard = cards.rows[0];
    if (topCard && (cards.rows.length > 1 || topCard.key !== '_dinheiro')) {
      out.push({ tone: 'info', text: cardName(topCard.key) + ' concentrou ' + pctText(topCard.pct) + ' dos gastos (' + fmtBRL(topCard.total) + ').' });
    }

    // Maior despesa
    const big = exp.reduce((a, t) => (!a || toCents(t.amount) > toCents(a.amount) ? t : a), null);
    if (big && exp.length > 1) {
      out.push({ tone: 'info', text: 'Maior despesa: ' + big.description + ' (' + fmtBRL(big.amount) + ') em ' + pad(dayOf(big.date)) + '/' + big.date.slice(5, 7) + '.' });
    }

    // Parcelas futuras
    const future = txs.filter((t) => !t.skipped && t.kind === 'despesa' && t.group_id && t.month > curMonth)
      .reduce((s, t) => s + toCents(t.amount), 0) / 100;
    if (future > 0) out.push({ tone: 'warn', text: 'Já há ' + fmtBRL(future) + ' comprometidos em parcelas dos próximos meses.' });

    return out;
  }

  /* ---------- Exportação ---------- */

  function toCSV(txs, o) {
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const head = ['Data', 'Mês', 'Tipo', 'Descrição', 'Valor', 'Nicho', 'Cartão', 'Fonte', 'Situação', 'Fixa', 'Parcela'];
    const srcName = (k) => (SOURCES.find((s) => s.key === k) || { name: k }).name;
    const rows = txs.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).map((t) => [
      t.date, t.month, t.kind === 'receita' ? 'Entrada' : 'Saída', t.description,
      fmtNum(t.amount), t.kind === 'receita' ? '' : o.catName(t.category || 'outros'),
      o.cardName(t.card_id || '_dinheiro'), srcName(t.source),
      t.skipped ? 'Pulada' : t.paid ? (t.kind === 'receita' ? 'Recebido' : 'Pago') : (t.kind === 'receita' ? 'A receber' : 'Pendente'),
      t.recurring_id ? 'Sim' : 'Não',
      t.installments_total ? t.installment_no + '/' + t.installments_total : '',
    ].map(q).join(';'));
    return '﻿' + [head.map(q).join(';')].concat(rows).join('\r\n');
  }

  const TERMS_VERSION = '2026-11-06'; // troque ao mudar a política ou os termos: todo mundo aceita de novo

  const Fin = {
    CATEGORIES, SOURCES, CASH_NAME, TERMS_VERSION,
    toCents, parseMoney, fmtBRL, fmtNum, fmtCompact, splitInstallments,
    pad, todayStr, monthOf, dayOf, addMonths, monthDiff, daysInMonth, dateIn, rangeMonths,
    monthLabel, monthName, monthShort, dayLabel, uid,
    categoryInfo, descKey, guessCategory, instanceOf, missingRecurring, buildInstallments, installmentFromText, installmentPlans, installmentMonths, openingOf, carryOver,
    isBilled, invoiceOf, invoiceDates, placeOnInvoice, invoices, incomeOptions, suggestPaySource, incomeForDate, chargeDate, dayInt,
    cycleOf, cycleDates, payDate, cycleView, cycleStatus, incomeSummary, dayNumber, stampDate, lateEntries,
    live, summarize, rankBy, byCategory, byCard, monthlySeries, spendingWhen, dowOf, buildInsights, toCSV,
  };

  root.Fin = Fin;
  if (typeof module !== 'undefined' && module.exports) module.exports = Fin;
})(typeof window !== 'undefined' ? window : globalThis);
