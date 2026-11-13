const S = window.SV;
const fila = (ej) => (S.filas('desempeno') || []).find((r) => r.fecha === S.corte() && r.ejecutivo === ej);
const delCorte = () => (S.filas('desempeno') || []).filter((r) => r.fecha === S.corte());

dash.draw('fecha', (el) => {
  const d = new Date(S.corte() + 'T12:00:00Z');
  el.textContent = S.DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' de noviembre';
});

dash.draw('kpi', (el) => {
  const ej = el.dataset.ej || 'Total empresa';
  el.setAttribute('data-where', 'fecha=' + S.corte() + '&ejecutivo=' + ej);
  const r = fila(ej);
  el.textContent = r ? S[el.dataset.fmt || 'usd'](r[el.dataset.field]) : '—';
});

dash.draw('luzmes', (el) => {
  const ej = el.dataset.ej || 'Total empresa';
  el.setAttribute('data-where', 'fecha=' + S.corte() + '&ejecutivo=' + ej);
  const r = fila(ej);
  el.className = 'sv-badge sv-b-' + (r ? r.semaforo_mes : '');
  el.textContent = r ? r.semaforo_mes : '—';
});

dash.draw('barra', (el) => {
  el.replaceChildren();
  const r = fila(el.dataset.ej || 'Total empresa');
  if (!r) return;
  const i = document.createElement('i');
  i.style.width = Math.min(100, (r.pct_logro || 0) * 100) + '%';
  i.style.background = S.luzColor(r.semaforo_mes);
  const b = document.createElement('b');
  b.style.left = Math.min(100, (r.plan_acum / r.plan_mensual) * 100) + '%';
  el.append(i, b);
});

dash.draw('ej', (sel) => {
  const pe = S.filas('plan_ejecutivos') || [];
  const opciones = ['Total empresa', 'Subtotal Los Robles', 'Subtotal Ari Store', 'Subtotal El Mayoreo', ...[...pe].sort((a, b) => a.orden - b.orden).map((e) => e.ejecutivo)];
  sel.replaceChildren(...opciones.map((o) => new Option(o, o)));
  sel.value = S.ej();
  sel.onchange = () => dash.setParams({ ej: sel.value });
});

const svTabla = (tb, rows, cols, keyFn) => {
  tb.replaceChildren();
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.dataset.key = keyFn(r);
    if (r.tipo && r.tipo !== 'ejecutivo') tr.className = 'sv-' + r.tipo;
    for (const c of cols) {
      const td = document.createElement('td');
      td.className = c.cls ? c.cls(r) : c.l ? 'l' : '';
      td.textContent = S[c.fmt](r[c.f]);
      tr.appendChild(td);
    }
    tb.appendChild(tr);
  }
};

const filtroAsesor = (rows) => {
  const a = S.asesor();
  if (a === 'Todos') return rows;
  if (a.startsWith('Subtotal ')) { const suc = a.slice(9); return rows.filter((r) => r.sucursal === suc); }
  return rows.filter((r) => r.ejecutivo === a);
};
const celdaDia = (p, corte) => (r) => 'c' + (r[p + '_fecha'] && r[p + '_fecha'] <= corte ? ' sv-c-' + r[p + '_luz'] : '');

dash.draw('maestra', (tb) => {
  svTabla(tb, delCorte(), [
    { f: 'ejecutivo', fmt: 'txt', l: 1 }, { f: 'sucursal', fmt: 'txt', l: 1 }, { f: 'plan_mensual', fmt: 'usd' }, { f: 'venta_acum', fmt: 'usd' },
    { f: 'pct_logro', fmt: 'pct1' }, { f: 'plan_dia', fmt: 'usd', cls: () => 'sep' }, { f: 'venta_dia', fmt: 'usd' },
    { f: 'pct_dia', fmt: 'pct', cls: (r) => 'sv-c-' + r.semaforo }, { f: 'hora_meta', fmt: 'txt' },
    { f: 'condicion', fmt: 'txt', cls: (r) => 'l sep' + (r.tipo === 'ejecutivo' ? ' sv-luz sv-luz-' + r.condicion : '') },
    { f: 'incentivo', fmt: 'txt', l: 1 }, { f: 'brecha', fmt: 'usd', cls: () => 'sep' },
  ], (r) => S.enc(r.fecha) + ',' + S.enc(r.ejecutivo));
});

