#!/usr/bin/env python3
"""
Detalle de líneas por factura para el desglose por categoría y marca del Dashboard de Ventas.

El tablero de Claude lee cada factura con get_invoice. La copia web usa datos/lineas.json,
que se llena poco a poco: cada actualización lee solo las facturas que faltan.

  python3 snap/lineas.py pendientes [MAX]   -> ids de facturas sin detalle (mes actual y mismo periodo del año pasado)
  python3 snap/lineas.py agregar ARCHIVO... -> guarda el detalle. ARCHIVO puede ser:
       · la respuesta de get_invoice guardada en archivo por Claude, o
       · un .jsonl escrito a mano, una factura por línea:
         {"id": "5776851000071234567", "l": [["<account_name>", "<marca>", <item_total>], ...]}
         (account_name y marca tal como vienen en cada línea; marca = campo cf_marca, o "" si no tiene)
  python3 snap/lineas.py revisar            -> cuántas facturas tienen detalle y cuántas faltan
"""
import datetime, gzip, json, os, re, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATOS = os.path.join(RAIZ, 'datos')
ARCH = os.path.join(DATOS, 'lineas.json')
EXCLUDE = re.compile(r'mayorista|luis|artola|bryan|carballo', re.I)  # igual que el Dashboard de Ventas


def hoy():
    return (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(hours=6)).date()


def cargar():
    if os.path.exists(ARCH):
        with open(ARCH, encoding='utf-8') as f:
            return json.load(f)
    return {}


def guardar(d):
    with open(ARCH, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, separators=(',', ':'), sort_keys=True)


def facturas(mes):
    p = os.path.join(DATOS, f'facturas_{mes}.json.gz')
    if not os.path.exists(p):
        return None
    with gzip.open(p, 'rt', encoding='utf-8') as f:
        return json.load(f)['invoices']


def necesarias():
    t = hoy()
    out, faltan_meses = [], []
    for y in (t.year, t.year - 1):
        mes = f'{y}-{t.month:02d}'
        corte = f'{y}-{t.month:02d}-{t.day:02d}'
        inv = facturas(mes)
        if inv is None:
            faltan_meses.append(mes); continue
        for i in inv:
            if i['date'] > corte or i['status'] in ('void', 'draft'):
                continue
            if EXCLUDE.search(i.get('salesperson_name') or ''):
                continue
            out.append((y, i['date'], i['invoice_id']))
    return out, faltan_meses


def pendientes(maximo=None):
    d = cargar()
    nec, fm = necesarias()
    # primero lo más reciente del año actual, luego el comparativo
    falt = [x for x in sorted(nec, key=lambda r: (-r[0], r[1]), reverse=False) if x[2] not in d]
    falt.sort(key=lambda r: (r[0] != hoy().year, r[1]), reverse=False)
    if fm:
        print('AVISO: faltan las facturas de', ', '.join(fm))
    sel = falt[:maximo] if maximo else falt
    print(f'# {len(falt)} facturas sin detalle; se listan {len(sel)}')
    for _, _, i in sel:
        print(i)


def de_respuesta(obj):
    """Extrae [[account_name, marca, total], ...] de una respuesta de get_invoice."""
    if isinstance(obj, list) and obj and isinstance(obj[0], dict) and 'text' in obj[0]:
        obj = json.loads(''.join(x.get('text', '') for x in obj))
    d = obj.get('data', obj) if isinstance(obj, dict) else {}
    inv = d.get('invoice') or {}
    if not inv.get('invoice_id'):
        return None, None
    ls = []
    for li in inv.get('line_items') or []:
        amt = float(li.get('item_total') or 0)
        if not amt:
            continue
        marca = ''
        for f in li.get('item_custom_fields') or []:
            if f.get('api_name') == 'cf_marca' or str(f.get('label', '')).upper() == 'MARCA':
                marca = f.get('value_formatted') or f.get('value') or ''
                break
        ls.append([li.get('account_name') or '', marca, round(amt, 2)])
    return inv['invoice_id'], ls


def agregar(archivos):
    d = cargar(); n = 0
    for a in archivos:
        txt = open(a, encoding='utf-8').read().strip()
        try:
            obj = json.loads(txt)
            i, ls = de_respuesta(obj)
            if i:
                d[i] = ls; n += 1; continue
        except json.JSONDecodeError:
            pass
        for linea in txt.splitlines():
            linea = linea.strip()
            if not linea:
                continue
            r = json.loads(linea)
            ls = [[str(x[0] or ''), str(x[1] or ''), round(float(x[2]), 2)] for x in r['l'] if float(x[2] or 0)]
            d[str(r['id'])] = ls; n += 1
    guardar(d)
    print(f'OK {n} facturas agregadas · {len(d)} con detalle en total')


def revisar():
    d = cargar(); nec, fm = necesarias()
    tiene = sum(1 for x in nec if x[2] in d)
    print(f'{tiene} de {len(nec)} facturas del periodo tienen detalle · faltan {len(nec) - tiene}')


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(__doc__); sys.exit(1)
    if a[0] == 'pendientes': pendientes(int(a[1]) if len(a) > 1 else None)
    elif a[0] == 'agregar': agregar(a[1:])
    elif a[0] == 'revisar': revisar()
    else: print(__doc__); sys.exit(1)
