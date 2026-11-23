"""Escribe datos/manifest.json: la 'foto' publicada de cada tablero (corte, archivos, huella).
Uso: python3 snap/manifiesto.py [tablero ...]   (sin argumentos: todos los tableros)
Los tableros indicados reciben el corte actual; los demás conservan el suyo.
"""
import json, os, sys, glob, hashlib, datetime, zoneinfo
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(RAIZ, 'datos')
cal = json.load(open(os.path.join(RAIZ, 'snap', 'calendario.json'), encoding='utf-8'))
meta = json.load(open(os.path.join(D, 'meta.json'), encoding='utf-8'))
ruta = os.path.join(D, 'manifest.json')
man = json.load(open(ruta, encoding='utf-8')) if os.path.exists(ruta) else {}
hoy = sys.argv[1:] or list(cal['tableros'])
man['version'] = 1
man['generado'] = meta['corte']
man.setdefault('tableros', {})
for k, t in cal['tableros'].items():
    ent = man['tableros'].get(k, {})
    arch = []
    for d in t['datos']:
        for pat in cal['archivos_por_dato'][d]:
            for f in sorted(glob.glob(os.path.join(D, pat))):
                h = hashlib.sha256(open(f, 'rb').read()).hexdigest()[:12]
                arch.append({'f': os.path.basename(f), 'bytes': os.path.getsize(f), 'sha': h})
    ent.update({'nombre': t['nombre'], 'html': t['html'], 'archivos': arch})
    if k in hoy: ent['corte'] = meta['corte']
    ent.setdefault('corte', meta['corte'])
    man['tableros'][k] = ent
json.dump(man, open(ruta, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('OK manifest', ', '.join(f"{k}={v['corte'][11:16]}" for k, v in man['tableros'].items()))
