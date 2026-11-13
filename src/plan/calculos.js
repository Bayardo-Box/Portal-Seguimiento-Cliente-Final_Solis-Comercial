// ---- Ventas diarias en vivo: una consulta de Zoho Books por día de noviembre
window.SV_DIAS = Array.from({ length: 30 }, (_, i) => 'z_11' + String(i + 1).padStart(2, '0'));
for (const id of window.SV_DIAS) {
  dash.loader(id, {
    description: 'Facturas del día de Zoho Books como filas: número, fecha, hora de creación, vendedor, sucursal, estado y total.',
    fn: async ({ answer, call, args }) => {
      const parse = (a) => {
        if (typeof a === 'string') a = JSON.parse(a);
        if (Array.isArray(a) && a[0] && typeof a[0].text === 'string') a = JSON.parse(a[0].text);
        if (a && Array.isArray(a.content) && a.content[0] && typeof a.content[0].text === 'string') a = JSON.parse(a.content[0].text);
        const d = a && a.data ? a.data : a;
        if (!d || (d.code !== undefined && d.code !== 0)) throw new Error((d && d.message) || 'Zoho Books no devolvió facturas');
        return d;
      };
      let d = parse(answer);
      const inv = [...(d.invoices || [])];
      let page = 1, cut = false;
      while (d.page_context && d.page_context.has_more_page) {
        if (page >= 4) { cut = true; break; }
        page += 1;
        d = parse(await call('list_invoices', { query_params: { ...args.query_params, page } }));
        inv.push(...(d.invoices || []));
      }
      const columns = ['factura', 'fecha', 'creada', 'vendedor', 'sucursal_zoho', 'estado', 'total'];
      const rows = inv.map((i) => ({ factura: i.invoice_number, fecha: i.date, creada: i.created_time, vendedor: i.salesperson_name, sucursal_zoho: i.location_name, estado: i.status, total: Number(i.total) }));
      return { columns, rows, cut };
    },
  });
}

dash.calc('ventas_nov', {
  inputs: window.SV_DIAS,
  title: 'Ventas de noviembre por ejecutivo',
  description: 'Facturas de noviembre sin anuladas ni borradores, acreditadas a cada ejecutivo del plan por su nombre de vendedor en Zoho Books.',
  fn: (...dias_de_noviembre) => {
    const EJ = { 'Ana Molina Zelaya': 'Ana Molina', 'David Steven Betancourt': 'David Betancourt', 'Deyling Jorlenne Villanueva Aburto': 'Deyling Villanueva', 'Jassuara Huembes': 'Jassuara Huembes', 'Nahum estrada Herrera': 'Nahum Estrada', 'Brandon Hernández': 'Brandon Hernández', 'ATENCION AL CLIENTE': 'Atención al Cliente', 'Michelle Paladino': 'Michelle Paladino', 'Angie Cristina Aguirre Perez': 'Angie Aguirre' };
    return dias_de_noviembre.flat()
      .filter((f) => f.estado !== 'void' && f.estado !== 'draft' && EJ[f.vendedor])
      .map((f) => ({ factura: f.factura, fecha: f.fecha, hora: String(f.creada || '').slice(0, 10) === f.fecha ? String(f.creada).slice(11, 16) : '23:59', ejecutivo: EJ[f.vendedor], total: Number(f.total) }));
  },
});

