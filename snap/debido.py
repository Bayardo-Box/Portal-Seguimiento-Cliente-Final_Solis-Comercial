"""Dice qué tableros toca actualizar ahora según snap/calendario.json.
Uso: python3 snap/debido.py [--todos] [HH:MM]   -> imprime 'TABLEROS: a b' y 'DATOS: x y' (o 'NADA')
"""
import json, os, sys, datetime, zoneinfo
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cal = json.load(open(os.path.join(RAIZ, 'snap', 'calendario.json'), encoding='utf-8'))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
if args:
    h, m = map(int, args[0].split(':')); ahora = h * 60 + m
else:
    n = datetime.datetime.now(zoneinfo.ZoneInfo(cal['zona'])); ahora = n.hour * 60 + n.minute
tol = cal.get('tolerancia_min', 40)
tabs = []
for k, t in cal['tableros'].items():
    if '--todos' in sys.argv or any(abs(ahora - (int(c[:2]) * 60 + int(c[3:]))) <= tol for c in t['cortes']):
        tabs.append(k)
if not tabs:
    print('NADA'); sys.exit(0)
datos = []
for k in tabs:
    for d in cal['tableros'][k]['datos']:
        if d not in datos: datos.append(d)
print('TABLEROS:', ' '.join(tabs)); print('DATOS:', ' '.join(datos))
