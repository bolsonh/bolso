/* Bolso: charts.js
   Gráficos em HTML e CSS, sem biblioteca. Cada função devolve texto HTML.
   Regras seguidas: barras finas com ponta arredondada só no fim do dado, uma só escala,
   cor só onde significa algo (Salário, Vale), destaque em um item e cinza no resto,
   valor sempre escrito em texto (nunca só pela cor) e tabela como alternativa. */
(function (root) {
  'use strict';
  const F = root.Fin;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Barras horizontais ordenadas (partes de um todo, comparar e ranquear). */
  function ranked(rows) {
    // rows: [{label, lead (emoji ou bolinha em HTML), value, pctText, hi (opcional: true destaca; sem hi, destaca o primeiro)}]
    if (!rows.length) return '';
    const max = Math.max.apply(null, rows.map((r) => r.value)) || 1;
    return '<ul class="rank">' + rows.map((r, i) => {
      const w = Math.max(r.value > 0 ? 1.5 : 0, (r.value / max) * 100);
      return '<li class="rank-row">' +
        '<div class="rank-top"><span class="rank-label">' + r.lead + '<span class="rank-name">' + esc(r.label) + '</span></span>' +
        '<span class="rank-val num">' + F.fmtBRL(r.value) + '</span>' +
        '<span class="rank-pct num">' + esc(r.pctText) + '</span></div>' +
        '<div class="rank-bar" aria-hidden="true"><i class="' + ((r.hi != null ? r.hi : i === 0) ? 'top' : '') + '" style="width:' + w.toFixed(2) + '%"></i></div>' +
        '</li>';
    }).join('') + '</ul>';
  }

  /** Medidor: quanto da entrada já foi gasto. */
  function meter(spent, received, colorVar) {
    const over = received > 0 && spent > received;
    const pct = received > 0 ? Math.min(100, (spent / received) * 100) : (spent > 0 ? 100 : 0);
    const col = over ? 'var(--critical)' : colorVar;
    return '<div class="meter" style="--c:' + col + '" role="img" aria-label="' + Math.round(pct) + '% gasto"><i style="width:' + pct.toFixed(1) + '%"></i></div>';
  }

  /** Barra fina dividida em partes (um todo cortado em poucas fatias). */
  function segBar(parts) {
    const total = parts.reduce((s, p) => s + p.value, 0);
    if (total <= 0) return '';
    return '<div class="seg-bar" role="img" aria-label="' + esc(parts.map((p) => p.label + ' ' + F.fmtBRL(p.value)).join(', ')) + '">' +
      parts.filter((p) => p.value > 0).map((p) => '<i style="flex:' + p.value.toFixed(2) + ';background:' + p.color + '"></i>').join('') + '</div>';
  }

  /** Teto "redondo" para o eixo: 1, 2, 2,5, 5 vezes uma potência de dez. */
  function niceMax(v) {
    if (v <= 0) return 100;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  /** Colunas por mês, uma série, destaque no mês escolhido. */
  function columns(series, highlight, label) {
    // series: [{month: 'AAAA-MM', value}]
    const max = niceMax(Math.max.apply(null, series.map((s) => s.value)));
    const ticks = [1, 0.5, 0];
    const grid = ticks.map((t) => '<div class="cols-line" style="bottom:' + (t * 100) + '%"><span>' + (t === 0 ? '0' : F.fmtCompact(max * t)) + '</span></div>').join('');
    const cols = series.map((s) => {
      const h = max ? (s.value / max) * 100 : 0;
      const hi = s.month === highlight;
      const tip = F.monthShort(s.month) + ' ' + s.month.slice(0, 4) + ': ' + F.fmtBRL(s.value);
      return '<button type="button" class="col' + (hi ? ' hi' : '') + '" style="--h:' + h.toFixed(2) + '%" data-tip="' + esc(tip) + '" aria-label="' + esc(tip) + '">' +
        '<i></i>' + (hi && s.value > 0 ? '<b class="num">' + F.fmtCompact(s.value) + '</b>' : '') + '</button>';
    }).join('');
    const xs = series.map((s) => '<span class="' + (s.month === highlight ? 'hi' : '') + '">' + F.monthShort(s.month) + '</span>').join('');
    const table = '<details class="tbl"><summary>Ver como tabela</summary><table><thead><tr><th>Mês</th><th class="r">' + esc(label || 'Despesas') + '</th></tr></thead><tbody>' +
      series.map((s) => '<tr><td>' + F.monthLabel(s.month) + '</td><td class="r num">' + F.fmtBRL(s.value) + '</td></tr>').join('') + '</tbody></table></details>';
    return '<div class="cols' + (series.length > 8 ? ' dense' : '') + '" style="--n:' + series.length + '"><div class="cols-plot">' + grid + '<div class="cols-bars">' + cols + '</div></div>' +
      '<div class="cols-x"><div class="cols-x-in">' + xs + '</div></div></div>' + table;
  }

  root.Charts = { ranked, meter, segBar, columns, niceMax };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Charts;
})(typeof window !== 'undefined' ? window : globalThis);
