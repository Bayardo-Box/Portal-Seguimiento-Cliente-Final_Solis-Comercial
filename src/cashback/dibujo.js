(function () {
  const root = document.getElementById('cb');
  const $ = (s) => root.querySelector(s);
  const tip = $('.cb-tip');
  const cssv = (n) => getComputedStyle(root).getPropertyValue(n).trim();
  const PAL = () => [cssv('--cb-red'), cssv('--cb-ink'), cssv('--cb-steel'), cssv('--cb-red-lt'), cssv('--cb-silver'), cssv('--cb-red-dk')];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mesLbl = (m) => MESES[+m.slice(5, 7) - 1] + ' ' + m.slice(2, 4);
  const fUSD = (v) => '$' + d3.format(',.0f')(v);
  const fUSD2 = (v) => '$' + d3.format(',.2f')(v);
  const fBig = (v) => Math.abs(v) >= 10000 ? '$' + new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v) : fUSD(v);
  const fN = d3.format(',');
  const fPct = (v) => (isFinite(v) ? d3.format('.2%')(v) : '—');
  const fPct1 = (v) => (isFinite(v) ? d3.format('.1%')(v) : '—');
  const dateLbl = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); return +d + ' ' + MESES[+m - 1] + ' ' + y; };
  const ESTADOS = ['Ingresado a sistema', 'Recibido en caja · pendiente OP', 'Pendiente OP', 'En reparación', 'Sin estatus (histórico)'];
  const estColor = (e) => ({
    'Ingresado a sistema': 'var(--color-ok)',
    'Recibido en caja · pendiente OP': 'var(--color-warn)',
    'Pendiente OP': 'var(--color-bad)',
    'En reparación': 'var(--cb-red-dk)',
    'Sin estatus (histórico)': 'var(--cb-silver)',
  }[e] || 'var(--cds-chart-muted)');
  const DEF = { start: null, end: null, sucursal: '', estado: '', modo: 'monto', grupo: 'sucursal', modelo: '', q: '', alerta: false };
  const P = () => Object.assign({}, DEF, dash.params());
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const failBox = (box, st) => { clear(box); if (st === 'error' || st === 'connect' || st === 'declined') box.appendChild(el('div', 'cb-fail', 'Failed to load')); };

  // ---------- tooltip ----------
  function showTip(ev, title, lines) {
    clear(tip);
    tip.appendChild(el('div', 't', title));
    for (const [lbl, val, color] of lines) {
      const r = el('div', 'r');
      const left = el('span');
      left.style.display = 'flex'; left.style.alignItems = 'center'; left.style.gap = '6px';
      if (color) { const sw = el('i', 'sw'); sw.style.background = color; left.appendChild(sw); }
      left.appendChild(document.createTextNode(lbl));
      r.appendChild(left); r.appendChild(el('span', null, val));
      tip.appendChild(r);
    }
    tip.style.display = 'block';
    const rb = root.getBoundingClientRect();
    let x = ev.clientX - rb.left + 14, y = ev.clientY - rb.top + 14;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    if (x + w > rb.width) x = ev.clientX - rb.left - w - 14;
    if (x < 0) x = 0;
    if (y + h > rb.height) y = ev.clientY - rb.top - h - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const hideTip = () => { tip.style.display = 'none'; };

  // ---------- controls ----------
  const fStart = $('.f-start'), fEnd = $('.f-end'), fSuc = $('.f-suc'), fEst = $('.f-est');
  const iQ = $('.i-q'), iMod = $('.i-mod'), iAlert = $('.i-alert');
  for (const [inp, key] of [[fStart, 'start'], [fEnd, 'end']]) {
    inp.addEventListener('change', () => {
      if (!inp.value) dash.setParams({ [key]: null });
      else if (inp.validity.valid && /^\d{4}-\d{2}-\d{2}$/.test(inp.value) && inp.value >= '2025-01-01') dash.setParams({ [key]: inp.value });
    });
    inp.addEventListener('blur', () => { inp.value = P()[key] || ''; });
  }
  fSuc.addEventListener('change', () => dash.setParams({ sucursal: fSuc.value }));
  fEst.addEventListener('change', () => dash.setParams({ estado: fEst.value }));
  $('.f-modo').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) dash.setParams({ modo: b.dataset.v }); });
  $('.f-grupo').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) dash.setParams({ grupo: b.dataset.v }); });
  $('.f-reset').addEventListener('click', () => { dash.resetParams(); sort = { k: 'Alerta', dir: -1 }; });
  let qTimer;
  iQ.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => dash.setParams({ q: iQ.value }), 250); });
  iMod.addEventListener('change', () => dash.setParams({ modelo: iMod.value }));
  iAlert.addEventListener('change', () => dash.setParams({ alerta: iAlert.checked }));
  let sort = { k: 'Alerta', dir: -1 };
  $('.c-inv thead').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-k]'); if (!b) return;
    sort = sort.k === b.dataset.k ? { k: sort.k, dir: -sort.dir } : { k: b.dataset.k, dir: b.dataset.k === 'Total' || b.dataset.k === 'Fecha' ? -1 : 1 };
    draw();
  });

  const fillSelect = (sel, first, opts, val) => {
    const cur = [...sel.options].map((o) => o.value).join('|');
    const next = [''].concat(opts).join('|');
    if (cur !== next) sel.replaceChildren(new Option(first, ''), ...opts.map((o) => new Option(o, o)));
    sel.value = opts.includes(val) ? val : '';
  };

  // ---------- helpers ----------
  const inRange = (r, p) => (!p.start || r.Fecha >= p.start) && (!p.end || r.Fecha <= p.end);
  const passes = (r, p) => inRange(r, p) && (!p.sucursal || r.Sucursal === p.sucursal) && (!p.estado || r.Estado === p.estado);
  const monthsBetween = (a, b) => { const out = []; let [y, m] = a.split('-').map(Number); const [Y, M] = b.split('-').map(Number); while (y < Y || (y === Y && m <= M)) { out.push(y + '-' + String(m).padStart(2, '0')); m++; if (m > 12) { m = 1; y++; } } return out; };
  const measure = (svg, txt) => { const t = svg.append('text').attr('font-size', 12).text(txt); const w = t.node().getComputedTextLength(); t.remove(); return w; };
  const styleAxis = (g) => { g.attr('font-size', null).attr('font-family', null); g.selectAll('text').attr('fill', 'var(--color-fg-muted)').style('font-size', '12px'); g.selectAll('.domain').attr('stroke', 'var(--cds-chart-axis)'); g.selectAll('.tick line').attr('stroke', 'var(--cds-chart-grid)'); };

  // ---------- monthly bar chart ----------
  function drawTrend(box, months, rowsByMonth, modo) {
    clear(box);
    const W = box.clientWidth || 600, H = 260;
    const data = months.map((m) => { const rs = rowsByMonth.get(m) || []; return { m, v: modo === 'monto' ? d3.sum(rs, (r) => r.Total) : rs.length, monto: d3.sum(rs, (r) => r.Total), n: rs.length }; });
    if (!data.length || !d3.sum(data, (d) => d.v)) { box.appendChild(el('div', 'cb-empty', 'Sin registros en el filtro actual')); return; }
    let acc = 0; data.forEach((d) => { acc += d.v; d.acc = acc; });
    data.forEach((d, i) => { const w = data.slice(Math.max(0, i - 2), i + 1); d.ma = d3.mean(w, (x) => x.v); });
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    const y = d3.scaleLinear([0, d3.max(data, (d) => d.v) * 1.1], [H - 28, 8]).nice();
    const fmt = modo === 'monto' ? fBig : fN;
    const ml = Math.ceil(d3.max(y.ticks(5), (t) => measure(svg, fmt(t)))) + 12;
    const x = d3.scaleBand(months, [ml, W - 8]).padding(0.25);
    svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - ml - 8)).tickFormat(fmt)).call(styleAxis).call((g) => g.select('.domain').remove());
    const step = Math.ceil(months.length * 48 / (W - ml));
    svg.append('g').attr('transform', `translate(0,${H - 28})`).call(d3.axisBottom(x).tickValues(months.filter((_, i) => i % step === 0)).tickFormat(mesLbl).tickSizeOuter(0)).call(styleAxis);
    svg.append('g').selectAll('rect').data(data).join('rect')
      .attr('x', (d) => x(d.m)).attr('width', x.bandwidth()).attr('y', (d) => y(d.v)).attr('height', (d) => Math.max(0, y(0) - y(d.v))).attr('rx', 4)
      .attr('fill', PAL()[0])
      .on('mousemove', (ev, d) => showTip(ev, mesLbl(d.m), [['Monto', fUSD2(d.monto), PAL()[0]], ['Transacciones', fN(d.n)], ['Promedio móvil 3m', fmt(Math.round(d.ma))], ['Acumulado', fmt(d.acc)]]))
      .on('mouseleave', hideTip);
    const line = d3.line().x((d) => x(d.m) + x.bandwidth() / 2).y((d) => y(d.ma));
    svg.append('path').datum(data).attr('d', line).attr('fill', 'none').attr('stroke', 'var(--cb-ink)').attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('stroke-dasharray', '4 3').attr('pointer-events', 'none');
  }

  // ---------- share line chart ----------
  function drawShare(box, pts) {
    clear(box);
    const W = box.clientWidth || 800, H = 260;
    if (!pts.length) { box.appendChild(el('div', 'cb-empty', 'Sin meses con ventas en el rango')); return; }
    const svg = d3.select(box).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H);
    const y = d3.scaleLinear([0, (d3.max(pts, (d) => d.share) || 0.01) * 1.15], [H - 28, 12]).nice();
    const ml = Math.ceil(d3.max(y.ticks(5), (t) => measure(svg, fPct1(t)))) + 12;
    const x = d3.scalePoint(pts.map((d) => d.m), [ml + 12, W - 60]);
    svg.append('g').attr('transform', `translate(${ml},0)`).call(d3.axisLeft(y).ticks(5).tickSize(-(W - ml - 8)).tickFormat(fPct1)).call(styleAxis).call((g) => g.select('.domain').remove());
    const step = Math.ceil(pts.length * 48 / (W - ml));
    svg.append('g').attr('transform', `translate(0,${H - 28})`).call(d3.axisBottom(x).tickValues(pts.map((d) => d.m).filter((_, i) => i % step === 0)).tickFormat(mesLbl).tickSizeOuter(0)).call(styleAxis).call((g) => g.select('.domain').remove());
    const gid = 'cbgrad';
    const grad = svg.append('defs').append('linearGradient').attr('id', gid).attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
    [[0, .26], [.25, .16], [.5, .08], [.75, .03], [1, 0]].forEach(([o, a]) => grad.append('stop').attr('offset', o).attr('style', `stop-color:${PAL()[0]};stop-opacity:${a}`));
    svg.append('path').datum(pts).attr('fill', `url(#${gid})`).attr('d', d3.area().x((d) => x(d.m)).y0(y(0)).y1((d) => y(d.share)));
    svg.append('path').datum(pts).attr('fill', 'none').attr('stroke', PAL()[0]).attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('d', d3.line().x((d) => x(d.m)).y((d) => y(d.share)));
    const last = pts[pts.length - 1];
    svg.append('text').attr('x', x(last.m) + 8).attr('y', y(last.share) + 4).attr('fill', PAL()[0]).style('font-size', '12px').text(fPct(last.share));
    const dots = svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (d) => x(d.m)).attr('cy', (d) => y(d.share)).attr('r', 3).attr('fill', PAL()[0]);
    const xs = pts.map((d) => x(d.m));
    svg.append('rect').attr('x', ml).attr('y', 0).attr('width', W - ml).attr('height', H - 28).attr('fill', 'transparent')
      .on('mousemove', (ev) => {
        const [mx] = d3.pointer(ev);
        const i = d3.leastIndex(xs, (a) => Math.abs(a - mx));
        const d = pts[i];
        dots.attr('r', (p) => (p === d ? 5 : 3));
        showTip(ev, mesLbl(d.m), [['Cashback / ventas', fPct(d.share), PAL()[0]], ['Cashback', fUSD2(d.cb)], ['Ventas netas Books', fUSD2(d.ventas)]]);
      })
      .on('mouseleave', () => { dots.attr('r', 3); hideTip(); });
  }

  // ---------- donut ----------
  function drawBrand(box, eqs, modo) {
    clear(box);
    const val = (r) => (modo === 'monto' ? r.Valor : 1);
    const data = d3.rollups(eqs, (v) => ({ v: d3.sum(v, val), n: v.length, monto: d3.sum(v, (r) => r.Valor) }), (r) => r.Marca).map(([k, o]) => ({ k, ...o })).sort((a, b) => b.v - a.v);
    const tot = d3.sum(data, (d) => d.v);
    if (!tot) { box.appendChild(el('div', 'cb-empty', 'Sin equipos en el filtro actual')); return; }
    const S = Math.min(220, Math.max(160, box.clientWidth * 0.45));
    const svg = d3.select(box).append('svg').attr('width', S).attr('height', S).attr('viewBox', `0 0 ${S} ${S}`);
    const g = svg.append('g').attr('transform', `translate(${S / 2},${S / 2})`);
    const arc = d3.arc().innerRadius(S * 0.3).outerRadius(S / 2 - 4).cornerRadius(4).padAngle(0.015);
    g.selectAll('path').data(d3.pie().sort(null).value((d) => d.v)(data)).join('path').attr('d', arc).attr('fill', (d, i) => PAL()[i % 6])
      .on('mousemove', (ev, d) => showTip(ev, d.data.k, [['Participación', fPct1(d.data.v / tot), PAL()[data.indexOf(d.data) % 6]], ['Equipos', fN(d.data.n)], ['Valoración', fUSD2(d.data.monto)]]))
      .on('mouseleave', hideTip);
    g.append('text').attr('text-anchor', 'middle').attr('dy', '-0.2em').attr('fill', 'var(--color-fg)').style('font-family', 'var(--font-anthropic-serif)').style('font-size', '20px').text(modo === 'monto' ? fBig(tot) : fN(tot));
    g.append('text').attr('text-anchor', 'middle').attr('dy', '1.2em').attr('fill', 'var(--color-fg-muted)').style('font-size', '12px').text(modo === 'monto' ? 'valoración' : 'equipos');
    const ul = el('ul', 'cb-legend');
    data.forEach((d, i) => {
      const li = el('li'); const sw = el('i', 'sw'); sw.style.background = PAL()[i % 6];
      const v = el('span', 'v', fPct1(d.v / tot)); v.appendChild(el('small', null, fN(d.n) + ' equipos · ' + fUSD(d.monto)));
      li.append(sw, el('span', null, d.k), v); ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  // ---------- top models ----------
  function drawModels(box, eqs, modo) {
    clear(box);
    const data = d3.rollups(eqs, (v) => ({ n: v.length, monto: d3.sum(v, (r) => r.Valor), marca: d3.mode(v, (r) => r.Marca) }), (r) => r.Familia)
      .map(([k, o]) => ({ k, ...o, v: modo === 'monto' ? o.monto : o.n })).sort((a, b) => b.v - a.v).slice(0, 10);
    if (!data.length) { box.appendChild(el('div', 'cb-empty', 'Sin equipos en el filtro actual')); return; }
    const max = data[0].v;
    const marcas = [...new Set(eqs.map((r) => r.Marca))].sort();
    for (const d of data) {
      const row = el('div', 'cb-hbar');
      const b = el('div', 'b'); const i = el('i');
      i.style.width = (100 * d.v / max) + '%';
      const brandIdx = d3.rollups(eqs, (v) => d3.sum(v, (r) => r.Valor), (r) => r.Marca).sort((a, b) => b[1] - a[1]).map((x) => x[0]).indexOf(d.marca);
      i.style.background = PAL()[Math.max(0, brandIdx) % 6];
      b.appendChild(i);
      row.append(el('span', 'n', d.k), b, el('span', 'v', modo === 'monto' ? fUSD(d.v) : fN(d.v) + ' eq.'));
      row.addEventListener('mousemove', (ev) => showTip(ev, d.k, [['Marca', d.marca], ['Equipos', fN(d.n)], ['Valoración', fUSD2(d.monto)], ['Valoración promedio', fUSD2(d.monto / d.n)]]));
      row.addEventListener('mouseleave', hideTip);
      box.appendChild(row);
    }
    void marcas;
  }

  // ---------- matrix ----------
  function drawMatrix(box, regs, months, grupo, modo) {
    clear(box);
    if (!regs.length) { box.appendChild(el('div', 'cb-empty', 'Sin registros en el filtro actual')); box.style.minHeight = '120px'; return; }
    const key = grupo === 'propietario' ? 'Propietario' : 'Sucursal';
    const groups = d3.rollups(regs, (v) => d3.sum(v, (r) => r.Total), (r) => r[key]).sort((a, b) => b[1] - a[1]).map((d) => d[0]);
    const cell = new Map(d3.rollups(regs, (v) => ({ m: d3.sum(v, (r) => r.Total), n: v.length }), (r) => r[key], (r) => r.Mes).map(([g, arr]) => [g, new Map(arr)]));
    const t = el('table', 'cb-matrix');
    const hr = el('tr');
    hr.appendChild(el('th', null, grupo === 'propietario' ? 'Propietario de venta' : 'Sucursal'));
    months.forEach((m) => hr.appendChild(el('th', 'num', mesLbl(m))));
    ['Total', 'Prom. mensual', 'Ticket prom.', '% del total'].forEach((h) => hr.appendChild(el('th', 'num', h)));
    const thead = el('thead'); thead.appendChild(hr); t.appendChild(thead);
    const tb = el('tbody');
    const totM = d3.sum(regs, (r) => r.Total), totN = regs.length;
    const mk = (m, n, cls) => { const td = el('td', 'num' + (cls ? ' ' + cls : '')); if (!n) { td.classList.add('zero'); td.textContent = '·'; return td; } const a = el('span', 'm', modo === 'monto' ? fUSD(m) : fN(n) + ' trx'); const b = el('span', 'c', modo === 'monto' ? fN(n) + ' trx' : fUSD(m)); td.append(a, b); return td; };
    const addRow = (name, getter, cls) => {
      const tr = el('tr', cls || null);
      tr.appendChild(el('td', null, name));
      let sm = 0, sn = 0;
      months.forEach((m) => { const c = getter(m) || { m: 0, n: 0 }; sm += c.m; sn += c.n; tr.appendChild(mk(c.m, c.n)); });
      tr.appendChild(mk(sm, sn));
      const pm = el('td', 'num'); pm.append(el('span', 'm', modo === 'monto' ? fUSD(sm / months.length) : d3.format(',.1f')(sn / months.length) + ' trx'), el('span', 'c', modo === 'monto' ? d3.format(',.1f')(sn / months.length) + ' trx' : fUSD(sm / months.length)));
      tr.appendChild(pm);
      tr.appendChild(el('td', 'num', sn ? fUSD(sm / sn) : '—'));
      tr.appendChild(el('td', 'num', fPct1(modo === 'monto' ? sm / totM : sn / totN)));
      tb.appendChild(tr);
    };
    groups.forEach((g) => addRow(g, (m) => cell.get(g).get(m)));
    const allM = new Map(d3.rollups(regs, (v) => ({ m: d3.sum(v, (r) => r.Total), n: v.length }), (r) => r.Mes));
    addRow('Total general', (m) => allM.get(m), 'tot');
    t.appendChild(tb);
    box.appendChild(t);
  }

  // ---------- status ----------
  function drawStatus(box, regs, modo) {
    clear(box);
    const t = el('table');
    const hr = el('tr');
    ['Estatus', 'Transacciones', 'Equipos', 'Monto', '% ' + (modo === 'monto' ? 'del monto' : 'de trx')].forEach((h, i) => hr.appendChild(el('th', i ? 'num' : null, h)));
    const th = el('thead'); th.appendChild(hr); t.appendChild(th);
    const tb = el('tbody');
    const tm = d3.sum(regs, (r) => r.Total), tn = regs.length;
    for (const e of ESTADOS) {
      const rs = regs.filter((r) => r.Estado === e);
      if (!rs.length) continue;
      const tr = el('tr');
      const td = el('td'); const dot = el('i', 'cb-dot'); dot.style.background = estColor(e); td.append(dot, document.createTextNode(e));
      const m = d3.sum(rs, (r) => r.Total);
      tr.append(td, el('td', 'num', fN(rs.length)), el('td', 'num', fN(d3.sum(rs, (r) => r.Equipos))), el('td', 'num', fUSD2(m)), el('td', 'num', fPct1(modo === 'monto' ? m / tm : rs.length / tn)));
      tb.appendChild(tr);
    }
    const tr = el('tr', 'tot');
    tr.append(el('td', null, 'Total'), el('td', 'num', fN(tn)), el('td', 'num', fN(d3.sum(regs, (r) => r.Equipos))), el('td', 'num', fUSD2(tm)), el('td', 'num', tn ? '100%' : '—'));
    tr.querySelectorAll('td').forEach((c) => { c.style.fontWeight = 'var(--cds-font-weight-medium)'; });
    tb.appendChild(tr);
    t.appendChild(tb);
    box.appendChild(t);
  }

  function drawStack(box, regs, grupo, modo) {
    clear(box);
    const key = grupo === 'propietario' ? 'Propietario' : 'Sucursal';
    const val = (r) => (modo === 'monto' ? r.Total : 1);
    const groups = d3.rollups(regs, (v) => d3.sum(v, val), (r) => r[key]).sort((a, b) => b[1] - a[1]);
    if (!groups.length) { box.appendChild(el('div', 'cb-empty', 'Sin registros en el filtro actual')); return; }
    for (const [g, tot] of groups) {
      const row = el('div', 'row');
      row.appendChild(el('span', null, g));
      const bar = el('div', 'bar');
      for (const e of ESTADOS) {
        const rs = regs.filter((r) => r[key] === g && r.Estado === e);
        const v = d3.sum(rs, val);
        if (!v) continue;
        const i = el('i'); i.style.width = (100 * v / tot) + '%'; i.style.background = estColor(e);
        i.addEventListener('mousemove', (ev) => showTip(ev, g, [[e, fPct1(v / tot), estColor(e)], ['Transacciones', fN(rs.length)], ['Monto', fUSD2(d3.sum(rs, (r) => r.Total))]]));
        i.addEventListener('mouseleave', hideTip);
        bar.appendChild(i);
      }
      row.appendChild(bar);
      box.appendChild(row);
    }
    const leg = el('div'); leg.style.display = 'flex'; leg.style.flexWrap = 'wrap'; leg.style.gap = '12px'; leg.style.fontSize = 'var(--cds-font-size-caption)'; leg.style.color = 'var(--color-fg-muted)';
    ESTADOS.forEach((e) => { const s = el('span'); const d = el('i', 'cb-dot'); d.style.background = estColor(e); s.append(d, document.createTextNode(e)); leg.appendChild(s); });
    box.appendChild(leg);
  }

  // ---------- inventory ----------
  function drawInventory(regs, eqs, p) {
    const tbody = $('.c-inv tbody');
    clear(tbody);
    let rows = regs;
    if (p.modelo) { const nums = new Set(eqs.filter((e) => e.Familia === p.modelo).map((e) => e.Numero)); rows = rows.filter((r) => nums.has(r.Numero)); }
    if (p.alerta) rows = rows.filter((r) => r.Alerta);
    const q = (p.q || '').trim().toLowerCase();
    if (q) rows = rows.filter((r) => [r.Numero, r.Cliente, r.Modelo, r.IMEI, r.Factura, r.Propietario].join(' ').toLowerCase().includes(q));
    const rank = (r) => (r.Alerta === 'En tránsito' ? 2 : r.Alerta ? 1 : 0);
    const k = sort.k, dir = sort.dir;
    rows = rows.slice().sort((a, b) => {
      let c = k === 'Alerta' ? rank(a) - rank(b) : k === 'Total' ? a.Total - b.Total : String(a[k]).localeCompare(String(b[k]), 'es', { numeric: true });
      if (c === 0) c = String(a.Fecha).localeCompare(String(b.Fecha)) * (k === 'Alerta' ? 1 : 0) || String(b.Numero).localeCompare(String(a.Numero), 'es', { numeric: true });
      return c * dir;
    });
    $('.c-inv thead').querySelectorAll('th').forEach((th) => { const b = th.querySelector('button'); th.setAttribute('aria-sort', b && b.dataset.k === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'); });
    const nT = rows.filter((r) => r.Alerta === 'En tránsito').length, nP = rows.filter((r) => r.Alerta === 'Pendiente liquidación').length;
    $('.cb-inv-sum').textContent = fN(rows.length) + ' registros · ' + fN(d3.sum(rows, (r) => r.Equipos)) + ' equipos · ' + fUSD2(d3.sum(rows, (r) => r.Total)) + ' · ' + nT + ' en tránsito · ' + nP + ' pendientes de liquidación';
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const tr = el('tr', r.Alerta === 'En tránsito' ? 'alert-t' : r.Alerta ? 'alert-p' : null);
      tr.dataset.key = r.Numero;
      const a = el('td');
      a.appendChild(el('span', 'cb-badge ' + (r.Alerta === 'En tránsito' ? 'transito' : r.Alerta ? 'pend' : r.Estado.startsWith('Sin') ? 'hist' : 'ok'), r.Alerta || (r.Estado.startsWith('Sin') ? 'Histórico' : 'Liquidado')));
      tr.appendChild(a);
      tr.appendChild(el('td', null, r.Numero));
      tr.appendChild(el('td', null, r.Fecha));
      tr.appendChild(el('td', 'wrap', r.Cliente));
      tr.appendChild(el('td', 'wrap', r.Modelo));
      tr.appendChild(el('td', null, r.IMEI));
      tr.appendChild(el('td', null, r.Factura));
      tr.appendChild(el('td', null, r.Sucursal));
      const st = el('td'); const d = el('i', 'cb-dot'); d.style.background = estColor(r.Estado); st.append(d, document.createTextNode(r.Estado)); tr.appendChild(st);
      tr.appendChild(el('td', 'num', fUSD2(r.Total)));
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }

  // ---------- main draw ----------
  function draw() {
    const p = P();
    const R = dash.data('registros'), E = dash.data('equipos'), V = dash.data('ventas');
    const ok = R.status === 'ok';
    const regsAll = ok ? R.data : [];
    const eqsAll = E.status === 'ok' ? E.data : [];
    // controls
    if (fStart !== document.activeElement) fStart.value = p.start || '';
    if (fEnd !== document.activeElement) fEnd.value = p.end || '';
    fillSelect(fSuc, 'Todas las sucursales', [...new Set(regsAll.map((r) => r.Sucursal))].sort(), p.sucursal);
    fillSelect(fEst, 'Todos los estatus', ESTADOS.filter((e) => regsAll.some((r) => r.Estado === e)), p.estado);
    root.querySelectorAll('.f-modo button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === p.modo)));
    root.querySelectorAll('.f-grupo button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === p.grupo)));
    if (iQ !== document.activeElement) iQ.value = p.q || '';
    iAlert.checked = !!p.alerta;

    const boxes = ['.c-share', '.c-trend', '.c-brand', '.c-models', '.c-matrix', '.c-status', '.c-stack'].map($);
    if (!ok) {
      boxes.forEach((b) => failBox(b, R.status));
      clear($('.c-inv tbody'));
      ['.k-monto', '.k-trx', '.k-eq', '.k-share', '.k-pend'].forEach((s) => { $(s).textContent = '—'; });
      $('.cb-takeaway').textContent = '—';
      return;
    }
    const regs = regsAll.filter((r) => passes(r, p));
    const eqs = eqsAll.filter((r) => passes(r, p));
    const famList = d3.rollups(eqsAll.filter((r) => inRange(r, p)), (v) => v.length, (r) => r.Familia).sort((a, b) => b[1] - a[1]).map((d) => d[0]);
    fillSelect(iMod, 'Todos los modelos', famList, p.modelo);

    const mAll = regsAll.map((r) => r.Mes).filter(Boolean).sort();
    const m0 = p.start ? p.start.slice(0, 7) : mAll[0];
    const m1 = p.end ? p.end.slice(0, 7) : mAll[mAll.length - 1];
    const months = m0 && m1 && m0 <= m1 ? monthsBetween(m0, m1) : [];
    $('.per').textContent = months.length ? mesLbl(months[0]) + ' – ' + mesLbl(months[months.length - 1]) + (p.sucursal ? ' · ' + p.sucursal : '') + (p.estado ? ' · ' + p.estado : '') : '';
    const byMonth = d3.group(regs, (r) => r.Mes);

    // KPIs
    const tot = d3.sum(regs, (r) => r.Total), n = regs.length, neq = d3.sum(regs, (r) => r.Equipos);
    const lastM = months[months.length - 1], prevM = months[months.length - 2];
    const lm = byMonth.get(lastM) || [], pm = byMonth.get(prevM) || [];
    const delta = (a, b) => (b ? (a >= b ? '+' : '') + d3.format('.0%')((a - b) / b) + ' vs ' + mesLbl(prevM) : '');
    $('.k-monto').textContent = fUSD2(tot);
    $('.k-monto-s').textContent = lastM ? mesLbl(lastM) + ': ' + fUSD(d3.sum(lm, (r) => r.Total)) + (prevM ? ' · ' + delta(d3.sum(lm, (r) => r.Total), d3.sum(pm, (r) => r.Total)) : '') : '';
    $('.k-trx').textContent = fN(n);
    $('.k-trx-s').textContent = 'Ticket promedio ' + (n ? fUSD2(tot / n) : '—') + (lastM ? ' · ' + mesLbl(lastM) + ': ' + fN(lm.length) : '');
    $('.k-eq').textContent = fN(neq);
    $('.k-eq-s').textContent = 'Valoración promedio por equipo ' + (neq ? fUSD2(tot / neq) : '—');
    const pend = regs.filter((r) => r.Alerta);
    $('.k-pend').textContent = fN(pend.length);
    $('.k-pend-s').textContent = fUSD2(d3.sum(pend, (r) => r.Total)) + ' · ' + pend.filter((r) => r.Alerta === 'En tránsito').length + ' en tránsito';

    // share
    const shareBox = $('.c-share');
    let shareTxt = '';
    if (V.status === 'ok') {
      const ventas = new Map(V.data.map((r) => [r.Mes, r.Ventas_netas]));
      const pts = months.filter((m) => ventas.get(m) > 0).map((m) => { const cb = d3.sum(byMonth.get(m) || [], (r) => r.Total); return { m, cb, ventas: ventas.get(m), share: cb / ventas.get(m) }; });
      const sv = d3.sum(pts, (d) => d.ventas), sc = d3.sum(pts, (d) => d.cb);
      $('.k-share').textContent = sv ? fPct(sc / sv) : '—';
      $('.k-share-s').textContent = sv ? fUSD(sc) + ' de ' + fBig(sv) + ' facturado' + (p.sucursal ? ' (ventas de todas las sucursales)' : '') : '—';
      shareTxt = sv ? ', equivalente al ' + fPct(sc / sv) + ' de las ventas netas facturadas en Zoho Books' : '';
      drawShare(shareBox, pts);
    } else {
      $('.k-share').textContent = '—';
      $('.k-share-s').textContent = V.status === 'loading' ? 'Cargando ventas de Zoho Books…' : '—';
      failBox(shareBox, V.status);
    }

    $('.cb-takeaway').textContent = n
      ? 'El programa acumula ' + fUSD2(tot) + ' en ' + fN(n) + ' transacciones (' + fN(neq) + ' equipos)' + shareTxt + '. ' + (pend.length ? pend.length + ' registros por ' + fUSD(d3.sum(pend, (r) => r.Total)) + ' siguen pendientes de liquidación o en tránsito.' : 'No hay registros pendientes de liquidación.')
      : 'No hay registros con los filtros actuales.';

    $('.n-trend').textContent = (p.modo === 'monto' ? 'Monto de valoración $' : 'Transacciones') + ' por mes; la línea punteada es el promedio móvil de 3 meses.';
    $('.n-brand').textContent = (p.modo === 'monto' ? 'Valoración $' : 'Equipos') + ' por marca registrada en cada equipo.';
    $('.n-models').textContent = 'Familias de modelo por ' + (p.modo === 'monto' ? 'valoración $' : 'cantidad de equipos') + '; el color indica la marca.';
    $('.n-stack').textContent = 'Composición por estatus de cada ' + (p.grupo === 'propietario' ? 'propietario de venta' : 'sucursal') + ', en ' + (p.modo === 'monto' ? 'monto $' : 'transacciones') + '.';

    drawTrend($('.c-trend'), months, byMonth, p.modo);
    if (E.status === 'ok') { drawBrand($('.c-brand'), eqs, p.modo); drawModels($('.c-models'), eqs, p.modo); }
    else { failBox($('.c-brand'), E.status); failBox($('.c-models'), E.status); }
    drawMatrix($('.c-matrix'), regs, months, p.grupo, p.modo);
    drawStatus($('.c-status'), regs, p.modo);
    drawStack($('.c-stack'), regs, p.grupo, p.modo);
    drawInventory(regs, eqsAll, p);
  }

  dash.onData(draw);
  const named = document.getElementById(location.hash.slice(1));
  if (named) setTimeout(() => named.scrollIntoView(), 300);
  const io = new IntersectionObserver((ents) => { ents.forEach((e) => { if (e.isIntersecting) dash.setLink(e.target.id); }); }, { root: document, rootMargin: '-40% 0px -55% 0px' });
  ['registro', 'operativo', 'inventario', 'existencias'].forEach((id) => io.observe(document.getElementById(id)));
})();
