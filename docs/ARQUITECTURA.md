# Arquitectura «foto programada» del portal

Los asesores abren una URL pública y ven una **foto fija** de cada tablero. La página nunca consulta Zoho:
solo lee archivos estáticos del mismo sitio. Zoho lo lee únicamente la tarea programada de Claude.

## Flujo (por corte)
1. **Despertar.** La tarea programada de Claude arranca cada hora a los :45 (6:45–18:45, Managua).
2. **Decidir.** `python3 snap/debido.py` lee `snap/calendario.json` y dice qué tableros tocan en esa hora. Si ninguno, termina.
3. **Leer Zoho.** Claude, con los conectores (solo lectura), baja los datos que esos tableros necesitan y los guarda con `snap/zoho.py` en `datos/*.json(.gz)`.
4. **Armar.** `snap/armar.py` regenera las páginas desde `src/` y reescribe los enlaces del Hub.
5. **Sellar.** `snap/zoho.py cerrar <tableros>` escribe `datos/meta.json` y `datos/manifest.json` (corte, archivos y huella de cada tablero).
6. **Verificar.** `snap/verificar.py` falla si alguna página llama a Zoho u otro servidor.
7. **Publicar.** `git push` a `main`; Cloudflare publica `portal-seguimiento-cliente-final-solis-comercial.operaciones-soliscomercial.workers.dev` en 1–2 minutos.
8. **Abrir (asesor).** El navegador descarga el HTML y `tableros/conexion.js`, que responde a las consultas del tablero leyendo `/datos/*`. Sin login, sin Zoho, sin Claude.

## Estructura
```
index.html              Hub (4 accesos a tableros/*.html)
tableros/*.html         Interfaz (no cambia entre cortes)
tableros/conexion.js    Único punto de lectura: solo pide /datos/* del mismo sitio
datos/*.json(.gz)       Datos de la foto (lo único que cambia en cada corte)
datos/meta.json         Hora del último corte
datos/manifest.json     Foto de cada tablero: corte, archivos, tamaño y huella
snap/calendario.json    Cortes por tablero (editable)
snap/debido.py          Qué toca ahora
snap/zoho.py, lineas.py, armar.py, enlaces.py, manifiesto.py   Herramientas de actualización
snap/verificar.py       Prueba «no consulta Zoho»
snap/ACTUALIZAR.md      Instrucciones que sigue Claude
src/                    Fuentes de los tableros
_headers                Reglas de Cloudflare
```

## Garantía de que el enlace no consulta Zoho
- **En el código:** solo `conexion.js` usa `fetch`, y solo hacia `/datos/`. `verificar.py` lo comprueba en cada corte.
- **En el navegador:** `_headers` envía `Content-Security-Policy: connect-src 'self'`; el navegador bloquea cualquier petición de datos a otro dominio, incluido Zoho.
- **En el sitio:** no hay claves ni tokens de Zoho; el repositorio solo tiene datos ya leídos.
- **En el acceso:** no hay Cloudflare Access ni login; el enlace es abierto.

## Cambiar el calendario
Edita `cortes` de cada tablero en `snap/calendario.json` (hora de Managua) y súbelo. La tarea sigue despertando cada hora; solo actualiza lo que toque.
Si quieres menos corridas, cambia también la hora de la tarea programada.

## Límites conocidos
- El botón «Actualizar» de los tableros dentro de Claude no publica en la web; la web solo cambia con un corte o con «actualizar ahora».
- Cambios de diseño de Plan de Ventas y Cashback se sincronizan a pedido.
- Win-Back en la web es de consulta (sin asignar ni notas).
