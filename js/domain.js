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

  /* ---------- Contas fixas ---------- */

  function instanceOf(r, month) {
    const base = addMonths(month, -(r.month_offset || 0));
    return {
      id: uid(), kind: r.kind, description: r.description, amount: r.amount,
      date: dateIn(base, r.day), month, category: r.category || null, card_id: r.card_id || null,
      source: r.source, paid: false, skipped: false,
      recurring_id: r.id, group_id: null, installment_no: null, installments_total: null,
    };
  }

  /** Lançamentos que faltam criar para as contas fixas, de fromMonth até toMonth. */
  function missingRecurring(recurring, txs, toMonth) {
    const out = [];
    const active = recurring.filter((r) => r.active);
    if (!active.length) return out;
    const have = new Set(txs.filter((t) => t.recurring_id).map((t) => t.recurring_id + '|' + t.month));
    for (const r of active) {
      let m = r.start_month;
      let guard = 0;
      while (m <= toMonth && guard++ < 240) {
        if (!have.has(r.id + '|' + m)) out.push(instanceOf(r, m));
        m = addMonths(m, 1);
      }
    }
    return out;
  }

  /* ---------- Parcelas ---------- */

  function buildInstallments(o) {
    const parts = splitInstallments(toCents(o.totalAmount), o.n);
    const group = uid();
    const startMonth = monthOf(o.firstDate);
    const day = dayOf(o.firstDate);
    return parts.map((c, i) => {
      const month = addMonths(startMonth, i);
      const date = dateIn(month, day);
      return {
        id: uid(), kind: 'despesa', description: o.description, amount: c / 100,
        date, month, category: o.category || null, card_id: o.card_id || null, source: o.source,
        paid: date <= o.today, skipped: false,
        recurring_id: null, group_id: group, installment_no: i + 1, installments_total: o.n,
      };
    });
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
    const curMonth = monthOf(today);
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
    let label = n === 1 ? 'no mês anterior' : 'no período anterior';
    if (n === 1 && last === curMonth) {
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
      const spent = isCur ? exp.filter((t) => t.date <= today).reduce((s, t) => s + toCents(t.amount), 0) / 100 : total;
      const days = isCur ? dayOf(today) : daysInMonth(last);
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

  const Fin = {
    CATEGORIES, SOURCES, CASH_NAME,
    toCents, parseMoney, fmtBRL, fmtNum, fmtCompact, splitInstallments,
    pad, todayStr, monthOf, dayOf, addMonths, monthDiff, daysInMonth, dateIn, rangeMonths,
    monthLabel, monthName, monthShort, dayLabel, uid,
    categoryInfo, instanceOf, missingRecurring, buildInstallments,
    live, summarize, rankBy, byCategory, byCard, monthlySeries, spendingWhen, dowOf, buildInsights, toCSV,
  };

  root.Fin = Fin;
  if (typeof module !== 'undefined' && module.exports) module.exports = Fin;
})(typeof window !== 'undefined' ? window : globalThis);
