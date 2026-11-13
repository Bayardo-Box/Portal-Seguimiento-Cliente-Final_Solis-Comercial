dash.loader('cashback', {
  description: 'Convierte la respuesta COQL de Zoho CRM en filas; si hay más de 2000 registros, pide la siguiente página con OFFSET.',
  fn: async ({ answer, call, args }) => {
    const parse = (a) => {
      if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { throw new Error(a.slice(0, 300)); } }
      if (a && Array.isArray(a.content)) return parse(a.content.map((c) => c.text || '').join(''));
      return a;
    };
    const take = (a) => {
      a = parse(a);
      const inner = a && a.data && Array.isArray(a.data.data) ? a.data : a;
      if (!inner || !Array.isArray(inner.data)) throw new Error('Respuesta inesperada de Zoho CRM: ' + JSON.stringify(a).slice(0, 300));
      return { rows: inner.data, more: !!(inner.info && inner.info.more_records) };
    };
    let { rows, more } = take(answer);
    const all = rows.slice();
    const q = args.body.select_query;
    let off = 2000, n = 0;
    while (more && n < 5) {
      const r = take(await call('executeCOQLQuery', { body: { select_query: q.replace(/limit\s+\d+.*$/i, 'limit 2000 offset ' + off) } }));
      all.push(...r.rows); more = r.more; off += 2000; n++;
    }
    return all;
  },
});

dash.loader('ventas', {
  description: 'Suma de facturas de Zoho Books por mes (una consulta por mes) menos las facturas anuladas y en borrador.',
  fn: async ({ answer, call, args }) => {
    const parse = (a) => {
      if (typeof a === 'string') { try { a = JSON.parse(a); } catch (e) { throw new Error(a.slice(0, 300)); } }
      if (a && Array.isArray(a.content)) return parse(a.content.map((c) => c.text || '').join(''));
      return a && a.data && (a.data.page_context || a.data.invoices) ? a.data : a;
    };
    const first = parse(answer);
    if (!first || !first.page_context) throw new Error('Respuesta inesperada de Zoho Books: ' + JSON.stringify(first).slice(0, 300));
    const qp = args.query_params;
    const org = qp.organization_id;
    const now = new Date();
    const pad = (x) => String(x).padStart(2, '0');
    const today = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    const endAll = qp.date_end < today ? qp.date_end : today;
    const months = [];
    let y = +qp.date_start.slice(0, 4), m = +qp.date_start.slice(5, 7);
    while ((y + '-' + pad(m)) <= endAll.slice(0, 7)) { months.push(y + '-' + pad(m)); m++; if (m > 12) { m = 1; y++; } }
    const rows = [];
    for (const mes of months) {
      const [yy, mm] = mes.split('-').map(Number);
      const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
      const r = parse(await call('list_invoices', { query_params: { organization_id: org, date_start: mes + '-01', date_end: mes + '-' + pad(last), per_page: 1, response_option: 3 } }));
      if (!r || !r.page_context) throw new Error('Zoho Books no devolvió totales para ' + mes);
      rows.push({ Mes: mes, Ventas_brutas: Number(r.page_context.sum_columns.total) || 0, Facturas: Number(r.page_context.total) || 0, Anuladas: 0, Borrador: 0 });
    }
    const byMes = new Map(rows.map((r) => [r.Mes, r]));
    for (const [status, col] of [['void', 'Anuladas'], ['draft', 'Borrador']]) {
      for (let page = 1; page <= 10; page++) {
        const r = parse(await call('list_invoices', { query_params: { organization_id: org, status, date_start: qp.date_start, date_end: endAll, per_page: 200, page } }));
        for (const inv of (r.invoices || [])) { const row = byMes.get(String(inv.date).slice(0, 7)); if (row) { row[col] += Number(inv.total) || 0; row.Facturas -= 1; } }
        if (!r.page_context || !r.page_context.has_more_page) break;
      }
    }
    return {
      columns: ['Mes', 'Ventas_brutas', 'Anuladas', 'Borrador', 'Ventas_netas', 'Facturas'],
      rows: rows.map((r) => ({ Mes: r.Mes, Ventas_brutas: r.Ventas_brutas, Anuladas: r.Anuladas, Borrador: r.Borrador, Ventas_netas: Math.round((r.Ventas_brutas - r.Anuladas - r.Borrador) * 100) / 100, Facturas: r.Facturas })),
    };
  },
});

