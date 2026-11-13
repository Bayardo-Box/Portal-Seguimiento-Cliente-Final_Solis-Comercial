# Actualización de datos del portal (Claude · 7:00, 12:00, 15:00 y 18:00 Managua)

Este procedimiento lo ejecuta Claude con los conectores **Zoho Books** y **Zoho CRM**. Lee Zoho,
guarda una copia de datos en `datos/` y la sube a GitHub; Cloudflare Pages publica el sitio solo.
Los tableros (`tableros/*.html`) son copias fieles de los de Claude: no se tocan en una actualización.

Reglas:
- Nunca escribas a mano una respuesta grande de Zoho. Las respuestas grandes quedan guardadas en un
  archivo (`/tmp/claude-tool-results/...` o `.../toolu_...json`): pasa esa ruta a `snap/zoho.py`.
- Si una respuesta pequeña llega en pantalla (no en archivo), cópiala tal cual a un `.json` en `/tmp/snap/`.
- Solo lecturas en Zoho. Si un paso falla dos veces, sigue con los demás y avísalo al final.
- Organización de Zoho Books: `872034702`. Hora: America/Managua (UTC-6).

## 0. Preparar
```bash
cd <carpeta del repositorio>   # Bayardo-Box/Portal-Seguimiento-Cliente-Final_Solis-Comercial
mkdir -p /tmp/snap
```
Define `MES` = mes actual (AAAA-MM) y `ULT` = último día del mes.

## 1. Facturas del mes (Plan de Ventas, Dashboard de Ventas y Cashback)
1. Zoho Books `list_invoices` con `{organization_id, date_start: MES-01, date_end: ULT, per_page: 1, response_option: 3}`.
   Toma `page_context.total` (N) y `page_context.sum_columns.total` (S):
   `python3 snap/zoho.py totales MES S N`
2. `python3 snap/zoho.py paginas N` → indica `per_page` (P) y el número de páginas (K).
3. Para page = 1..K: `list_invoices` con `{organization_id, date_start: MES-01, date_end: ULT, per_page: P, page, sort_column: "created_time", sort_order: "A"}`.
4. `python3 snap/zoho.py facturas MES <archivo1> … <archivoK>` (debe decir OK sin AVISO).
5. Si es el día 1 del mes, repite 1–4 una vez para el mes anterior (cierre).
6. Si NO existe `datos/facturas_<MES del año pasado>.json.gz` (comparativo interanual del Dashboard de Ventas),
   repite 1–4 para ese mes del año pasado (solo una vez por mes).

## 1b. Detalle de líneas (desglose por categoría y marca del Dashboard de Ventas)
Hazlo después del paso 1 (necesita las facturas del mes y del mismo mes del año pasado).
1. `python3 snap/lineas.py pendientes 60` → lista hasta 60 ids de facturas sin detalle.
2. Para cada id: Zoho Books `get_invoice` con `{path_variables: {invoice_id: ID}, query_params: {organization_id: "872034702"}}`.
   - Si la respuesta quedó guardada en archivo, anota la ruta.
   - Si llegó en pantalla, agrega UNA línea a `/tmp/snap/lineas.jsonl` con el id y, por cada línea de la factura
     con `item_total` distinto de 0, `[account_name, marca, item_total]` (marca = valor del campo personalizado
     `cf_marca` de esa línea, o "" si no tiene). Ejemplo:
     `{"id": "5776851000064538141", "l": [["Ingresos por ventas de celulares", "SAMSUNG", 189.0]]}`
     Copia account_name y marca exactamente como vienen.
3. `python3 snap/lineas.py agregar /tmp/snap/lineas.jsonl <archivos guardados…>` y `python3 snap/lineas.py revisar`.
Si quedan pendientes, se completan en las siguientes corridas.

