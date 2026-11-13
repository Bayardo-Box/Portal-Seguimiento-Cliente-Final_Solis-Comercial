#!/usr/bin/env python3
"""
Importa a datos/ las respuestas de Zoho guardadas por Claude durante una
actualización programada del portal (ver snap/ACTUALIZAR.md).

Uso:
  python3 snap/zoho.py paginas TOTAL                 -> per_page y número de páginas para list_invoices
  python3 snap/zoho.py offsets TOTAL                 -> offsets COQL (bloques de 1000)
  python3 snap/zoho.py facturas AAAA-MM ARCHIVO...   -> datos/facturas_AAAA-MM.json.gz
  python3 snap/zoho.py coql NOMBRE ARCHIVO...        -> datos/NOMBRE.json.gz  (cashback, wb_fac, wb_may, wb_pot)
  python3 snap/zoho.py may ARCHIVO                  -> datos/wb_may.json.gz (clientes mayoristas; respuesta COQL o lista JSON de ids)
  python3 snap/zoho.py totales AAAA-MM TOTAL NUM     -> datos/totales.json (facturado bruto del mes, todas las facturas)
  python3 snap/zoho.py estados ESTADO ARCHIVO...     -> datos/totales.json (anuladas 'void' o borrador 'draft' por mes)
  python3 snap/zoho.py cerrar                        -> datos/meta.json con la hora de corte
  python3 snap/zoho.py revisar                       -> resumen de lo que hay en datos/

ARCHIVO es el archivo donde Claude guardó la respuesta de la herramienta
(/tmp/claude-tool-results/...txt) o un .json escrito a mano con la respuesta.
"""
import gzip, json, os, sys, datetime

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, 'datos')
CAMPOS_FACT = ['invoice_id', 'invoice_number', 'date', 'created_time', 'salesperson_id', 'salesperson_name', 'location_name', 'status', 'total']
os.makedirs(DATOS, exist_ok=True)


def leer(ruta):
    with open(ruta, encoding='utf-8') as f:
        txt = f.read().strip()
    d = json.loads(txt)
    # respuestas envueltas como [{"type":"text","text":"..."}] o {"content":[...]}
    if isinstance(d, list) and d and isinstance(d[0], dict) and 'text' in d[0]:
        d = json.loads(''.join(x.get('text', '') for x in d))
    if isinstance(d, dict) and isinstance(d.get('content'), list):
        d = json.loads(''.join(x.get('text', '') for x in d['content']))
    if isinstance(d, dict) and d.get('status') == 'failure':
        raise SystemExit(f'ERROR: {ruta} es una respuesta fallida de Zoho: {json.dumps(d)[:300]}')
    return d.get('data', d) if isinstance(d, dict) else d


def guardar_gz(nombre, obj):
    ruta = os.path.join(DATOS, nombre + '.json.gz')
    with gzip.open(ruta, 'wt', encoding='utf-8', compresslevel=9) as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))
    return ruta


def json_leer(nombre, defecto):
    ruta = os.path.join(DATOS, nombre)
    if os.path.exists(ruta):
        with open(ruta, encoding='utf-8') as f:
            return json.load(f)
    return defecto


