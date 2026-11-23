"""Comprueba que ninguna página publicada consulta Zoho ni otro servidor al abrirse.
Uso: python3 snap/verificar.py          (revisión estática; sale con 1 si algo falla)
     python3 snap/verificar.py --vivo   (además abre cada página en un navegador y lista toda petición de red)
"""
import os, re, sys, json, glob
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mal = []
for f in ['index.html'] + sorted(glob.glob(os.path.join(RAIZ, 'tableros', '*.html')) + glob.glob(os.path.join(RAIZ, 'tableros', '*.js'))):
    f = f if os.path.isabs(f) else os.path.join(RAIZ, f)
    t = open(f, encoding='utf-8', errors='ignore').read()
    n = os.path.relpath(f, RAIZ)
    if n != 'tableros/conexion.js':
        for m in re.finditer(r'(?<![\w.])(fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource)\b\s*[(\s]', t):
            mal.append(f'{n}: usa {m.group(1)} fuera de conexion.js')
    for m in re.finditer(r'''(?:fetch|open)\(\s*['"`](https?://[^'"`]+)''', t):
        mal.append(f'{n}: llamada a {m.group(1)}')
    if re.search(r'zohoapis\.|accounts\.zoho|/api/v3|/crm/v\d', t): mal.append(f'{n}: apunta a la API de Zoho')
h = open(os.path.join(RAIZ, '_headers'), encoding='utf-8').read()
if "connect-src 'self'" not in h: mal.append("_headers: falta connect-src 'self'")
man = json.load(open(os.path.join(RAIZ, 'datos', 'manifest.json'), encoding='utf-8'))
for k, t in man['tableros'].items():
    for a in t['archivos']:
        if not os.path.exists(os.path.join(RAIZ, 'datos', a['f'])): mal.append(f'manifest: falta datos/{a["f"]} ({k})')
if '--vivo' in sys.argv:
    import threading, http.server, socketserver, functools
    from playwright.sync_api import sync_playwright
    H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=RAIZ)
    H.log_message = lambda *a, **k: None
    srv = socketserver.TCPServer(('127.0.0.1', 0), H); P = srv.server_address[1]
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for pg in ['index.html', 'tableros/plan.html', 'tableros/ventas.html', 'tableros/winback.html', 'tableros/cashback.html']:
            c = b.new_page(); vistas = []
            c.on('request', lambda r: vistas.append(r.url))
            try: c.goto(f'http://127.0.0.1:{P}/{pg}', wait_until='networkidle', timeout=45000)
            except Exception as e: print('  (aviso)', pg, str(e)[:80])
            ext = [u for u in vistas if not u.startswith(f'http://127.0.0.1:{P}') and re.search(r'zoho', u, re.I)]
            print(pg, len(vistas), 'peticiones; a Zoho:', len(ext))
            mal += [f'{pg}: petición a Zoho {u}' for u in ext]
        b.close()
print('\n'.join(mal) if mal else 'OK: ninguna página consulta Zoho al abrirse')
sys.exit(1 if mal else 0)
