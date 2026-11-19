dash.calc('existencias_vinculadas', {
  inputs: ['existencias_imei', 'cashback', 'registros'],
  title: 'Existencias vinculadas por IMEI',
  description: 'Cada equipo usado disponible del reporte de números de serie se busca por IMEI en el módulo Cash Back: coincidencia exacta, o con hasta 2 dígitos de diferencia (errores de captura). Recepción = fecha del cashback; días en existencia = hoy − recepción; días sin movimiento = hoy − fecha del último movimiento en Zoho.',
  fn: (existencias_imei, cashback, registros) => {
    const N = (v) => String(v || '').replace(/\W/g, '').toUpperCase();
    const lev = (a, b) => { let p = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { const c = [i]; for (let j = 1; j <= b.length; j++) c.push(Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0))); p = c; } return p[b.length]; };
    const byNum = new Map(registros.map((r) => [r.Numero, r]));
    const dev = [];
    for (const r of cashback) {
      const g = byNum.get(r.Numero_de_Cash_Back); if (!g) continue;
      let n = 0;
      for (const k of ['', '_2', '_3']) {
        if (!r['Modelo' + k] && !r['IMEI' + k]) continue; n++;
        const im = N(r['IMEI' + k]); if (!im) continue;
        dev.push({ IMEI: im, Equipo: g.Numero + (n > 1 ? '-' + n : ''), Modelo_CRM: r['Modelo' + k] || '', Fecha: g.Fecha, Propietario: g.Propietario, Sucursal: g.Sucursal, Cliente: g.Cliente, Valor: Number(r['Valoraci_n' + k]) || 0 });
      }
    }
    const exact = new Map(dev.map((d) => [d.IMEI, d]));
    const t = new Date(); const hoy = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
    const dias = (f) => { const [y, m, d] = String(f || '').slice(0, 10).split('-').map(Number); return y ? Math.round((hoy - Date.UTC(y, m - 1, d)) / 86400000) : null; };
    const title = (s) => String(s || '').toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());
    return existencias_imei.map((s) => {
      const im = N(s.IMEI);
      let d = exact.get(im), vin = d ? 'IMEI exacto' : '';
      if (!d && im.length >= 10) {
        let best = null, bd = 9;
        for (const x of dev) { if (Math.abs(x.IMEI.length - im.length) > 2) continue; const v = lev(im, x.IMEI); if (v < bd) { bd = v; best = x; } }
        if (best && bd <= 2) { d = best; vin = 'IMEI con error de captura'; }
      }
      const art = String(s.Articulo || '');
      const marca = /IPHONE|IPAD|APPLE|AIRPOD|MAC/i.test(art) ? 'Apple' : /SAMSUNG|GALAXY/i.test(art) ? 'Samsung' : 'Otra';
      const bill = /proveedor/i.test(s.Ultimo_movimiento || '');
      const prop = d ? d.Propietario : (bill && s.Contacto ? title(s.Contacto) : '');
      const fRec = d ? d.Fecha : (bill ? s.Fecha_ultimo_movimiento : '');
      return {
        IMEI: s.IMEI, Marca: marca, Articulo: art, SKU: s.SKU, Bodega: s.Bodega, Costo: Number(s.Costo) || 0,
        Propietario: prop, Fecha_Recepcion: fRec, Dias_Existencia: dias(fRec),
        Ultimo_Movimiento: s.Ultimo_movimiento, Documento: s.Documento, Fecha_Ultimo_Mov: s.Fecha_ultimo_movimiento, Dias_Sin_Movimiento: dias(s.Fecha_ultimo_movimiento),
        N_Cashback: d ? d.Equipo : '', IMEI_CRM: d ? d.IMEI : '', Sucursal_Registro: d ? d.Sucursal : '', Valoracion: d ? d.Valor : null,
        Vinculo: vin || (prop ? 'Sin cashback (factura de recepción)' : 'Sin registro de cashback'),
      };
    });
  },
});

