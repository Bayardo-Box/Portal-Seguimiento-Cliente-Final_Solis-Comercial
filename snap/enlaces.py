#!/usr/bin/env python3
"""Hace que los accesos del Hub (index.html) abran las copias web de los tableros y no claude.ai.
Se corre en cada actualización (lo llama snap/armar.py), así que si se vuelve a subir un
index.html con enlaces a Claude, queda corregido en la siguiente actualización."""
import os, re
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(RAIZ, 'index.html')
MAPA = {
    'XDe8RRdE611GQiy6rTqaft': 'tableros/plan.html',
    '2aAKwSKwageVUqk67G1VKZ': 'tableros/ventas.html',
    '3hYGc15NWePqJ8qU1b4nc7': 'tableros/winback.html',
    'E6CLGwLyLM57kygT1GU1iG': 'tableros/cashback.html',
}
s = open(P, encoding='utf-8').read()
n0 = s
for slug, dest in MAPA.items():
    s = re.sub(r'https://claude\.ai/(?:public/)?artifacts?/' + slug + r'[^"\'\s]*', dest, s)
s = s.replace("const safeUrl = u => /^https:\\/\\//i.test(String(u || '')) ? u : '';",
              "const safeUrl = u => /^(https:\\/\\/|tableros\\/[\\w-]+\\.html$)/i.test(String(u || '')) ? u : '';")
quedan = re.findall(r'https://claude\.ai/[^"\'\s]*', s)
if s != n0:
    open(P, 'w', encoding='utf-8').write(s)
    print('index.html: accesos apuntan a tableros/*.html')
else:
    print('index.html: sin cambios')
if quedan:
    print('AVISO: quedan enlaces a claude.ai:', quedan)