dash.calc('desempeno', {
  inputs: ['ventas_nov', 'plan_diario', 'plan_ejecutivos'],
  title: 'Desempeño diario vs. plan',
  description: 'Por día hábil y ejecutivo: cuota, venta, % logrado, hora de cuota, semáforos, condición de quincena (35%), incentivo, acumulados, proyección y brechas, con subtotales por sucursal y total.',
  fn: (ventas_nov, plan_diario, plan_ejecutivos) => {
    const r2 = (x) => Math.round(x * 100) / 100;
    const div = (a, b) => (b ? a / b : null);
    const luz = (p) => (p == null ? '' : p >= 1 ? 'Verde' : p >= 0.7 ? 'Amarillo' : 'Rojo');
    const luzMes = (p) => (p == null ? '' : p >= 1 ? 'Verde' : p >= 0.9 ? 'Amarillo' : 'Rojo');
    const MINIMO = 0.35, CORTE_Q = '2026-11-15';
    const SUC = ['Los Robles', 'Ari Store', 'El Mayoreo'];
    const execs = [...plan_ejecutivos].sort((a, b) => a.orden - b.orden);
    const fechas = [...new Set(plan_diario.map((r) => r.fecha))].sort();
    const ventaHasta = (ej, f) => ventas_nov.filter((v) => v.ejecutivo === ej && v.fecha <= f).reduce((s, v) => s + v.total, 0);
    const racha = {};
    const out = [];
    for (const fecha of fechas) {
      const info = plan_diario.find((r) => r.fecha === fecha);
      const filas = execs.map((e) => {
        const plan_dia = plan_diario.find((r) => r.fecha === fecha && r.ejecutivo === e.ejecutivo).plan_dia;
        const hoy = ventas_nov.filter((v) => v.ejecutivo === e.ejecutivo && v.fecha === fecha).sort((a, b) => (a.hora < b.hora ? -1 : 1));
        let venta_dia = 0, hora = '';
        for (const v of hoy) { venta_dia += v.total; if (!hora && venta_dia >= plan_dia) hora = v.hora; }
        const cumple = venta_dia >= plan_dia;
        if (info.dia === 'Lunes' || !racha[e.ejecutivo]) racha[e.ejecutivo] = { cur: 0, best: 0, cnt: 0 };
        const rc = racha[e.ejecutivo];
        if (info.dia !== 'Sábado') { rc.cur = cumple ? rc.cur + 1 : 0; rc.best = Math.max(rc.best, rc.cur); if (cumple) rc.cnt += 1; }
        const plan_acum = plan_diario.filter((r) => r.ejecutivo === e.ejecutivo && r.fecha <= fecha).reduce((s, r) => s + r.plan_dia, 0);
        const venta_acum = ventaHasta(e.ejecutivo, fecha);
        // Condición de quincena: 35% del plan mensual al corte del 15
        const logro_q = div(fecha <= CORTE_Q ? venta_acum : ventaHasta(e.ejecutivo, CORTE_Q), e.plan_mensual);
        const condicion = logro_q >= MINIMO ? 'Habilitado' : fecha <= CORTE_Q ? 'Pendiente' : 'Bloqueado';
        let semaforo = luz(div(venta_dia, plan_dia)), beneficio = '';
        // Senior: 4 días con cuota cumplida de lunes a viernes (no necesariamente seguidos). Junior y AC: 4 días consecutivos.
        const ganoSabado = e.division === 'Senior' ? rc.cnt >= 4 : rc.best >= 4;
        const sabado = info.dia === 'Sábado' && ganoSabado;
        if (e.division === 'Senior') {
          if (sabado) beneficio = 'Sábado libre';
          else if (cumple) beneficio = ganoSabado ? 'Puede retirarse · sábado libre ganado' : 'Puede retirarse';
        } else if (sabado) beneficio = 'Salida sábado 3:00 PM';
        else if (cumple && hora && hora < '16:00') beneficio = rc.best >= 4 ? 'Salida 4:00 PM · sábado 3:00 PM ganado' : 'Salida 4:00 PM';
        else if (cumple) beneficio = 'Cumplió después de 4 PM';
        let incentivo;
        if (!beneficio) incentivo = 'Sin beneficio hoy';
        else if (beneficio === 'Cumplió después de 4 PM') incentivo = beneficio;
        else if (condicion === 'Bloqueado') incentivo = 'No aplica · quincena < 35%';
        else if (condicion === 'Pendiente') incentivo = beneficio + ' (condicionado)';
        else incentivo = beneficio;
        if (sabado && e.division === 'Senior' && condicion !== 'Bloqueado') semaforo = 'Libre';
        return { fecha, dia: info.dia, semana: info.semana, tipo: 'ejecutivo', ejecutivo: e.ejecutivo, sucursal: e.sucursal, division: e.division,
          plan_mensual: e.plan_mensual, plan_dia: r2(plan_dia), venta_dia: r2(venta_dia), pct_dia: div(venta_dia, plan_dia), hora_meta: cumple ? hora || '—' : '',
          plan_acum: r2(plan_acum), venta_acum: r2(venta_acum), pct_logro: div(venta_acum, e.plan_mensual), pct_ritmo: div(venta_acum, plan_acum),
          proyeccion: plan_acum ? r2(venta_acum / plan_acum * e.plan_mensual) : null, semaforo_mes: luzMes(div(venta_acum, plan_acum)),
          brecha: r2(Math.max(0, e.plan_mensual - venta_acum)), brecha_dia: r2(Math.max(0, plan_dia - venta_dia)), semaforo,
          cumple: cumple || semaforo === 'Libre', racha: rc.cur, racha_semana: rc.best, dias_cumplidos_semana: rc.cnt, logro_quincena: logro_q, condicion, incentivo };
      });
      const resumen = (nombre, sucursal, grupo, tipo) => {
        const s = (k) => grupo.reduce((t, f) => t + f[k], 0);
        const n = grupo.filter((f) => f.cumple).length;
        const pm = s('plan_mensual'), pd = s('plan_dia'), vd = s('venta_dia'), pa = s('plan_acum'), va = s('venta_acum');
        return { fecha, dia: info.dia, semana: info.semana, tipo, ejecutivo: nombre, sucursal, division: '', plan_mensual: pm, plan_dia: r2(pd), venta_dia: r2(vd),
          pct_dia: div(vd, pd), hora_meta: '', plan_acum: r2(pa), venta_acum: r2(va), pct_logro: div(va, pm), pct_ritmo: div(va, pa),
          proyeccion: pa ? r2(va / pa * pm) : null, semaforo_mes: luzMes(div(va, pa)), brecha: r2(Math.max(0, pm - va)),
          brecha_dia: r2(grupo.reduce((t, f) => t + f.brecha_dia, 0)), semaforo: luz(div(vd, pd)), cumple: vd >= pd, racha: null, racha_semana: null,
          logro_quincena: null, condicion: grupo.filter((f) => f.condicion === 'Habilitado').length + ' de ' + grupo.length + ' habilitados',
          incentivo: n + ' de ' + grupo.length + ' cumplieron' };
      };
      const dia = [];
      for (const suc of SUC) {
        const g = filas.filter((f) => f.sucursal === suc);
        dia.push(...g, resumen('Subtotal ' + suc, suc, g, 'subtotal'));
      }
      dia.push(resumen('Total empresa', 'Empresa', filas, 'total'));
      dia.forEach((f, i) => out.push({ ...f, pos: i }));
    }
    return out;
  },
});

