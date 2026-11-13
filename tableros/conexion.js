/* =====================================================================
   Conexión de los tableros con la copia de datos de Zoho
   ---------------------------------------------------------------------
   Los tableros son los mismos que en Claude. En vez de consultar Zoho en
   vivo, leen la copia de datos que Claude actualiza a las 7:00, 12:00,
   15:00 y 18:00 (carpeta /datos). Ofrece window.solis.use('mcp' | 'db' |
   'downloads') y responde a las mismas consultas de Zoho Books y Zoho CRM
   con el formato original, así el diseño y los cálculos no cambian.
   ===================================================================== */
(function () {
  'use strict';
  var BASE = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/tableros\/conexion\.js.*$/, 'datos/') : '../datos/';
  })();
  var VERSION = String(Date.now() - (Date.now() % 300000)); // evita copias viejas en caché (5 min)
  var cache = {};

  function traer(nombre) {
    if (cache[nombre]) return cache[nombre];
    var url = BASE + nombre + '?v=' + VERSION;
    cache[nombre] = fetch(url, { cache: 'no-cache' }).then(async function (r) {
      if (!r.ok) throw errorDe('server_unavailable', 'No se encontró ' + nombre + ' (' + r.status + ')');
      if (/\.gz$/.test(nombre)) {
        var buf = await r.arrayBuffer(), u8 = new Uint8Array(buf);
        if (u8[0] === 0x1f && u8[1] === 0x8b && typeof DecompressionStream !== 'undefined') {
          var ds = new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')));
          return JSON.parse(await ds.text());
        }
        return JSON.parse(new TextDecoder().decode(u8)); // el servidor ya lo descomprimió
      }
      return r.json();
    });
    cache[nombre].catch(function () { delete cache[nombre]; });
    return cache[nombre];
  }

  function errorDe(code, msg) { var e = new Error(msg || code); e.code = code; e.retryable = false; return e; }
  var meta = function () { return traer('meta.json'); };
  var corteMs = function () { return meta().then(function (m) { return Date.parse(m.corte) || Date.now(); }); };

  /* ---------------- Zoho Books · list_invoices ---------------- */
  var pad = function (n) { return String(n).padStart(2, '0'); };
  function mesesEntre(a, b) {
    var out = [], y = +a.slice(0, 4), m = +a.slice(5, 7);
    while ((y + '-' + pad(m)) <= b.slice(0, 7)) { out.push(y + '-' + pad(m)); if (++m > 12) { m = 1; y++; } }
    return out;
  }
  function ultimoDia(mes) { var y = +mes.slice(0, 4), m = +mes.slice(5, 7); return mes + '-' + pad(new Date(Date.UTC(y, m, 0)).getUTCDate()); }
  function hoy() { var d = new Date(Date.now() - 6 * 3600e3); return d.toISOString().slice(0, 10); }

  async function listInvoices(qp) {
    qp = qp || {};
    var a = qp.date || qp.date_start || qp.date_after || '2000-01-01';
    var b = qp.date || qp.date_end || qp.date_before || '2099-12-31';
    if (b > hoy()) b = hoy();
    var estado = qp.status ? String(qp.status).toLowerCase() : '';
    var per = Math.max(1, Math.min(200, Number(qp.per_page) || 200)), page = Math.max(1, Number(qp.page) || 1);
    var opt = Number(qp.response_option) || 0;
    var m = await meta(), disponibles = m.meses_facturas || [];
    var meses = a <= b ? mesesEntre(a, b) : [];
    var tot = null, filas = [];
    for (var i = 0; i < meses.length; i++) {
      var mes = meses[i];
      if (disponibles.indexOf(mes) >= 0) {
        var d = await traer('facturas_' + mes + '.json.gz');
        d.invoices.forEach(function (f) { if (f.date >= a && f.date <= b && (!estado || f.status === estado)) filas.push(f); });
        continue;
      }
      // Mes sin detalle: totales mensuales (totales por mes y anuladas/borrador del tablero Cashback)
      tot = tot || await traer('totales.json');
      var t = tot[mes] || {};
      if (!(a <= mes + '-01' && b >= ultimoDia(mes))) continue;
      var total = estado ? t[estado + '_total'] : t.total, n = estado ? t[estado + '_n'] : t.n;
      if (!n) continue;
      var ini = filas.length;
      for (var k = 0; k < n; k++) filas.push({ invoice_id: mes + '-' + (estado || 'all') + '-' + k, date: mes + '-15', created_time: mes + '-15T12:00:00-0600', status: estado || 'sent', total: Math.round(total / n * 100) / 100 });
      var s = filas.slice(ini).reduce(function (x, f) { return x + f.total; }, 0);
      filas[filas.length - 1].total = Math.round((filas[filas.length - 1].total + (total - s)) * 100) / 100;
    }
    var suma = filas.reduce(function (x, f) { return x + (Number(f.total) || 0); }, 0);
    var col = qp.sort_column || 'created_time';
    filas.sort(function (x, y) { var p = String(x[col] || x.created_time || ''), q = String(y[col] || y.created_time || ''); return p < q ? 1 : p > q ? -1 : 0; });
    var pc = { page: page, per_page: per, has_more_page: page * per < filas.length, report_name: 'Facturas', applied_filter: 'Status.All', sort_column: col, sort_order: 'D' };
    if (opt === 1 || opt === 2 || opt === 3 || opt === 4) { pc.total = filas.length; pc.total_pages = Math.ceil(filas.length / per); }
    if (opt === 1 || opt === 3 || opt === 4) pc.sum_columns = { total: Math.round(suma * 100) / 100, total_formatted: '$' + suma.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) };
    var data = { code: 0, message: 'success', page_context: pc };
    if (opt !== 2 && opt !== 3) data.invoices = filas.slice((page - 1) * per, page * per);
    return { status: 'success', data: data };
  }

  /* ---------------- Zoho CRM · COQL ---------------- */
  async function coql(q) {
    q = String(q || '');
    var mod = (/\bfrom\s+([A-Za-z0-9_]+)/i.exec(q) || [])[1] || '';
    var nombre = mod === 'Cash_Back' ? 'cashback' : mod === 'Contacts' ? 'wb_pot'
      : mod === 'CustomModule5001' ? (/group\s+by\s+Contact_Name/i.test(q) ? 'wb_may' : 'wb_fac') : null;
    if (!nombre) return { status: 'failure', data: { message: 'Consulta no incluida en la copia web: ' + mod } };
    var d = await traer(nombre + '.json.gz'), filas = d.data || [];
    var off = 0, lim = 2000, mm;
    if ((mm = /limit\s+(\d+)\s*,\s*(\d+)/i.exec(q))) { off = +mm[1]; lim = +mm[2]; }
    else if ((mm = /limit\s+(\d+)(?:\s+offset\s+(\d+))?/i.exec(q))) { lim = +mm[1]; off = +(mm[2] || 0); }
    var parte = filas.slice(off, off + lim);
    return { status: 'success', data: { data: parte, info: { count: parte.length, more_records: off + lim < filas.length } } };
  }

  /* ---------------- Zoho Books · get_invoice (detalle de líneas guardado en datos/lineas.json) ---------------- */
  async function getInvoice(id) {
    var lineas = await traer('lineas.json').catch(function () { return {}; });
    var ls = lineas[String(id)];
    if (!ls) throw errorDe('tool_error', 'Factura aún sin detalle en la copia web; se completa en la próxima actualización.');
    return { status: 'success', data: { code: 0, message: 'success', invoice: { invoice_id: String(id), line_items: ls.map(function (l) {
      return { account_name: l[0], item_total: l[2], item_custom_fields: l[1] ? [{ api_name: 'cf_marca', label: 'Marca', value: l[1], value_formatted: l[1] }] : [] };
    }) } } };
  }

  async function callTool(server, tool, input, opts) {
    input = input || {};
    var payload;
    if (tool === 'list_invoices') payload = await listInvoices(input.query_params);
    else if (tool === 'executeCOQLQuery') payload = await coql((input.body || {}).select_query);
    else if (tool === 'getUsers') payload = { status: 'success', data: { users: await traer('usuarios.json') } };
    else if (tool === 'get_invoice') payload = await getInvoice(((input.path_variables || {}).invoice_id) || '');
    else throw errorDe('tool_error', 'Consulta no incluida en la copia web: ' + tool);
    return { payload: payload, cache: { storedAt: await corteMs() } };
  }

  /* ---------------- descargas ---------------- */
  var downloads = {
    save: async function (o) {
      var data = o && o.data, blob;
      if (data instanceof Blob) blob = data;
      else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) blob = new Blob([data]);
      else blob = new Blob([String(data == null ? '' : data)], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = (o && o.filename) || 'descarga';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      return { ok: true };
    }
  };

  /* ---------------- sello de corte ---------------- */
  function sello() {
    meta().then(function (m) {
      var d = new Date(Date.parse(m.corte));
      if (isNaN(d)) return;
      var txt = d.toLocaleString('es-NI', { timeZone: 'America/Managua', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      var el = document.createElement('div');
      el.setAttribute('role', 'status');
      el.title = 'Copia de Zoho que Claude actualiza a las 7:00, 12:00, 15:00 y 18:00';
      el.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;background:rgba(15,23,42,.88);color:#fff;font:600 12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:7px 11px;border-radius:999px;box-shadow:0 4px 14px rgba(0,0,0,.25);pointer-events:none';
      el.textContent = 'Datos de Zoho al ' + txt;
      document.body.appendChild(el);
    }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sello); else sello();

  var mcp = { callTool: callTool };
  window.solis = {
    use: function (nombre) {
      if (nombre === 'mcp') return Promise.resolve(mcp);
      if (nombre === 'downloads') return Promise.resolve(downloads);
      return Promise.resolve(null); // la gestión compartida de Win-Back vive en Claude
    }
  };
  window.SolisConexion = { callTool: callTool };
  // Los tableros originales piden window.claude.use(...): se atienden aquí mismo.
  if (!window.claude) window.claude = window.solis;
})();