(function () {
  const root = document.getElementById('existencias');
  const q = (s) => root.querySelector(s);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const fN = d3.format(','), usd = (v) => '$' + d3.format(',.0f')(v), pct = d3.format('.0%');
  const fd = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); return d + '/' + m + '/' + y; };
  const VB = { 'IMEI exacto': 'ok', 'IMEI con error de captura': 'transito', 'Sin cashback (factura de recepción)': 'hist', 'Sin registro de cashback': 'pend' };
  const VORD = Object.keys(VB);
  let sort = { k: 'Dias_Existencia', dir: -1 }, qT;
  const iq = q('.x-q'), so = q('.x-ownsel'), sb = q('.x-bodsel'), sv = q('.x-vinsel');
  iq.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => dash.setParams({ xq: iq.value }), 250); });
  so.addEventListener('change', () => dash.setParams({ xown: so.value }));
  sb.addEventListener('change', () => dash.setParams({ xbod: sb.value }));
  sv.addEventListener('change', () => dash.setParams({ xvin: sv.value }));
  q('.x-own').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-key]'); if (!tr) return; const cur = dash.params().xown || ''; dash.setParams({ xown: cur === tr.dataset.key ? '' : tr.dataset.key }); });
  const NUM = ['Dias_Existencia', 'Dias_Sin_Movimiento', 'Costo'];
  q('.x-tab thead').addEventListener('click', (e) => { const b = e.target.closest('button[data-k]'); if (!b) return; sort = sort.k === b.dataset.k ? { k: sort.k, dir: -sort.dir } : { k: b.dataset.k, dir: NUM.includes(b.dataset.k) || /Fecha/.test(b.dataset.k) ? -1 : 1 }; draw(); });
  const fill = (sel, first, opts, val) => { const nx = [''].concat(opts).join('|'); if ([...sel.options].map((o) => o.value).join('|') !== nx) sel.replaceChildren(new Option(first, ''), ...opts.map((o) => new Option(o, o))); sel.value = opts.includes(val) ? val : ''; };
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); };
  function draw() {
    const p = Object.assign({ xq: '', xown: '', xbod: '', xvin: '' }, dash.params());
    const D = dash.data('existencias_vinculadas');
    const tbody = q('.x-tab tbody'), ownBox = q('.x-own');
    clear(tbody); clear(ownBox);
    if (iq !== document.activeElement) iq.value = p.xq || '';
    if (D.status !== 'ok') {
      ['.x-tot', '.x-vin', '.x-sin', '.x-avg', '.x-60'].forEach((s) => { q(s).textContent = '—'; });
      if (D.status === 'error' || D.status === 'connect') ownBox.appendChild(el('div', 'cb-fail', 'Failed to load'));
      return;
    }
    const all = D.data, vin = all.filter((r) => r.N_Cashback), withOwn = all.filter((r) => r.Propietario);
    q('.x-tot').textContent = fN(all.length);
    q('.x-tot-s').textContent = usd(d3.sum(all, (r) => r.Costo)) + ' al costo · ' + new Set(all.map((r) => r.Bodega)).size + ' bodegas';
    q('.x-vin').textContent = fN(vin.length);
    q('.x-vin-s').textContent = (all.length ? pct(vin.length / all.length) : '—') + ' del total · ' + vin.filter((r) => r.Vinculo !== 'IMEI exacto').length + ' con IMEI mal capturado en CRM';
    q('.x-sin').textContent = fN(all.length - vin.length);
    q('.x-sin-s').textContent = 'IMEI no encontrado en el módulo Cash Back';
    const ages = withOwn.filter((r) => r.Dias_Existencia != null);
    const avg = d3.mean(ages, (r) => r.Dias_Existencia);
    q('.x-avg').textContent = avg == null ? '—' : d3.format(',.0f')(avg) + ' días';
    q('.x-avg-s').textContent = 'Desde la recepción · sin movimiento: ' + d3.format(',.0f')(d3.mean(all, (r) => r.Dias_Sin_Movimiento) || 0) + ' días';
    const o60 = ages.filter((r) => r.Dias_Existencia > 60);
    q('.x-60').textContent = fN(o60.length);
    q('.x-60-s').textContent = ages.filter((r) => r.Dias_Existencia > 90).length + ' con más de 90 días · ' + usd(d3.sum(o60, (r) => r.Costo));

    const owners = d3.rollups(withOwn, (v) => ({ n: v.length, c: d3.sum(v, (r) => r.Costo), avg: d3.mean(v, (r) => r.Dias_Existencia), max: d3.max(v, (r) => r.Dias_Existencia), o60: v.filter((r) => r.Dias_Existencia > 60).length }), (r) => r.Propietario).sort((a, b) => b[1].n - a[1].n);
    const maxN = d3.max(owners, (d) => d[1].n) || 1;
    const t = el('table'); const hr = el('tr');
    ['Ejecutivo', 'Equipos', 'Costo en inventario', 'Días promedio', 'Más antiguo', '> 60 días'].forEach((h, i) => hr.appendChild(el('th', i ? 'num' : null, h)));
    const th = el('thead'); th.appendChild(hr); t.appendChild(th);
    const tb = el('tbody');
    for (const [name, o] of owners) {
      const tr = el('tr', p.xown === name ? 'sel' : null); tr.dataset.key = name;
      const n = el('td', 'num'); const bar = el('i', 'x-bar'); bar.style.width = Math.max(4, 60 * o.n / maxN) + 'px'; n.append(bar, document.createTextNode(fN(o.n)));
      const o6 = el('td', 'num', fN(o.o60)); if (o.o60) { o6.style.color = 'var(--color-bad)'; o6.style.fontWeight = 'var(--cds-font-weight-medium)'; }
      tr.append(el('td', null, name), n, el('td', 'num', usd(o.c)), el('td', 'num', o.avg == null ? '—' : d3.format(',.0f')(o.avg)), el('td', 'num', o.max == null ? '—' : fN(o.max) + ' d'), o6);
      tb.appendChild(tr);
    }
    const tt = el('tr');
    tt.append(el('td', null, 'Total'), el('td', 'num', fN(withOwn.length)), el('td', 'num', usd(d3.sum(withOwn, (r) => r.Costo))), el('td', 'num', avg == null ? '—' : d3.format(',.0f')(avg)), el('td', 'num', ages.length ? fN(d3.max(ages, (r) => r.Dias_Existencia)) + ' d' : '—'), el('td', 'num', fN(o60.length)));
    tt.querySelectorAll('td').forEach((c) => { c.style.fontWeight = 'var(--cds-font-weight-medium)'; c.style.borderTop = '2px solid var(--cb-red)'; });
    tb.appendChild(tt); t.appendChild(tb); ownBox.appendChild(t);

    fill(so, 'Todos los ejecutivos', [...new Set(withOwn.map((r) => r.Propietario))].sort((a, b) => a.localeCompare(b, 'es')), p.xown);
    fill(sb, 'Todas las bodegas', [...new Set(all.map((r) => r.Bodega))].sort(), p.xbod);
    fill(sv, 'Todos los vínculos', VORD.filter((v) => all.some((r) => r.Vinculo === v)), p.xvin);
    let rows = all;
    if (p.xown) rows = rows.filter((r) => r.Propietario === p.xown);
    if (p.xbod) rows = rows.filter((r) => r.Bodega === p.xbod);
    if (p.xvin) rows = rows.filter((r) => r.Vinculo === p.xvin);
    const s = (p.xq || '').trim().toLowerCase();
    if (s) rows = rows.filter((r) => [r.Articulo, r.IMEI, r.N_Cashback, r.SKU, r.Propietario, r.Documento].join(' ').toLowerCase().includes(s));
    const k = sort.k, dir = sort.dir;
    rows = rows.slice().sort((a, b) => { const c = NUM.includes(k) ? (a[k] ?? -1) - (b[k] ?? -1) : String(a[k] || '').localeCompare(String(b[k] || ''), 'es', { numeric: true }); return (c || String(a.IMEI).localeCompare(String(b.IMEI))) * dir; });
    q('.x-tab thead').querySelectorAll('th').forEach((h) => { const b = h.querySelector('button'); h.setAttribute('aria-sort', b && b.dataset.k === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'); });
    q('.x-sum').textContent = fN(rows.length) + ' equipos · ' + usd(d3.sum(rows, (r) => r.Costo)) + ' al costo';
    const frag = document.createDocumentFragment();
    for (const r of rows) {
      const a = r.Dias_Existencia;
      const tr = el('tr', a > 90 ? 'x-a3' : a > 60 ? 'x-a2' : a > 30 ? 'x-a1' : null); tr.dataset.key = r.IMEI;
      const vb = el('td'); vb.appendChild(el('span', 'cb-badge ' + (VB[r.Vinculo] || 'hist'), r.Vinculo));
      if (r.Vinculo === 'IMEI con error de captura') vb.title = 'IMEI en CRM: ' + r.IMEI_CRM;
      const um = el('td'); um.appendChild(document.createTextNode(fd(r.Fecha_Ultimo_Mov))); um.appendChild(el('div', null, (r.Ultimo_Movimiento || '') + ' ' + (r.Documento || ''))); um.lastChild.style.cssText = 'color:var(--color-fg-muted);font-size:11px';
      tr.append(el('td', null, r.Marca), el('td', 'wrap', r.Articulo), el('td', null, r.IMEI), el('td', null, r.Propietario || '—'), el('td', null, fd(r.Fecha_Recepcion) || '—'), el('td', 'num', a == null ? '—' : fN(a)), el('td', null, r.Bodega), um, el('td', 'num', r.Dias_Sin_Movimiento == null ? '—' : fN(r.Dias_Sin_Movimiento)), el('td', null, r.N_Cashback || '—'), vb, el('td', 'num', usd(r.Costo)));
      frag.appendChild(tr);
    }
    tbody.appendChild(frag);
  }
  dash.onData(draw);
})();

// Botones del encabezado. En la copia web «Actualizar» vuelve a leer la última copia de Zoho
// y «Exportar a HTML» descarga la vista actual.
(function () {
  const root = document.getElementById('cb');
  const bR = root.querySelector('.cb-refresh'), bE = root.querySelector('.cb-export'), msg = root.querySelector('.cb-act-msg');
  const LIVE = ['cashback', 'ventas'];
  let refreshing = false;
  const hhmm = (d) => d.toLocaleString('es-NI', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  bR.addEventListener('click', () => {
    if (refreshing) return;
    refreshing = true; bR.disabled = true; bR.classList.add('spin');
    msg.textContent = 'Actualizando Cash Back (CRM) y ventas (Books)…';
    LIVE.forEach((id) => { try { dash.refresh(id); } catch (e) {} });
  });
  dash.onData(() => {
    if (!refreshing) return;
    const st = LIVE.map((id) => dash.data(id));
    if (st.some((s) => s.refreshing || s.status === 'loading')) return;
    refreshing = false; bR.disabled = false; bR.classList.remove('spin');
    const bad = st.filter((s) => s.status !== 'ok');
    msg.textContent = bad.length ? 'No se pudo actualizar una de las fuentes.' : 'Datos de la última lectura de Zoho · existencias según el último reporte cargado';
  });
  bE.addEventListener('click', async () => {
    bE.disabled = true; msg.textContent = 'Preparando el archivo HTML…';
    try {
      const now = new Date();
      const clone = root.cloneNode(true);
      clone.querySelectorAll('.cb-actions, .cb-tip').forEach((n) => n.remove());
      const styles = [...document.querySelectorAll('style, link[rel=stylesheet]')].map((s) => s.outerHTML).join('\n');
      const html = '<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Dashboard Cashback / Trade-in · Solís Comercial</title>\n'
        + styles + '\n</head>\n<body>\n<div id="dash-root">\n<div style="max-width:1400px;margin:0 auto 12px;font-size:12px;color:#6b6a66;text-align:right">Corte de datos: ' + hhmm(now) + ' · vista estática</div>\n' + clone.outerHTML + '\n</div>\n</body>\n</html>\n';
      const downloads = await window.solis.use('downloads');
      const ymd = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      await downloads.save({ filename: 'Dashboard_Cashback_Solis_' + ymd + '.html', data: html });
      msg.textContent = 'Archivo HTML generado (' + hhmm(now) + ').';
    } catch (e) {
      msg.textContent = 'No se pudo exportar: ' + ((e && e.message) || e);
    } finally { bE.disabled = false; }
  });
})();