dash.calc('control_semanal', {
  inputs: ['desempeno'],
  title: 'Control semanal por asesor',
  description: 'Meta, venta y % de cada día (lunes a sábado) y total de la semana, una fila por asesor, subtotal de sucursal y total de la empresa.',
  fn: (desempeno) => {
    const P = { Lunes: 'lun', Martes: 'mar', 'Miércoles': 'mie', Jueves: 'jue', Viernes: 'vie', 'Sábado': 'sab' };
    const luz = (p) => (p == null ? '' : p >= 1 ? 'Verde' : p >= 0.7 ? 'Amarillo' : 'Rojo');
    const m = new Map();
    for (const r of desempeno) {
      const k = r.semana + '|' + r.ejecutivo;
      if (!m.has(k)) m.set(k, { semana: r.semana, ejecutivo: r.ejecutivo, sucursal: r.sucursal, tipo: r.tipo, pos: r.pos, sem_meta: 0, sem_venta: 0 });
      const o = m.get(k), p = P[r.dia];
      o[p + '_fecha'] = r.fecha; o[p + '_meta'] = r.plan_dia; o[p + '_venta'] = r.venta_dia; o[p + '_pct'] = r.pct_dia; o[p + '_luz'] = r.semaforo;
      o.sem_meta += r.plan_dia; o.sem_venta += r.venta_dia;
    }
    return [...m.values()].map((o) => ({ ...o, sem_meta: Math.round(o.sem_meta * 100) / 100, sem_venta: Math.round(o.sem_venta * 100) / 100, sem_pct: o.sem_meta ? o.sem_venta / o.sem_meta : null, sem_luz: luz(o.sem_meta ? o.sem_venta / o.sem_meta : null) }));
  },
});