dash.draw('asesor', (sel) => {
  const pe = S.filas('plan_ejecutivos') || [];
  const opciones = ['Todos', 'Subtotal Los Robles', 'Subtotal Ari Store', 'Subtotal El Mayoreo', ...[...pe].sort((a, b) => a.orden - b.orden).map((e) => e.ejecutivo)];
  sel.replaceChildren(...opciones.map((o) => new Option(o === 'Todos' ? 'Todos los ejecutivos' : o, o)));
  sel.value = S.asesor();
  sel.onchange = () => dash.setParams({ asesor: sel.value });
});

const semanaRows = () => filtroAsesor((S.filas('control_semanal') || []).filter((r) => r.semana === S.semana()).sort((a, b) => a.pos - b.pos));

dash.draw('gsem', (tb) => {
  const corte = S.corte();
  const cols = [{ f: 'ejecutivo', fmt: 'txt', l: 1 }, { f: 'sem_meta', fmt: 'usd' }, { f: 'sem_venta', fmt: 'usd' }, { f: 'sem_pct', fmt: 'pct', cls: (r) => 'sv-c-' + r.sem_luz }];
  ['lun', 'mar', 'mie', 'jue', 'vie', 'sab'].forEach((p, i) => cols.push({ f: p + '_pct', fmt: 'pct', cls: (r) => (i === 0 ? 'sep ' : '') + celdaDia(p, corte)(r) }));
  svTabla(tb, semanaRows(), cols, (r) => S.enc(r.semana) + ',' + S.enc(r.ejecutivo));
});

dash.draw('grilla', (tb) => {
  const corte = S.corte();
  const cols = [{ f: 'ejecutivo', fmt: 'txt', l: 1 }];
  for (const p of ['lun', 'mar', 'mie', 'jue', 'vie', 'sab']) {
    cols.push({ f: p + '_meta', fmt: 'usd', cls: () => 'sep' }, { f: p + '_venta', fmt: 'usd' }, { f: p + '_pct', fmt: 'pct', cls: celdaDia(p, corte) });
  }
  svTabla(tb, semanaRows(), cols, (r) => S.enc(r.semana) + ',' + S.enc(r.ejecutivo));
});

dash.draw('pesos', (el) => {
  el.replaceChildren();
  for (const r of [...(S.filas('pesos_dia') || [])].sort((a, b) => a.orden - b.orden)) {
    const c = document.createElement('span'); c.className = 'sv-chip'; c.textContent = r.dia + ' ' + S.pct1(r.peso); el.appendChild(c);
  }
});

dash.draw('tplan', (tb) => {
  svTabla(tb, S.filas('plan_semanal') || [], [
    { f: 'ejecutivo', fmt: 'txt', l: 1 }, { f: 'division', fmt: 'txt', l: 1 }, { f: 'peso_plan', fmt: 'pct1' }, { f: 'mes', fmt: 'usd' },
    { f: 's1', fmt: 'usd', cls: () => 'sep' }, { f: 's2', fmt: 'usd' }, { f: 's3', fmt: 'usd' }, { f: 's4', fmt: 'usd' }, { f: 's5', fmt: 'usd' },
    { f: 'q1', fmt: 'usd', cls: () => 'sep' }, { f: 'q2', fmt: 'usd' },
  ], (r) => r.ejecutivo);
});

dash.draw('psem', (el) => {
  el.replaceChildren();
  for (const r of [...(S.filas('peso_semanas') || [])].sort((a, b) => a.orden - b.orden)) {
    const c = document.createElement('span'); c.className = 'sv-chip';
    c.textContent = r.semana.replace('Semana ', 'S') + ' (' + r.rango + ') ' + S.pct1(r.peso_plan);
    el.appendChild(c);
  }
});

