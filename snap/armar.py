#!/usr/bin/env python3
"""
Arma las páginas de tableros/ a partir de src/ (copia fiel de los tableros de Claude).

  tableros/plan.html      Plan de Ventas (src/plan/*)
  tableros/cashback.html  Dashboard Cashback / Trade-in (src/cashback/*)
  tableros/ventas.html    Dashboard de Ventas (src/originales/ventas.html, tal cual)
  tableros/winback.html   Win-Back · Recontacto (src/originales/winback.html, tal cual)

Los dos últimos son el HTML original del artifact de Claude; solo se les agrega
<script src="conexion.js">, que les entrega los datos de /datos en lugar de Zoho en vivo.
Para traer una versión nueva desde Claude basta con reemplazar el archivo en
src/originales/ y volver a correr este script.
"""
import json, os, re, shutil

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(RAIZ)
ORG = '872034702'
COQL_CASHBACK = ("select Numero_de_Cash_Back, Fecha, Owner.first_name, Owner.last_name, Cliente.Full_Name, Marca, Modelo, IMEI, Color, Valoraci_n, "
                 "Marca_2, Modelo_2, IMEI_2, Color_2, Valoraci_n_2, Marca_3, Modelo_3, IMEI_3, Color_3, Valoraci_n_3, Total_valoraci_n, "
                 "Factura_CashBack, Estatus, Recibido_en_caja1, Recibido_en_operaciones from Cash_Back where id is not null order by Fecha desc limit 2000")


def leer(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def escribir(p, s):
    with open(p, 'w', encoding='utf-8') as f:
        f.write(s)


def pagina(titulo, fuentes, cuerpo, inline, srcs):
    h = f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>{titulo}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="motor.css">
<script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
<script src="conexion.js"></script>
<script>
/* Fuentes de datos del tablero: las mismas consultas a Zoho del tablero de Claude (se responden con /datos) y las tablas fijas del plan */
window.FUENTES = {json.dumps(fuentes, ensure_ascii=False, separators=(',', ':'))};
</script>
<script src="motor.js"></script>
</head>
<body>
<div id="dash-root">
'''
    b = cuerpo + '\n</div>\n' + ''.join('<script>\n' + s + '\n</script>\n' for s in inline) + ''.join(f'<script src="{s}"></script>\n' for s in srcs)
    return h + b + '</body>\n</html>\n'


def con_conexion(html):
    """Agrega conexion.js antes del primer <script> del documento original."""
    if 'src="conexion.js"' in html:
        return html
    i = html.find('<script')
    if i < 0:
        i = html.find('</head>')
    return html[:i] + '<script src="conexion.js"></script>\n' + html[i:]


# ---- Plan de Ventas
F = json.loads(leer('src/plan/fuentes.json'))
logo = F['logo']['filas'][0]['imagen']
for n in ['calculos', 'dibujos', 'pdf']:
    shutil.copy(f'src/plan/{n}.js', f'tableros/plan-{n}.js')
escribir('tableros/plan.html', pagina('Plan de Ventas · Noviembre 2026 · Solís Comercial', F, leer('src/plan/pagina.html'), [],
                                      ['plan-calculos.js', 'plan-dibujos.js', 'plan-pdf.js']))

# ---- Cashback
ex = json.loads(leer('src/cashback/existencias_imei.json'))
FC = {
    'cashback': {'server': 'Zoho CRM', 'tool': 'executeCOQLQuery', 'args': {'body': {'select_query': COQL_CASHBACK}}},
    'ventas': {'server': 'Zoho Books', 'tool': 'list_invoices', 'args': {'query_params': {'date_end': '2099-12-31', 'date_start': '2025-05-01', 'organization_id': ORG, 'per_page': 1, 'response_option': 3}}},
    'existencias_imei': {'filas': ex['filas']},
}
escribir('tableros/cashback.html', pagina('Dashboard de Cashback / Trade-in · Solís Comercial', FC, leer('src/cashback/pagina.html').replace('__LOGO__', logo),
                                          [leer('src/cashback/datos.js'), leer('src/cashback/dibujo.js'), leer('src/cashback/existencias.js')], []))

# ---- Ventas y Win-Back: HTML original de Claude + conexion.js
AJUSTES = {
    # El detalle de categorías y marcas se lee factura por factura (get_invoice): solo existe en el tablero de Claude.
    # El desglose por categoría y marca usa datos/lineas.json; las facturas aún sin detalle se completan en la siguiente actualización.
    'ventas': [('${S.linesFailed} facturas no pudieron leerse y no están incluidas.', '${S.linesFailed} facturas recientes aún no tienen su detalle en esta copia; se suman en la próxima actualización.')],
    'winback': [],
}
for n in ['ventas', 'winback']:
    h = con_conexion(leer(f'src/originales/{n}.html'))
    for a, b in AJUSTES[n]:
        if a in h:
            h = h.replace(a, b)
        else:
            print(f'AVISO: {n}: no se encontró el texto a ajustar: {a[:60]}')
    escribir(f'tableros/{n}.html', h)

print('Tableros armados: plan, cashback, ventas, winback')
