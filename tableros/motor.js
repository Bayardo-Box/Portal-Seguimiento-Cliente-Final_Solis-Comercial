/* =====================================================================
   Motor de tableros (Plan de Ventas y Cashback)
   ---------------------------------------------------------------------
   Ejecuta el código original de estos tableros fuera de su plataforma:
   carga cada fuente de datos (window.FUENTES) desde la copia de datos de /datos, aplica
   sus "loaders" y "calcs", y vuelve a dibujar la página cuando llegan
   los datos o cambian los filtros. API compatible: dash.loader, calc,
   data, onData, draw, params, setParams, resetParams, setLink.
   ===================================================================== */
(function () {
  'use strict';
  var loaders = {}, calcs = {}, estado = {}, oyentes = [], dibujos = {};
  var params = {}, inicial = {}, programado = false, arrancado = false;

  function normaliza(x) {
    if (Array.isArray(x)) return x;
    if (x && Array.isArray(x.rows)) return x.rows;
    if (x && x.data && Array.isArray(x.data)) return x.data;
    return x;
  }
  function programar() {
    if (programado) return; programado = true;
    requestAnimationFrame(function () { programado = false; pintar(); });
  }
  function pintar() {
    document.querySelectorAll('[data-source]').forEach(function (el) {
      var ids = el.getAttribute('data-source').split(/\s+/).filter(Boolean);
      var st = ids.map(function (i) { return (estado[i] || {}).status || 'loading'; });
      if (st.every(function (s) { return s === 'ok'; })) el.removeAttribute('data-dash-source-state');
      else if (st.some(function (s) { return s === 'error'; })) el.setAttribute('data-dash-source-state', 'error');
      else el.setAttribute('data-dash-source-state', el.hasAttribute('data-dash-cargado') ? 'refreshing' : 'empty');
      if (st.every(function (s) { return s === 'ok'; })) el.setAttribute('data-dash-cargado', '');
    });
    oyentes.forEach(function (cb) { try { cb(); } catch (e) { console.error('[tablero]', e); } });
    Object.keys(dibujos).forEach(function (n) {
      document.querySelectorAll('[data-draw="' + n + '"]').forEach(function (el) {
        try { dibujos[n](el); } catch (e) { console.error('[tablero] dibujo ' + n, e); }
      });
    });
  }

  function recalcular() {
    var cambio = true, vueltas = 0;
    while (cambio && vueltas++ < 20) {
      cambio = false;
      Object.keys(calcs).forEach(function (id) {
        var c = calcs[id], ins = c.inputs.map(function (i) { return estado[i] || { status: 'loading' }; });
        var prev = estado[id];
        var firma = ins.map(function (s) { return s.status + ':' + (s.v || 0); }).join('|');
        if (prev && prev.firma === firma) return;
        var nuevo;
        if (ins.some(function (s) { return s.status === 'error'; })) nuevo = { status: 'error', error: 'Una fuente no cargó' };
        else if (ins.every(function (s) { return s.status === 'ok'; })) {
          try { nuevo = { status: 'ok', data: c.fn.apply(null, ins.map(function (s) { return s.data; })) }; }
          catch (e) { console.error('[tablero] cálculo ' + id, e); nuevo = { status: 'error', error: e.message }; }
        } else nuevo = { status: prev && prev.data ? 'refreshing' : 'loading', data: prev && prev.data };
        nuevo.firma = firma; nuevo.v = ((prev && prev.v) || 0) + 1;
        estado[id] = nuevo; cambio = true;
      });
    }
  }

  async function cargarFuente(id, f, refresh) {
    var prev = estado[id];
    if (!prev || prev.status !== 'ok') estado[id] = { status: 'loading', v: (prev && prev.v) || 0 };
    try {
      var rows;
      if (f.filas) rows = f.filas;
      else {
        var opts = { cache: refresh ? { staleTime: 0, refresh: true } : {} };
        var llamar = function (tool, input) { return window.SolisConexion.callTool(f.server, tool, input, opts).then(function (r) { return r.payload; }); };
        var resp = await llamar(f.tool, f.args);
        if (resp && resp.status === 'failure') throw new Error((resp.data && resp.data.message) || 'Zoho rechazó la consulta');
        rows = loaders[id] ? await loaders[id].fn({ answer: resp, call: llamar, args: f.args }) : resp;
      }
      estado[id] = { status: 'ok', data: normaliza(rows), v: ((estado[id] && estado[id].v) || 0) + 1 };
    } catch (e) {
      console.error('[tablero] fuente ' + id, e);
      estado[id] = prev && prev.status === 'ok' ? prev : { status: 'error', error: e.message, v: ((prev && prev.v) || 0) + 1 };
    }
    recalcular(); programar();
  }

  async function cargarTodo(refresh) {
    var F = window.FUENTES || {}, ids = Object.keys(F), i = 0;
    async function trabajador() { while (i < ids.length) { var id = ids[i++]; await cargarFuente(id, F[id], refresh); } }
    await Promise.all([1, 2, 3, 4, 5, 6].map(trabajador));
  }

  window.dash = {
    loader: function (id, o) { loaders[id] = o; },
    calc: function (id, o) { calcs[id] = { inputs: o.inputs || [], fn: o.fn }; },
    data: function (id) { var s = estado[id]; return s ? { status: s.status === 'refreshing' ? 'ok' : s.status, refreshing: s.status === 'refreshing', data: s.data, error: s.error } : { status: 'loading' }; },
    onData: function (cb) { oyentes.push(cb); programar(); },
    draw: function (n, fn) { dibujos[n] = fn; programar(); },
    params: function () { return Object.assign({}, params); },
    setParams: function (p) {
      Object.keys(p || {}).forEach(function (k) { if (p[k] === null || p[k] === undefined) delete params[k]; else params[k] = p[k]; });
      if (!arrancado) inicial = Object.assign({}, params);
      programar();
    },
    resetParams: function () { params = Object.assign({}, inicial); programar(); },
    setLink: function (id) { try { history.replaceState(null, '', '#' + id); } catch (e) {} },
    actualizar: function () { return cargarTodo(true); },
    refresh: function (id) { var F = window.FUENTES || {}; if (F[id]) { var p = estado[id]; if (p && p.status === 'ok') p.status = 'refreshing'; programar(); return cargarFuente(id, F[id], true); } }
  };

  function arrancar() {
    arrancado = true; recalcular(); programar(); cargarTodo(false);
    setInterval(function () { if (!document.hidden) cargarTodo(false); }, 10 * 60 * 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else setTimeout(arrancar, 0);
})();