// ---- Gráficos
const ejeY = (svg, y, x0, x1) => {
  const ticks = y.ticks(4);
  svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', x0).attr('x2', x1).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
  svg.append('g').selectAll('text').data(ticks).join('text').attr('x', x0 - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((d) => d3.format('$,.0f')(d));
};
const margenIzq = (svg, max) => { const p = svg.append('text').attr('font-size', 11).text(d3.format('$,.0f')(max)); const w = p.node().getComputedTextLength(); p.remove(); return w + 10; };

// Base común de los dos gráficos del mes (1 al 30): mismo eje de días y mismo margen izquierdo
const mesBase = (el, H, mt) => {
  const rows = (S.filas('calendario') || []).filter((r) => r.ejecutivo === S.ej());
  if (!rows.length) return null;
  const W = Math.max(300, el.clientWidth), m = { t: mt, r: 10, b: 26, l: 8 };
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  m.l = margenIzq(svg, rows[rows.length - 1].plan_acum * 1.1);
  const x = d3.scaleBand(rows.map((r) => r.fecha), [m.l, W - m.r]).padding(0.16);
  const pad = x.step() * x.paddingInner() / 2;
  svg.append('g').selectAll('rect').data(rows.filter((r) => r.dia === 'Domingo')).join('rect').attr('x', (r) => x(r.fecha) - pad).attr('width', x.step()).attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'color-mix(in srgb, var(--color-fg) 5%, transparent)');
  const every = x.step() < 16 ? 2 : 1;
  svg.append('g').selectAll('text').data(rows.filter((r, i) => i % every === 0 || i === rows.length - 1)).join('text').attr('x', (r) => x(r.fecha) + x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle').attr('font-size', 10.5).attr('fill', (r) => (r.dia === 'Domingo' ? 'var(--cds-chart-muted)' : 'var(--color-fg-muted)')).text((r) => String(Number(r.fecha.slice(8, 10))));
  const corte = S.corte();
  const xc = x(corte);
  const lineaCorte = () => { if (xc != null) svg.append('line').attr('x1', xc + x.bandwidth() + pad).attr('x2', xc + x.bandwidth() + pad).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '3 3'); };
  return { rows, W, H, m, svg, x, pad, corte, lineaCorte };
};
const tituloDia = (r) => r.dia + ' ' + Number(r.fecha.slice(8, 10)) + ' nov';

dash.draw('cacum', (el) => {
  el.replaceChildren();
  const b = mesBase(el, 250, 16);
  if (!b) return;
  const { rows, W, H, m, svg, x, pad, corte, lineaCorte } = b;
  const y = d3.scaleLinear([0, (d3.max(rows, (r) => Math.max(r.plan_dia, r.fecha <= corte ? r.venta_dia : 0)) || 1) * 1.12], [H - m.b, m.t]).nice();
  ejeY(svg, y, m.l, W - m.r);
  const xi = d3.scaleBand(['p', 'v'], [0, x.bandwidth()]).padding(0.06);
  const g = svg.append('g').selectAll('g').data(rows).join('g').attr('transform', (r) => `translate(${x(r.fecha)},0)`);
  g.filter((r) => r.plan_dia > 0).append('rect').attr('x', xi('p')).attr('width', xi.bandwidth()).attr('y', (r) => y(r.plan_dia)).attr('height', (r) => y(0) - y(r.plan_dia)).attr('rx', 2).attr('fill', 'var(--cds-chart-muted)').attr('opacity', 0.55);
  g.filter((r) => r.fecha <= corte && r.venta_dia > 0).append('rect').attr('x', (r) => (r.plan_dia > 0 ? xi('v') : x.bandwidth() / 4)).attr('width', xi.bandwidth()).attr('y', (r) => y(r.venta_dia)).attr('height', (r) => y(0) - y(r.venta_dia)).attr('rx', 2).attr('fill', (r) => (r.plan_dia > 0 ? S.luzColor(r.semaforo) : S.BLUE)).attr('opacity', (r) => (r.plan_dia > 0 ? 1 : 0.6));
  if (x.bandwidth() >= 20) g.filter((r) => r.fecha <= corte && r.plan_dia > 0).append('text').attr('x', x.bandwidth() / 2).attr('y', (r) => Math.min(y(r.venta_dia), y(r.plan_dia)) - 4).attr('text-anchor', 'middle').attr('font-size', 8.5).attr('fill', 'var(--color-fg)').text((r) => S.pct(r.pct_dia));
  lineaCorte();
  const t = S.tip(el);
  g.append('rect').attr('x', -pad).attr('width', x.step()).attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'transparent')
    .on('mousemove', (ev, r) => {
      const [px, py] = d3.pointer(ev, el);
      const lineas = [['var(--cds-chart-muted)', 'Plan del día', r.plan_dia > 0 ? S.usd(r.plan_dia) : 'sin cuota']];
      if (r.fecha > corte) lineas.push([null, 'Venta del día', 'por venir']);
      else { lineas.push([r.plan_dia > 0 ? S.luzColor(r.semaforo) : S.BLUE, 'Venta del día', S.usd(r.venta_dia)]); if (r.plan_dia > 0) lineas.push([null, 'Cumplimiento', S.pct(r.pct_dia)]); }
      S.showTip(el, t, px, py, tituloDia(r), lineas);
    })
    .on('mouseleave', () => { t.hidden = true; });
});