dash.calc('plan_semanal', {
  inputs: ['plan_diario', 'plan_ejecutivos'],
  title: 'Plan por ejecutivo y semana',
  description: 'Plan mensual, plan de cada quincena (35% y 65%) y de cada semana operativa, por ejecutivo, sucursal y empresa.',
  fn: (plan_diario, plan_ejecutivos) => {
    const execs = [...plan_ejecutivos].sort((a, b) => a.orden - b.orden);
    const grupos = execs.map((e) => [e.ejecutivo, e.division, 'ejecutivo', [e.ejecutivo]]);
    const out = [];
    const fila = ([nombre, division, tipo, miembros]) => {
      const o = { ejecutivo: nombre, division, tipo, mes: 0, peso_plan: 0 };
      for (let i = 1; i <= 5; i++) o['s' + i] = Math.round(plan_diario.filter((r) => r.semana === 'Semana ' + i && miembros.includes(r.ejecutivo)).reduce((t, r) => t + r.plan_dia, 0) * 100) / 100;
      o.mes = execs.filter((e) => miembros.includes(e.ejecutivo)).reduce((t, e) => t + e.plan_mensual, 0);
      o.peso_plan = o.mes / execs.reduce((t, e) => t + e.plan_mensual, 0);
      for (const q of [1, 2]) o['q' + q] = Math.round(plan_diario.filter((r) => r.quincena === q && miembros.includes(r.ejecutivo)).reduce((t, r) => t + r.plan_dia, 0) * 100) / 100;
      return o;
    };
    for (const s of ['Los Robles', 'Ari Store', 'El Mayoreo']) {
      for (const g of grupos.filter((g) => execs.find((e) => e.ejecutivo === g[0]).sucursal === s)) out.push(fila(g));
      out.push(fila(['Subtotal ' + s, '', 'subtotal', execs.filter((e) => e.sucursal === s).map((e) => e.ejecutivo)]));
    }
    out.push(fila(['Total empresa', '', 'total', execs.map((e) => e.ejecutivo)]));
    return out;
  },
});

dash.calc('calendario', {
  inputs: ['ventas_nov', 'plan_diario', 'plan_ejecutivos'],
  title: 'Venta y plan por día calendario',
  description: 'Del 1 al 30 de noviembre: plan del día (sin cuota los domingos), venta del día, % de cumplimiento y acumulados, por ejecutivo, sucursal y empresa.',
  fn: (ventas_nov, plan_diario, plan_ejecutivos) => {
    const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const r2 = (x) => Math.round(x * 100) / 100;
    const luz = (p) => (p >= 1 ? 'Verde' : p >= 0.7 ? 'Amarillo' : 'Rojo');
    const execs = [...plan_ejecutivos].sort((a, b) => a.orden - b.orden);
    const grupos = execs.map((e) => [e.ejecutivo, 'ejecutivo', e.sucursal, [e.ejecutivo]]);
    for (const s of ['Los Robles', 'Ari Store', 'El Mayoreo']) grupos.push(['Subtotal ' + s, 'subtotal', s, execs.filter((e) => e.sucursal === s).map((e) => e.ejecutivo)]);
    grupos.push(['Total empresa', 'total', 'Empresa', execs.map((e) => e.ejecutivo)]);
    const out = [];
    for (const [nombre, tipo, sucursal, miembros] of grupos) {
      let pa = 0, va = 0;
      for (let d = 1; d <= 30; d++) {
        const fecha = '2026-11-' + String(d).padStart(2, '0');
        const dia = DIAS[new Date(fecha + 'T12:00:00Z').getUTCDay()];
        const plan = plan_diario.filter((r) => r.fecha === fecha && miembros.includes(r.ejecutivo)).reduce((t, r) => t + r.plan_dia, 0);
        const venta = ventas_nov.filter((v) => v.fecha === fecha && miembros.includes(v.ejecutivo)).reduce((t, v) => t + v.total, 0);
        pa += plan; va += venta;
        out.push({ fecha, dia, ejecutivo: nombre, tipo, sucursal, plan_dia: r2(plan), venta_dia: r2(venta), pct_dia: plan ? venta / plan : null, semaforo: plan ? luz(venta / plan) : 'Sin cuota', plan_acum: r2(pa), venta_acum: r2(va) });
      }
    }
    return out;
  },
});