## 2. Cashback (Zoho CRM)
`executeCOQLQuery` con:
```
select Numero_de_Cash_Back, Fecha, Owner.first_name, Owner.last_name, Cliente.Full_Name, Marca, Modelo, IMEI, Color, Valoraci_n, Marca_2, Modelo_2, IMEI_2, Color_2, Valoraci_n_2, Marca_3, Modelo_3, IMEI_3, Color_3, Valoraci_n_3, Total_valoraci_n, Factura_CashBack, Estatus, Recibido_en_caja1, Recibido_en_operaciones from Cash_Back where id is not null order by Fecha desc limit 2000
```
`python3 snap/zoho.py coql cashback <archivo>`

## 3. Win-Back (Zoho CRM)
Conteos (respuestas pequeñas):
- `select COUNT(id) from CustomModule5001 where (Sales_Person not in ('Mayorista','MAYORISTA - MY')) and (Status not in ('nulo','Borrador'))` → NF
- `select COUNT(id) from Contacts where Estado_del_Contacto in ('Nuevo','Nuevo ingreso','Contactado','En Seguimiento','Descartado')` → NP

`python3 snap/zoho.py offsets NF` y `python3 snap/zoho.py offsets NP` dan los OFFSET. Para cada uno:
- Facturas: `select Name, Invoice_ID, Invoice_Date, Grand_Total, Sales_Person, Contact_Name, Contact_Name.Mobile, Contact_Name.Phone, Contact_Name.Email, Contact_Name.Owner, Contact_Name.Categor_a_de_Inter_s, Contact_Name.Marca, Contact_Name.Estado_del_Contacto from CustomModule5001 where (Sales_Person not in ('Mayorista','MAYORISTA - MY')) and (Status not in ('nulo','Borrador')) order by id asc limit OFFSET, 1000`
- Potenciales: `select Full_Name, Mobile, Phone, Email, Owner, Estado_del_Contacto, Categor_a_de_Inter_s, Marca, Lead_Source, Campa_a, Created_Time, Fecha_de_recontacto, Last_Activity_Time from Contacts where Estado_del_Contacto in ('Nuevo','Nuevo ingreso','Contactado','En Seguimiento','Descartado') order by id asc limit OFFSET, 1000`

`python3 snap/zoho.py coql wb_fac <archivos…>` y `python3 snap/zoho.py coql wb_pot <archivos…>`

Solo en la corrida de las 7:00 de los lunes: clientes mayoristas
`select Contact_Name, COUNT(id) from CustomModule5001 where (Sales_Person in ('Mayorista','MAYORISTA - MY')) and (Status not in ('nulo','Borrador')) group by Contact_Name limit 2000`.
Si llega en archivo: `python3 snap/zoho.py may <archivo>`. Si llega en pantalla, escribe en `/tmp/snap/may.json`
SOLO la lista de ids (`["6600642000000564852", …]`) y corre `python3 snap/zoho.py may /tmp/snap/may.json`.

## 4. Tableros de Ventas y Win-Back al día (diseño)
Con la herramienta de artifacts `read_file` y `paths: ["index.html"]` (guarda el archivo en disco):
- Dashboard de Ventas: slug `0cba6e45-65fe-49c9-a481-9f39fc409294` → copia a `src/originales/ventas.html`
- Win-Back: slug `15db4c60-1c4d-4d8d-b503-634668daa3a0` → copia a `src/originales/winback.html`
Luego `python3 snap/armar.py`. (Plan de Ventas y Cashback guardan su diseño en la base de datos del
artifact; esos se sincronizan a pedido del administrador, no en la rutina.)

## 5. Cerrar y publicar
```bash
python3 snap/zoho.py cerrar
python3 snap/zoho.py revisar
python3 snap/lineas.py revisar
git add -A datos src tableros
git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit -q -m "Datos: corte $(TZ=America/Managua date '+%Y-%m-%d %H:%M')" || true
git push origin HEAD:main
```
Para no llenar el repositorio con copias viejas: si el último commit ya era «Datos: …», usa
`git commit --amend` y `git push --force-with-lease origin HEAD:main`.

## 6. Informe final
Una línea: hora de corte, venta acumulada del mes (de `datos/totales.json`) y cualquier paso que falló.