dash.draw('cacum2', (el) => {
  el.replaceChildren();
  const b = mesBase(el, 250, 16);
  if (!b) return;
  const { rows, W, H, m, svg, x, pad, corte, lineaCorte } = b;
  const y = d3.scaleLinear([0, (d3.max(rows, (r) => Math.max(r.plan_acum, r.venta_acum)) || 1) * 1.08], [H - m.b, m.t]).nice();
  ejeY(svg, y, m.l, W - m.r);
  const cx = (r) => x(r.fecha) + x.bandwidth() / 2;
  const real = rows.filter((r) => r.fecha <= corte);
  const grad = 'svAcum' + Math.round(Math.random() * 1e6);
  const lg = svg.append('defs').append('linearGradient').attr('id', grad).attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
  [[0, 0.26], [0.25, 0.16], [0.5, 0.08], [0.75, 0.03], [1, 0]].forEach(([o, a]) => lg.append('stop').attr('offset', o).attr('stop-color', S.BLUE).attr('stop-opacity', a));
  svg.append('path').datum(real).attr('d', d3.area().x(cx).y0(y(0)).y1((r) => y(r.venta_acum))).attr('fill', `url(#${grad})`);
  svg.append('path').datum(rows).attr('d', d3.line().x(cx).y((r) => y(r.plan_acum))).attr('fill', 'none').attr('stroke', 'var(--cds-chart-muted)').attr('stroke-width', 2).attr('stroke-dasharray', '5 4');
  svg.append('path').datum(real).attr('d', d3.line().x(cx).y((r) => y(r.venta_acum))).attr('fill', 'none').attr('stroke', S.BLUE).attr('stroke-width', 2.5).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round');
  lineaCorte();
  const ult = real[real.length - 1];
  if (ult) {
    svg.append('circle').attr('cx', cx(ult)).attr('cy', y(ult.venta_acum)).attr('r', 4).attr('fill', S.BLUE);
    const lbl = svg.append('text').attr('x', cx(ult) + 8).attr('y', y(ult.venta_acum) - 6).attr('font-size', 11).attr('font-weight', 600).attr('fill', S.BLUE).text(S.usd(ult.venta_acum) + ' · ' + S.pct(ult.plan_acum ? ult.venta_acum / ult.plan_acum : null) + ' del plan a la fecha');
    if (cx(ult) + 8 + lbl.node().getComputedTextLength() > W - m.r) lbl.attr('x', cx(ult) - 8).attr('text-anchor', 'end');
  }
  const fin = rows[rows.length - 1];
  svg.append('text').attr('x', cx(fin)).attr('y', y(fin.plan_acum) - 7).attr('text-anchor', 'end').attr('font-size', 10.5).attr('fill', 'var(--color-fg-muted)').text('Plan ' + S.usd(fin.plan_acum));
  const dot = svg.append('circle').attr('r', 3.5).attr('fill', 'var(--cds-chart-muted)').attr('opacity', 0);
  const t = S.tip(el);
  svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', (r) => x(r.fecha) - pad).attr('width', x.step()).attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'transparent')
    .on('mousemove', (ev, r) => {
      const [px, py] = d3.pointer(ev, el);
      dot.attr('cx', cx(r)).attr('cy', y(r.plan_acum)).attr('opacity', 1);
      const lineas = [['var(--cds-chart-muted)', 'Plan acumulado', S.usd(r.plan_acum)]];
      if (r.fecha <= corte) { lineas.push([S.BLUE, 'Venta acumulada', S.usd(r.venta_acum)]); lineas.push([null, 'Avance vs. plan a la fecha', S.pct(r.plan_acum ? r.venta_acum / r.plan_acum : null)]); }
      S.showTip(el, t, px, py, tituloDia(r), lineas);
    })
    .on('mouseleave', () => { t.hidden = true; dot.attr('opacity', 0); });
});