// ---- Utilidades de la página
window.SV = {
  NAVY: '#0F2A4A', BLUE: '#2F6FB5', RED: '#C8102E',
  usd: (v) => (v == null || isNaN(v) ? '' : d3.format('$,.0f')(v)),
  usd2: (v) => (v == null || isNaN(v) ? '' : d3.format('$,.2f')(v)),
  pct: (v) => (v == null || isNaN(v) ? '' : d3.format('.0%')(v)),
  pct1: (v) => (v == null || isNaN(v) ? '' : d3.format('.1%')(v)),
  num: (v) => (v == null ? '' : d3.format(',')(v)),
  txt: (v) => (v == null ? '' : String(v)),
  enc: (v) => encodeURIComponent(String(v)),
  DIAS: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  corte: () => dash.params().corte || '2026-11-02',
  ej: () => dash.params().ej || 'Total empresa',
  semDe: (f) => 'Semana ' + Math.max(1, Math.floor((Number(f.slice(8, 10)) - 2) / 7) + 1),
  semana: () => dash.params().semana || window.SV.semDe(window.SV.corte()),
  asesor: () => dash.params().asesor || 'Todos',
  ajustar(s) {
    if (!s || s < '2026-11-02') s = '2026-11-02';
    if (s > '2026-11-30') s = '2026-11-30';
    const d = new Date(s + 'T12:00:00Z');
    if (d.getUTCDay() === 0) { d.setUTCDate(d.getUTCDate() - 1); s = d.toISOString().slice(0, 10); }
    return s;
  },
  hoy() { return window.SV.ajustar(new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 10)); },
  filas(id) { const g = dash.data(id); return g.status === 'ok' && Array.isArray(g.data) ? g.data : null; },
  luzColor: (l) => (l === 'Verde' || l === 'Libre' ? 'var(--color-ok)' : l === 'Amarillo' ? 'var(--color-warn)' : l === 'Rojo' ? 'var(--color-bad)' : 'var(--cds-chart-muted)'),
  tip(box) {
    let t = box.querySelector('.sv-tip');
    if (!t) { t = document.createElement('div'); t.className = 'sv-tip'; t.hidden = true; box.appendChild(t); }
    return t;
  },
  showTip(box, t, x, y, titulo, lineas) {
    t.replaceChildren();
    const h = document.createElement('div'); h.className = 'k'; h.textContent = titulo; t.appendChild(h);
    for (const [color, nombre, valor] of lineas) {
      const l = document.createElement('div');
      if (color) { const sw = document.createElement('span'); sw.className = 'sv-sw'; sw.style.background = color; l.appendChild(sw); }
      l.appendChild(document.createTextNode(nombre + ': ' + valor)); t.appendChild(l);
    }
    t.hidden = false;
    const w = t.offsetWidth, bw = box.clientWidth;
    t.style.left = Math.max(0, Math.min(bw - w, x + 12)) + 'px';
    t.style.top = Math.max(0, y - 10) + 'px';
  },
};

// ---- Día de corte (por defecto hoy en Managua)
dash.setParams({ corte: window.SV.hoy() });
for (const inp of document.querySelectorAll('.sv-corte')) {
  inp.addEventListener('change', () => { if (inp.value && inp.validity.valid) { const c = window.SV.ajustar(inp.value); dash.setParams({ corte: c, semana: window.SV.semDe(c) }); } });
  inp.addEventListener('blur', () => { inp.value = window.SV.corte(); });
}
for (const b of document.querySelectorAll('.sv-hoy')) b.addEventListener('click', () => { const c = window.SV.hoy(); dash.setParams({ corte: c, semana: window.SV.semDe(c) }); });
for (const b of document.querySelectorAll('.sv-sem')) b.addEventListener('click', () => dash.setParams({ semana: b.dataset.sem }));
dash.onData(() => {
  for (const inp of document.querySelectorAll('.sv-corte')) if (inp !== document.activeElement) inp.value = window.SV.corte();
  for (const b of document.querySelectorAll('.sv-sem')) b.setAttribute('aria-pressed', String(b.dataset.sem === window.SV.semana()));
});
