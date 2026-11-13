// ---- Exportar el one pager ejecutivo a PDF (carta horizontal), generado en el navegador
(() => {
  const S = window.SV;
  const W = 792, H = 612, M = 18;
  const AW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
  const ESP = { '–': 150, '—': 151, '•': 149, '…': 133, '€': 128, '‘': 145, '’': 146, '“': 147, '”': 148 };
  const EXTRA = { 149: 350, 150: 556, 151: 1000, 133: 1000, 183: 278, 171: 556, 187: 556, 225: 556, 233: 556, 237: 278, 243: 556, 250: 556, 241: 556, 193: 667, 201: 667, 205: 278, 211: 778, 218: 722, 209: 722, 252: 556, 191: 611, 161: 333 };
  const limpio = (s) => String(s == null ? '' : s).replace(/≥/g, '>=').replace(/≤/g, '<=');
  const codigos = (s) => {
    const out = [];
    for (const ch of limpio(s)) {
      const c = ch.codePointAt(0);
      if (c >= 32 && c < 127) out.push(c);
      else if (ESP[ch]) out.push(ESP[ch]);
      else if (c >= 160 && c <= 255) out.push(c);
      else out.push(63);
    }
    return out;
  };
  const anchoC = (c) => (c >= 32 && c < 127 ? AW[c - 32] : EXTRA[c] || 556);
  const ancho = (s, size, bold) => codigos(s).reduce((t, c) => t + anchoC(c), 0) * size / 1000 * (bold ? 1.06 : 1);
  const esc = (s) => codigos(s).map((c) => (c === 40 || c === 41 || c === 92 ? '\\' + String.fromCharCode(c) : c < 127 ? String.fromCharCode(c) : '\\' + c.toString(8).padStart(3, '0'))).join('');
  const recortar = (s, w, size, bold) => {
    s = limpio(s);
    if (ancho(s, size, bold) <= w) return s;
    while (s.length > 1 && ancho(s + '…', size, bold) > w) s = s.slice(0, -1);
    return s + '…';
  };
  const partir = (s, w, size, bold) => {
    const lineas = [];
    let cur = '';
    for (const p of limpio(s).split(' ')) {
      const t = cur ? cur + ' ' + p : p;
      if (ancho(t, size, bold) > w && cur) { lineas.push(cur); cur = p; } else cur = t;
    }
    if (cur) lineas.push(cur);
    return lineas;
  };
  const n2 = (v) => v.toFixed(2);
  const rgb = (c) => c.map((v) => v.toFixed(3)).join(' ');
  const C = {
    navy: [0.059, 0.165, 0.29], navy2: [0.114, 0.263, 0.439], red: [0.784, 0.063, 0.18], blue: [0.184, 0.435, 0.71],
    txt: [0.12, 0.13, 0.15], gris: [0.42, 0.45, 0.5], linea: [0.85, 0.87, 0.9], panel: [0.968, 0.974, 0.984], blanco: [1, 1, 1],
    ok: [0.118, 0.557, 0.243], warn: [0.878, 0.631, 0], bad: [0.776, 0.157, 0.157],
    okT: [0.8, 0.91, 0.82], warnT: [0.99, 0.92, 0.72], badT: [0.97, 0.82, 0.82], sub: [0.9, 0.92, 0.95], tot: [0.82, 0.86, 0.91], futuro: [0.91, 0.92, 0.94],
  };
  const luz = (l) => (l === 'Verde' || l === 'Libre' || l === 'Habilitado' ? C.ok : l === 'Amarillo' || l === 'Pendiente' ? C.warn : l === 'Rojo' || l === 'Bloqueado' ? C.bad : null);
  const luzT = (l) => (l === 'Verde' || l === 'Libre' ? C.okT : l === 'Amarillo' ? C.warnT : l === 'Rojo' ? C.badT : null);
  const RANGO = { 'Semana 1': '2–7 nov', 'Semana 2': '9–14 nov', 'Semana 3': '16–21 nov', 'Semana 4': '23–28 nov', 'Semana 5': '30 nov' };
  const POLITICA = [
    ['1. Elegibilidad', 'Los beneficios aplican solo al ejecutivo que alcance como mínimo el 35% de su plan mensual al corte del 15 de noviembre; hasta esa fecha quedan condicionados y, a partir del 16, no se otorgan a quien no lo haya logrado.'],
    ['2. Ejecutivo Senior', 'Al cumplir su cuota diaria puede retirarse de la jornada. Si cumple su cuota diaria cuatro días de lunes a viernes, puede tomar el sábado libre con goce de cumplimiento.'],
    ['3. Junior y Atención al Cliente', 'Si completa su cuota diaria antes de las 4:00 p. m., puede retirarse a partir de esa hora. Con cuatro días consecutivos de cuota cumplida (lunes a viernes) puede salir el sábado a las 3:00 p. m.'],
    ['4. Medición y semáforo', 'Facturas de Zoho Books a nombre de cada ejecutivo, sin anuladas ni borradores. Diario: verde ≥ 100% de la cuota, amarillo 70–99%, rojo < 70%. Ritmo mensual: verde ≥ 100% de lo esperado, amarillo 90–99%, rojo < 90%.'],
  ];

  const lienzo = () => {
    const ops = [];
    const Y = (y) => H - y;
    return {
      ops,
      rect(x, y, w, h, fill, stroke, lw = 0.5) {
        if (fill) ops.push(rgb(fill) + ' rg');
        if (stroke) ops.push(rgb(stroke) + ' RG ' + lw + ' w');
        ops.push(`${n2(x)} ${n2(Y(y + h))} ${n2(w)} ${n2(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
      },
      line(x1, y1, x2, y2, color, lw = 0.5, dash) {
        ops.push(`${rgb(color)} RG ${lw} w [${dash || ''}] 0 d ${n2(x1)} ${n2(Y(y1))} m ${n2(x2)} ${n2(Y(y2))} l S [] 0 d`);
      },
      poly(pts, color, lw, dash) {
        if (pts.length < 2) return;
        ops.push(`${rgb(color)} RG ${lw} w 1 J 1 j [${dash || ''}] 0 d ` + pts.map((p, i) => `${n2(p[0])} ${n2(Y(p[1]))} ${i ? 'l' : 'm'}`).join(' ') + ' S [] 0 d 0 J 0 j');
      },
      text(x, y, s, o = {}) {
        const size = o.size || 7, bold = !!o.bold, color = o.color || C.txt;
        const t = o.max ? recortar(s, o.max, size, bold) : limpio(s);
        const w = ancho(t, size, bold);
        const xx = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
        ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb(color)} rg ${n2(xx)} ${n2(Y(y))} Td (${esc(t)}) Tj ET`);
      },
      image(x, y, w, h) { ops.push(`q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(Y(y + h))} cm /Im1 Do Q`); },
    };
  };

  const tabla = (P, x, y, cols, rows, o) => {
    const hh = o.hh, rh = o.rh, size = o.size;
    const total = cols.reduce((t, c) => t + c.w, 0);
    P.rect(x, y, total, hh, C.navy);
    let cx = x;
    for (const c of cols) {
      const tx = c.al === 'r' ? cx + c.w - 3 : c.al === 'c' ? cx + c.w / 2 : cx + 3;
      P.text(tx, y + hh - 3.6, c.t, { size, bold: true, color: C.blanco, align: c.al === 'r' ? 'right' : c.al === 'c' ? 'center' : 'left', max: c.w - 4 });
      cx += c.w;
    }
    rows.forEach((r, i) => {
      const yy = y + hh + i * rh;
      const fondo = r.tipo === 'total' ? C.tot : r.tipo === 'subtotal' ? C.sub : null;
      if (fondo) P.rect(x, yy, total, rh, fondo);
      const negrita = r.tipo === 'total' || r.tipo === 'subtotal';
      let cx2 = x;
      for (const c of cols) {
        const bg = c.bg ? c.bg(r) : null;
        if (bg) P.rect(cx2 + 0.5, yy + 0.5, c.w - 1, rh - 1, bg);
        let tx = c.al === 'r' ? cx2 + c.w - 3 : c.al === 'c' ? cx2 + c.w / 2 : cx2 + 3;
        const dot = c.dot ? c.dot(r) : null;
        if (dot) { P.rect(tx, yy + rh / 2 - 1.8, 3.6, 3.6, dot); tx += 6; }
        P.text(tx, yy + rh - 2.9, c.f(r), { size, bold: negrita || (bg && c.boldBg), align: c.al === 'r' ? 'right' : c.al === 'c' ? 'center' : 'left', max: c.w - 5 - (dot ? 6 : 0) });
        cx2 += c.w;
      }
      P.line(x, yy + rh, x + total, yy + rh, C.linea, 0.4);
    });
    return y + hh + rows.length * rh;
  };

  const fechaLarga = (f) => { const d = new Date(f + 'T12:00:00Z'); return S.DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' de noviembre de 2026'; };
  const titulo = (P, x, y, s) => { P.rect(x, y + 1, 2.5, 10, C.red); P.text(x + 7, y + 9.5, s, { size: 9, bold: true, color: C.navy }); };

  const construir = (logo) => {
    const corte = S.corte();
    const des = S.filas('desempeno');
    const sem = S.filas('control_semanal');
    if (!des || !sem) throw new Error('datos');
    const dia = des.filter((r) => r.fecha === corte);
    const tot = dia.find((r) => r.ejecutivo === 'Total empresa');
    if (!tot) throw new Error('datos');
    const P = lienzo();

    // Encabezado
    P.rect(M, M, W - 2 * M, 54, C.navy);
    P.rect(M, M + 54, W - 2 * M, 2.5, C.red);
    P.rect(M + 8, M + 7, 74, 40, C.blanco);
    if (logo) { const k = logo.w / logo.h; let h = 36, w = h * k; if (w > 68) { w = 68; h = w / k; } P.image(M + 8 + (74 - w) / 2, M + 7 + (40 - h) / 2, w, h); }
    P.text(M + 94, M + 25, 'Plan de Ventas · Noviembre 2026', { size: 15, bold: true, color: C.blanco });
    P.text(M + 94, M + 42, 'Corte al ' + fechaLarga(corte) + '   ·   Plan ' + S.usd(tot.plan_mensual) + '   ·   Ritmo ' + S.pct(tot.pct_ritmo) + ' (' + tot.semaforo_mes + ')   ·   Proyección de cierre ' + S.usd(tot.proyeccion), { size: 8, color: [0.86, 0.9, 0.95] });
    const ahora = new Date(Date.now() - 6 * 3600e3).toISOString();
    P.text(W - M - 8, M + 14, 'Generado ' + ahora.slice(8, 10) + '/' + ahora.slice(5, 7) + '/' + ahora.slice(0, 4) + ' ' + ahora.slice(11, 16), { size: 6.5, color: [0.78, 0.84, 0.92], align: 'right' });
    if (luz(tot.semaforo_mes)) P.rect(W - M - 60, M + 34, 52, 12, luz(tot.semaforo_mes));
    P.text(W - M - 34, M + 42.6, 'Ritmo ' + tot.semaforo_mes.toLowerCase(), { size: 6.8, bold: true, color: C.blanco, align: 'center' });

    // Indicadores
    const kpis = [
      ['Venta acumulada del mes', S.usd(tot.venta_acum), 'Logro ' + S.pct1(tot.pct_logro) + ' · esperado ' + S.usd(tot.plan_acum), C.red],
      ['Venta del día', S.usd(tot.venta_dia), 'Cuota ' + S.usd(tot.plan_dia) + ' · ' + S.pct(tot.pct_dia), C.navy2],
      ['Ejecutivos con cuota cumplida', String(tot.incentivo).replace(' cumplieron', ''), 'Del equipo de 9', C.navy2],
      ['Falta para la cuota de hoy', S.usd(tot.brecha_dia), 'Suma de lo pendiente por ejecutivo', C.navy2],
      ['Falta para la meta del mes', S.usd(tot.brecha), 'Proyección de cierre ' + S.usd(tot.proyeccion), C.navy2],
    ];
    const ky = 82, kw = (W - 2 * M - 4 * 6) / 5;
    kpis.forEach(([l, v, s, col], i) => {
      const x = M + i * (kw + 6);
      P.rect(x, ky, kw, 44, C.panel, C.linea);
      P.rect(x, ky, kw, 2.2, col);
      P.text(x + 7, ky + 12, l, { size: 6.8, color: C.gris, max: kw - 12 });
      P.text(x + 7, ky + 29, v, { size: 14, bold: true, color: C.txt, max: kw - 12 });
      P.text(x + 7, ky + 39, s, { size: 6.2, color: C.gris, max: kw - 12 });
    });

    // Acumulado del mes
    const cy = 134, chh = 150;
    const ax = M, aw = 300;
    P.rect(ax, cy, aw, chh, null, C.linea);
    titulo(P, ax + 7, cy + 5, 'Venta diaria vs. plan diario · total empresa');
    const filasT = des.filter((r) => r.ejecutivo === 'Total empresa');
    const maxV = Math.max(1, ...filasT.map((r) => Math.max(r.plan_dia, r.fecha <= corte ? r.venta_dia : 0))) * 1.1;
    const ticks = d3.ticks(0, maxV, 4);
    const lw = Math.max(...ticks.map((t) => ancho(S.usd(t), 5.8))) + 4;
    const px0 = ax + 8 + lw, px1 = ax + aw - 8, py0 = cy + 30, py1 = cy + chh - 14;
    const yv = (v) => py1 - (v / maxV) * (py1 - py0);
    const paso = (px1 - px0) / filasT.length, bw = paso * 0.38;
    const xc = (i) => px0 + paso * (i + 0.5);
    for (const t of ticks) { P.line(px0, yv(t), px1, yv(t), C.linea, 0.4); P.text(px0 - 3, yv(t) + 2, S.usd(t), { size: 5.8, color: C.gris, align: 'right' }); }
    filasT.forEach((r, i) => {
      P.rect(xc(i) - bw - 0.3, yv(r.plan_dia), bw, py1 - yv(r.plan_dia), [0.8, 0.82, 0.86]);
      if (r.fecha <= corte && r.venta_dia > 0) P.rect(xc(i) + 0.3, yv(r.venta_dia), bw, py1 - yv(r.venta_dia), luz(r.semaforo) || C.blue);
      if (i % 3 === 0 || i === filasT.length - 1) P.text(xc(i), py1 + 8, String(Number(r.fecha.slice(8, 10))), { size: 5.6, color: C.gris, align: 'center' });
    });
    { const ic = filasT.findIndex((r) => r.fecha === corte); if (ic >= 0) P.line(xc(ic) + paso / 2, py0 - 4, xc(ic) + paso / 2, py1, [0.6, 0.63, 0.68], 0.5, '2 2'); }
    P.rect(ax + 10, cy + 19, 5, 5, [0.8, 0.82, 0.86]);
    P.text(ax + 17, cy + 24, 'Plan del día', { size: 6, color: C.gris });
    P.rect(ax + 58, cy + 19, 5, 5, C.ok);
    P.text(ax + 65, cy + 24, 'Venta del día (color según semáforo)', { size: 6, color: C.gris });
    P.text(ax + aw - 10, cy + 24, '- - día de corte', { size: 6, color: C.gris, align: 'right' });

    // Mapa de cumplimiento
    const mx = M + aw + 6, mw = W - 2 * M - aw - 6;
    P.rect(mx, cy, mw, chh, null, C.linea);
    titulo(P, mx + 7, cy + 5, 'Mapa de cumplimiento diario');
    [['>= 100%', C.ok], ['70–99%', C.warn], ['< 70%', C.bad], ['Por venir', C.futuro]].reduceRight((xr, [t, c]) => {
      const w = ancho(t, 6) + 12; P.rect(xr - w, cy + 8, 6, 6, c); P.text(xr - w + 8, cy + 13.4, t, { size: 6, color: C.gris }); return xr - w - 6;
    }, mx + mw - 8);
    const ejec = des.filter((r) => r.tipo === 'ejecutivo');
    const nombres = [...new Set(ejec.map((r) => r.ejecutivo))];
    const fechas = [...new Set(ejec.map((r) => r.fecha))].sort();
    const nw = Math.max(...nombres.map((n) => ancho(n, 6.2))) + 6;
    const gx = mx + 8 + nw, gw = mx + mw - 8 - gx, cw = gw / fechas.length;
    const gy = cy + 34, ch = (cy + chh - 6 - gy) / nombres.length;
    fechas.forEach((f, i) => {
      P.text(gx + i * cw + cw / 2, gy - 9, S.DIAS[new Date(f + 'T12:00:00Z').getUTCDay()].slice(0, 1).toUpperCase(), { size: 5, color: C.gris, align: 'center' });
      P.text(gx + i * cw + cw / 2, gy - 2.5, String(Number(f.slice(8, 10))), { size: 5, color: C.gris, align: 'center' });
    });
    nombres.forEach((n, j) => P.text(gx - 4, gy + j * ch + ch / 2 + 2, n, { size: 6.2, align: 'right' }));
    for (const r of ejec) {
      const i = fechas.indexOf(r.fecha), j = nombres.indexOf(r.ejecutivo);
      P.rect(gx + i * cw + 0.6, gy + j * ch + 0.6, cw - 1.2, ch - 1.2, r.fecha > corte ? C.futuro : luz(r.semaforo) || C.futuro);
    }

    // Tabla maestra
    const ty = 292;
    titulo(P, M, ty, 'Tabla maestra de desempeño · ' + fechaLarga(corte));
    const condTxt = (r) => (r.tipo === 'ejecutivo' ? r.condicion + ' (' + S.pct(r.logro_quincena) + ')' : r.condicion);
    const finTabla = tabla(P, M, ty + 14, [
      { t: 'Ejecutivo', w: 110, f: (r) => r.ejecutivo },
      { t: 'Sucursal', w: 58, f: (r) => r.sucursal },
      { t: 'Plan mes', w: 52, al: 'r', f: (r) => S.usd(r.plan_mensual) },
      { t: 'Venta acum.', w: 56, al: 'r', f: (r) => S.usd(r.venta_acum) },
      { t: '% logro', w: 38, al: 'r', f: (r) => S.pct1(r.pct_logro) },
      { t: 'Cuota día', w: 50, al: 'r', f: (r) => S.usd(r.plan_dia) },
      { t: 'Venta día', w: 50, al: 'r', f: (r) => S.usd(r.venta_dia) },
      { t: '% día', w: 38, al: 'r', f: (r) => S.pct(r.pct_dia), bg: (r) => luzT(r.semaforo), boldBg: true },
      { t: 'Hora', w: 32, al: 'c', f: (r) => r.hora_meta || '' },
      { t: 'Quincena 35%', w: 72, f: condTxt, dot: (r) => (r.tipo === 'ejecutivo' ? luz(r.condicion) : null) },
      { t: 'Incentivo del día', w: 150, f: (r) => r.incentivo },
      { t: 'Falta mes', w: 50, al: 'r', f: (r) => S.usd(r.brecha) },
    ], dia, { hh: 12, rh: 10, size: 6.4 });

    // Control semanal
    const by = Math.max(finTabla + 8, 456);
    const semana = S.semana();
    const filtro = S.asesor();
    let filasS = sem.filter((r) => r.semana === semana).sort((a, b) => a.pos - b.pos);
    if (filtro !== 'Todos') filasS = filtro.startsWith('Subtotal ') ? filasS.filter((r) => r.sucursal === filtro.slice(9)) : filasS.filter((r) => r.ejecutivo === filtro);
    titulo(P, M, by, 'Control semanal · ' + semana + ' (' + RANGO[semana] + ')' + (filtro !== 'Todos' ? ' · ' + filtro : ''));
    const disponible = 594 - (by + 14) - 11;
    const rh = Math.min(10, disponible / Math.max(1, filasS.length));
    const dias = [['lun', 'Lun'], ['mar', 'Mar'], ['mie', 'Mié'], ['jue', 'Jue'], ['vie', 'Vie'], ['sab', 'Sáb']];
    tabla(P, M, by + 14, [
      { t: 'Ejecutivo', w: 108, f: (r) => r.ejecutivo },
      { t: 'Meta sem.', w: 54, al: 'r', f: (r) => S.usd(r.sem_meta) },
      { t: 'Venta sem.', w: 54, al: 'r', f: (r) => S.usd(r.sem_venta) },
      { t: '% sem.', w: 38, al: 'r', f: (r) => S.pct(r.sem_pct), bg: (r) => luzT(r.sem_luz), boldBg: true },
      ...dias.map(([p, t]) => ({ t, w: 32, al: 'c', f: (r) => (r[p + '_fecha'] && r[p + '_fecha'] <= corte ? S.pct(r[p + '_pct']) : ''), bg: (r) => (r[p + '_fecha'] && r[p + '_fecha'] <= corte ? luzT(r[p + '_luz']) : null) })),
    ], filasS, { hh: 11, rh, size: Math.min(6.2, rh * 0.68) });

    // Política
    const rx = M + 452, rw = W - M - rx;
    P.rect(rx, by, rw, 594 - by, C.panel, C.linea);
    titulo(P, rx + 7, by + 4, 'Política de incentivos');
    let yy = by + 25;
    for (const [t, txt] of POLITICA) {
      P.text(rx + 9, yy, t, { size: 6.6, bold: true, color: C.navy2 });
      yy += 8;
      for (const l of partir(txt, rw - 18, 6.1)) { P.text(rx + 9, yy, l, { size: 6.1 }); yy += 7.3; }
      yy += 3;
    }

    // Pie
    P.line(M, 598, W - M, 598, C.linea, 0.5);
    P.text(M, 606, 'Solís Comercial · Fuente: facturas de Zoho Books por vendedor (sin anuladas ni borradores) · Montos en USD', { size: 6, color: C.gris });
    P.text(W - M, 606, 'Plan de Ventas noviembre 2026 · $430,000 · 1ª quincena 35% / 2ª quincena 65%', { size: 6, color: C.gris, align: 'right' });
    return P.ops.join('\n');
  };

  const armar = (contenido, logo) => {
    const partes = [];
    const offs = [];
    let pos = 0;
    const asc = (s) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
    const push = (u) => { partes.push(u); pos += u.length; };
    const obj = (n, cuerpo) => { offs[n] = pos; push(asc(n + ' 0 obj\n')); for (const c of cuerpo) push(typeof c === 'string' ? asc(c) : c); push(asc('\nendobj\n')); };
    push(asc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
    obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
    obj(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>']);
    obj(3, ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /Font << /F1 5 0 R /F2 6 0 R >>' + (logo ? ' /XObject << /Im1 7 0 R >>' : '') + ' >> /Contents 4 0 R >>']);
    obj(4, ['<< /Length ' + contenido.length + ' >>\nstream\n', contenido, '\nendstream']);
    obj(5, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']);
    obj(6, ['<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>']);
    const n = logo ? 7 : 6;
    if (logo) obj(7, ['<< /Type /XObject /Subtype /Image /Width ' + logo.w + ' /Height ' + logo.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + logo.bytes.length + ' >>\nstream\n', logo.bytes, '\nendstream']);
    const xref = pos;
    let x = 'xref\n0 ' + (n + 1) + '\n0000000000 65535 f \n';
    for (let i = 1; i <= n; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    push(asc(x + 'trailer\n<< /Size ' + (n + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n'));
    const out = new Uint8Array(pos);
    let o = 0;
    for (const p of partes) { out.set(p, o); o += p.length; }
    return out;
  };

  const logoJpeg = async () => {
    const r = (S.filas('logo') || [])[0];
    if (!r || typeof r.imagen !== 'string' || !r.imagen.startsWith('data:image/png;base64,')) return null;
    const img = new Image();
    img.src = r.imagen;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth * 2; c.height = img.naturalHeight * 2;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const b64 = c.toDataURL('image/jpeg', 0.92).split(',')[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { w: c.width, h: c.height, bytes };
  };

  window.SV_PDF = { construir, armar };

  const botones = document.querySelectorAll('.sv-pdf');
  const estado = (e) => {
    for (const el of document.querySelectorAll('.sv-pdf-gen')) el.hidden = e !== 'generando';
    for (const el of document.querySelectorAll('.sv-pdf-err')) el.hidden = e !== 'error';
    for (const b of botones) b.disabled = e === 'generando';
  };
  let descargas = null;
  try {
    if (window.solis && typeof window.solis.use === 'function') {
      window.solis.use('downloads').then((d) => { descargas = d; }).catch(() => {});
    }
  } catch (e) { /* sin descargas en esta vista */ }
  for (const b of botones) {
    b.addEventListener('click', async () => {
      if (!descargas) {
        try { window.print(); estado(''); } catch (e) { estado('error'); }
        return;
      }
      estado('generando');
      try {
        const logo = await logoJpeg().catch(() => null);
        const bytes = armar(construir(logo), logo);
        await descargas.save({ filename: 'Plan_de_Ventas_Nov2026_corte_' + S.corte() + '.pdf', data: bytes });
        estado('');
      } catch (e) {
        estado(e && e.code === 'declined' ? '' : 'error');
      }
    });
  }
})();