dash.draw('mapa', (el) => {
  el.replaceChildren();
  const des = S.filas('desempeno') || [];
  const luzDes = new Map(des.map((r) => [r.fecha + '|' + r.ejecutivo, r.semaforo]));
  const rows = (S.filas('calendario') || []).filter((r) => r.tipo === 'ejecutivo').map((r) => ({ ...r, semaforo: luzDes.get(r.fecha + '|' + r.ejecutivo) || r.semaforo }));
  if (!rows.length) return;
  const corte = S.corte();
  const nombres = [...new Set(rows.map((r) => r.ejecutivo))];
  const fechas = [...new Set(rows.map((r) => r.fecha))].sort();
  const W = Math.max(320, el.clientWidth);
  const svg = d3.select(el).append('svg').attr('width', '100%');
  const p = svg.append('text').attr('font-size', 11);
  let lw = 0; for (const n of nombres) { p.text(n); lw = Math.max(lw, p.node().getComputedTextLength()); } p.remove();
  const m = { t: 30, r: 4, b: 4, l: lw + 12 };
  const cw = (W - m.l - m.r) / fechas.length, ch = 24;
  const H = m.t + nombres.length * ch + m.b;
  svg.attr('viewBox', `0 0 ${W} ${H}`);
  const x = (f) => m.l + fechas.indexOf(f) * cw, y = (n) => m.t + nombres.indexOf(n) * ch;
  svg.append('g').selectAll('text').data(nombres).join('text').attr('x', m.l - 8).attr('y', (n) => y(n) + ch / 2).attr('dy', '0.32em').attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--color-fg)').text((n) => n);
  const every = cw < 18 ? 2 : 1;
  svg.append('g').selectAll('text').data(fechas.filter((f, i) => i % every === 0)).join('text').attr('x', (f) => x(f) + cw / 2).attr('y', 12).attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', 'var(--color-fg-muted)').text((f) => S.DIAS[new Date(f + 'T12:00:00Z').getUTCDay()].slice(0, 1).toUpperCase());
  svg.append('g').selectAll('text').data(fechas.filter((f, i) => i % every === 0)).join('text').attr('x', (f) => x(f) + cw / 2).attr('y', 24).attr('text-anchor', 'middle').attr('font-size', 10).attr('fill', 'var(--color-fg-muted)').text((f) => String(Number(f.slice(8, 10))));
  const cells = svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (r) => x(r.fecha) + 1).attr('y', (r) => y(r.ejecutivo) + 1).attr('width', Math.max(1, cw - 2)).attr('height', ch - 2).attr('rx', 3)
    .style('fill', (r) => (r.dia === 'Domingo' ? (r.fecha <= corte && r.venta_dia > 0 ? 'color-mix(in srgb, #2F6FB5 35%, transparent)' : 'color-mix(in srgb, var(--color-fg) 4%, transparent)') : r.fecha > corte ? 'color-mix(in srgb, var(--color-fg) 9%, transparent)' : S.luzColor(r.semaforo)))
    .style('stroke', (r) => (r.dia === 'Domingo' ? 'color-mix(in srgb, var(--color-fg) 14%, transparent)' : 'none'))
    .style('stroke-dasharray', '2 2')
    .style('opacity', (r) => (r.fecha > corte || r.dia === 'Domingo' ? 1 : 0.85));
  if (cw >= 30) svg.append('g').selectAll('text').data(rows.filter((r) => r.fecha <= corte && r.dia !== 'Domingo')).join('text').attr('x', (r) => x(r.fecha) + cw / 2).attr('y', (r) => y(r.ejecutivo) + ch / 2).attr('dy', '0.32em').attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', '#fff').style('pointer-events', 'none').text((r) => d3.format('.0%')(Math.min(9.99, r.pct_dia || 0)));
  const t = S.tip(el);
  cells.on('mousemove', (ev, r) => { const [px, py] = d3.pointer(ev, el); S.showTip(el, t, px, py, r.ejecutivo + ' · ' + r.dia + ' ' + Number(r.fecha.slice(8, 10)) + ' nov', r.dia === 'Domingo' ? [[null, 'Meta', 'sin cuota (domingo)'], [null, 'Venta', r.fecha > corte ? 'por venir' : S.usd(r.venta_dia)]] : [[null, 'Meta', S.usd(r.plan_dia)], [null, 'Venta', r.fecha > corte ? 'por venir' : S.usd(r.venta_dia)], [null, 'Cumplimiento', r.fecha > corte ? '—' : S.pct(r.pct_dia)]]); })
    .on('mouseleave', () => { t.hidden = true; });
});

dash.draw('logo', (img) => {
  const r = (S.filas('logo') || [])[0];
  if (r && typeof r.imagen === 'string' && r.imagen.startsWith('data:image/png;base64,')) img.src = r.imagen; else img.removeAttribute('src');
});