def json_guardar(nombre, obj):
    with open(os.path.join(DATOS, nombre), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def paginas(total):
    total = int(total)
    if total <= 0:
        print('per_page=200 paginas=1'); return
    # Cada página debe traer al menos 40 facturas para que la respuesta se guarde en archivo.
    mejor = None
    for p in range(200, 39, -1):
        n = -(-total // p); ult = total - (n - 1) * p
        if ult >= 40 or n == 1:
            mejor = (p, n); break
    p, n = mejor or (200, -(-total // 200))
    print(f'per_page={p} paginas={n}  (pide page=1..{n}; la última trae {total - (n - 1) * p} facturas)')


def offsets(total):
    total = int(total)
    offs = list(range(0, max(total, 1), 1000))
    if len(offs) > 1 and total - offs[-1] < 200:
        offs[-1] = total - 1000  # se superpone con la anterior; los duplicados se quitan al importar
    print('offsets=' + ','.join(str(o) for o in offs) + f'  ({len(offs)} consultas de 1000)')


def facturas(mes, archivos):
    vistos, filas, esperado = set(), [], None
    for a in archivos:
        d = leer(a)
        if d.get('code') not in (0, None):
            raise SystemExit(f'ERROR: {a}: {d.get("message")}')
        for inv in d.get('invoices', []):
            if inv['invoice_id'] in vistos: continue
            if not str(inv.get('date', '')).startswith(mes):
                continue
            vistos.add(inv['invoice_id'])
            filas.append({k: inv.get(k) for k in CAMPOS_FACT})
    filas.sort(key=lambda r: (r['date'] or '', r['created_time'] or ''))
    ruta = guardar_gz('facturas_' + mes, {'mes': mes, 'importado': ahora(), 'invoices': filas})
    tot = json_leer('totales.json', {})
    info = tot.get(mes, {})
    if info.get('n') and len(filas) < info['n']:
        print(f'AVISO: {mes}: importadas {len(filas)} facturas pero Zoho reporta {info["n"]}. Falta alguna página.')
    print(f'OK {ruta}: {len(filas)} facturas de {mes} desde {len(archivos)} archivos')


def coql(nombre, archivos):
    filas, vistos = [], set()
    for a in archivos:
        d = leer(a)
        rows = d.get('data') if isinstance(d, dict) else None
        if not isinstance(rows, list):
            raise SystemExit(f'ERROR: {a} no parece una respuesta COQL')
        for r in rows:
            k = r.get('id') or json.dumps(r.get('Contact_Name'), sort_keys=True) or json.dumps(r, sort_keys=True)
            if k in vistos: continue
            vistos.add(k); filas.append(r)
    if nombre in ('wb_fac', 'wb_pot', 'cashback'):
        filas.sort(key=lambda r: int(r['id']) if str(r.get('id', '')).isdigit() else 0)
    if nombre == 'cashback':
        filas.sort(key=lambda r: r.get('Fecha') or '', reverse=True)
    ruta = guardar_gz(nombre, {'importado': ahora(), 'data': filas})
    print(f'OK {ruta}: {len(filas)} registros desde {len(archivos)} archivos')


def may(archivo):
    with open(archivo, encoding='utf-8') as f:
        txt = f.read().strip()
    d = json.loads(txt)
    if isinstance(d, list) and all(isinstance(x, (str, int)) for x in d):
        ids = [str(x) for x in d]
    else:
        d = leer(archivo)
        ids = [str((r.get('Contact_Name') or {}).get('id')) for r in d.get('data', []) if r.get('Contact_Name')]
    ids = sorted(set(ids))
    ruta = guardar_gz('wb_may', {'importado': ahora(), 'data': [{'Contact_Name': {'id': i}} for i in ids]})
    print(f'OK {ruta}: {len(ids)} clientes mayoristas')


def totales(mes, total, n):
    tot = json_leer('totales.json', {})
    m = tot.setdefault(mes, {})
    m['total'] = float(total); m['n'] = int(n)
    json_guardar('totales.json', dict(sorted(tot.items())))
    print(f'OK totales {mes}: {m}')


def estados(estado, archivos):
    col = {'void': 'void', 'draft': 'draft'}[estado]
    tot = json_leer('totales.json', {})
    acc, vistos = {}, set()
    for a in archivos:
        d = leer(a)
        for inv in d.get('invoices', []):
            if inv['invoice_id'] in vistos: continue
            vistos.add(inv['invoice_id'])
            mes = str(inv.get('date', ''))[:7]
            t, n = acc.get(mes, (0.0, 0))
            acc[mes] = (t + float(inv.get('total') or 0), n + 1)
    for mes, m in tot.items():
        t, n = acc.get(mes, (0.0, 0))
        m[col + '_total'] = round(t, 2); m[col + '_n'] = n
    for mes, (t, n) in acc.items():
        if mes not in tot:
            tot[mes] = {col + '_total': round(t, 2), col + '_n': n}
    json_guardar('totales.json', dict(sorted(tot.items())))
    print(f'OK {estado}: {len(vistos)} facturas en {len(acc)} meses')


def ahora():
    return (datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - datetime.timedelta(hours=6)).strftime('%Y-%m-%dT%H:%M:%S-06:00')


def cerrar():
    meta = json_leer('meta.json', {})
    meta['corte'] = ahora()
    meta['meses_facturas'] = sorted(f[9:16] for f in os.listdir(DATOS) if f.startswith('facturas_') and f.endswith('.json.gz'))
    json_guardar('meta.json', meta)
    print('OK corte', meta['corte'])


def revisar():
    for f in sorted(os.listdir(DATOS)):
        ruta = os.path.join(DATOS, f)
        extra = ''
        if f.endswith('.gz'):
            with gzip.open(ruta, 'rt', encoding='utf-8') as g:
                o = json.load(g)
            extra = f"{len(o.get('invoices', o.get('data', [])))} filas · importado {o.get('importado')}"
        print(f'{f:32s} {os.path.getsize(ruta):>10,d} B  {extra}')


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit(1)
    c = a[0]
    if c == 'paginas': paginas(a[1])
    elif c == 'offsets': offsets(a[1])
    elif c == 'facturas': facturas(a[1], a[2:])
    elif c == 'coql': coql(a[1], a[2:])
    elif c == 'may': may(a[1])
    elif c == 'totales': totales(a[1], a[2], a[3])
    elif c == 'estados': estados(a[1], a[2:])
    elif c == 'cerrar': cerrar()
    elif c == 'revisar': revisar()
    else: print(__doc__); sys.exit(1)