dash.calc('registros', {
  inputs: ['cashback'],
  title: 'Registros de cashback',
  description: 'Un registro por cashback: sucursal según el prefijo de la factura (AS = Ari Store, MS o asesor mayorista = Mayoreo, SC o sin prefijo = Los Robles) y estatus derivado.',
  fn: (cashback) => {
    const mayoristas = ['Rafael Martinez Bonilla', 'Alex Javier Mercado Rodriguez', 'Luis Roberto Rubio'];
    return cashback.map((r) => {
      const owner = [r['Owner.first_name'], r['Owner.last_name']].filter(Boolean).join(' ') || 'Sin propietario';
      const f = String(r.Factura_CashBack || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const sucursal = /^(FAC)?AS\d/.test(f) ? 'Ari Store' : (/^(FAC)?MS\d/.test(f) || mayoristas.includes(owner)) ? 'Mayoreo' : 'Los Robles';
      const est = r.Estatus || '', caja = r.Recibido_en_caja1 || '', op = r.Recibido_en_operaciones || '';
      const estado = est === 'Ingresado en sistema' ? 'Ingresado a sistema'
        : (/repar/i.test(est) || /repar/i.test(op)) ? 'En reparación'
        : (!est && !caja && !op) ? 'Sin estatus (histórico)'
        : caja === 'Recibido' ? 'Recibido en caja · pendiente OP'
        : 'Pendiente OP';
      const alerta = estado === 'Recibido en caja · pendiente OP' ? 'En tránsito'
        : (estado === 'Pendiente OP' || estado === 'En reparación') ? 'Pendiente liquidación' : '';
      const mods = [r.Modelo, r.Modelo_2, r.Modelo_3].filter(Boolean);
      return {
        Numero: r.Numero_de_Cash_Back, Fecha: r.Fecha, Mes: String(r.Fecha || '').slice(0, 7),
        Sucursal: sucursal, Propietario: owner, Cliente: r['Cliente.Full_Name'] || '',
        Equipos: mods.length || 1, Modelo: mods.join(' + '),
        IMEI: [r.IMEI, r.IMEI_2, r.IMEI_3].filter(Boolean).join(' / '),
        Factura: r.Factura_CashBack || '', Total: Number(r.Total_valoraci_n) || 0,
        Estado: estado, Caja: caja, Operaciones: op, Alerta: alerta,
      };
    });
  },
});

dash.calc('equipos', {
  inputs: ['cashback', 'registros'],
  title: 'Equipos recibidos',
  description: 'Un renglón por equipo (hasta 3 por cashback), con la familia de modelo normalizada (sin capacidad, RAM ni variante SIM) y su valoración.',
  fn: (cashback, registros) => {
    const byNum = new Map(registros.map((r) => [r.Numero, r]));
    const norm = (m) => {
      let s = String(m).toUpperCase().replace(/\(.*?\)/g, ' ');
      s = s.replace(/\b(SAMSUNG|SAMUSUNG|GALAXY|APPLE|5G|DS|ESIM|NORMAL|NORMLA|DE)\b/g, ' ');
      s = s.replace(/PROMAX/g, 'PRO MAX').replace(/(\d)(PRO|ULTRA)/g, '$1 $2');
      s = s.split(/\b\d+\s*(?:GB|TB|G|MM|RAM)\b|\/|\$|\b1\s*SIM|\+\s*ESIM|\b(?:32|64|128|256|512|1024)\b/)[0];
      s = s.trim().replace(/^(1[1-7]|X[SR]?)\b/, 'IPHONE $1').replace(/\bZ ?FLOD/, 'Z FOLD').replace(/\bZ(FOLD|FLIP)/, 'Z $1');
      return s.replace(/\s+/g, ' ').trim() || 'SIN MODELO';
    };
    const out = [];
    for (const r of cashback) {
      const g = byNum.get(r.Numero_de_Cash_Back);
      if (!g) continue;
      for (const k of ['', '_2', '_3']) {
        const mo = r['Modelo' + k];
        if (!mo) continue;
        const mk = r['Marca' + k];
        const marca = mk && mk !== '-None-' ? mk : /IPHONE|IPAD|MAC|AIRPOD|APPLE/i.test(mo) ? 'Apple' : /SAMSUNG|GALAXY|\bS2\d|FOLD|FLIP/i.test(mo) ? 'Samsung' : 'Otra';
        out.push({ Numero: g.Numero, Fecha: g.Fecha, Mes: g.Mes, Sucursal: g.Sucursal, Propietario: g.Propietario, Estado: g.Estado, Marca: marca, Familia: norm(mo), Valor: Number(r['Valoraci_n' + k]) || 0 });
      }
    }
    return out;
  },
});
