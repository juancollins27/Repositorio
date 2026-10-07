# Panel Comercial — Retail

Panel de gestión comercial para una empresa de retail: sucursales, vendedores,
catálogo de productos con stock, registro de ventas, objetivos mensuales por
sucursal y un dashboard con KPIs y gráficos.

## Cómo probarlo

```bash
npm install
npm start
```

Abrí `http://localhost:3000`.

## Qué incluye

- **Dashboard**: ventas totales del período, % de cumplimiento de objetivo,
  ticket promedio, gráfico de tendencia de ventas por día, gráfico de ventas
  por sucursal, ranking de vendedores, ranking de productos más vendidos y
  alerta de productos con stock bajo.
- **Sucursales / Vendedores / Productos**: catálogos maestros. Cada sucursal
  tiene un `formato` (Market/Express). Cada producto tiene `stock` y
  `stockMinimo`; cuando el stock cae por debajo del mínimo, aparece resaltado
  en rojo y se lista en el dashboard.
- **Ventas**: registrar una venta descuenta stock del producto automáticamente
  y calcula el total (cantidad × precio unitario).
- **Objetivos**: metas de venta mensuales por sucursal, usadas para calcular
  el % de cumplimiento en el dashboard.
- **Productividad**: carga mensual de artículos, tickets, colaboradores y
  horas-hombre por sucursal. Calcula artículos/ticket, tickets y artículos
  por colaborador y por hora, compara cada sucursal contra el promedio de la
  empresa o contra el promedio de su propio formato (Market/Express), y
  arma un ranking. **Viene precargado con los datos reales de Kilbel
  (Enero–Agosto 2026, 12 sucursales)** tomados de `Productividad Suc
  2026.xlsx`, hoja "Carga mensual" — los números fueron validados contra el
  Radar de Productividad existente (coinciden exactamente los promedios YTD
  y las brechas por formato). El período a analizar y contra qué comparar
  (empresa o formato) se elige con los controles de arriba de la pestaña.

- **Quiebres de Stock**: subís un export de ventas por SKU y sucursal (misma
  estructura que la hoja "Matriz completa": SKU, Departamento, Rubro,
  Familia, Marca, Descripción, Tam, y una columna de unidades por cada
  sucursal) y el sistema detecta automáticamente qué SKU "core" (vendidos en
  10 o más sucursales) tuvieron 0 unidades en 1 o 2 sucursales puntuales —
  posible quiebre de stock, **sin necesitar cargar stock mínimo por
  producto**. Muestra ranking de brechas por departamento y por sucursal, y
  el detalle de cada una. **Viene con un análisis real ya cargado** (el de
  Kilbel del 1 al 14/09/2026): reproduce exactamente el mismo resultado
  (916 brechas, mismo ranking por departamento y por sucursal) que el
  archivo Excel original que hacía este cálculo a mano.

- **Plantel y Horarios**: la grilla de horarios y el plantel por posición de
  las 12 sucursales + E-Commerce, ahora vivos y editables (antes era un
  tablero estático). Se carga subiendo **las dos planillas de origen tal
  cual** desde la sub-pestaña *Importar y configurar*:
  - `HORARIOS DE SUC. ….xlsx`: una hoja por unidad (LP, FZ, …, ECOM). La
    grilla se lee del **color de relleno** de las celdas de 7 a 21 hs (el
    blanco no cuenta); también toma el horario escrito, el franco, el bloque
    "PARTE MÉDICO PROLONGADO", la lista de part time de "TOTAL SUC." y la
    hoja "Ausencias". Ignora totales, títulos repetidos y una segunda versión
    de la grilla en la misma hoja (la propuesta que hay debajo en Balcarce).
  - `PLANTEL 2026.xlsx` (hoja "prox planteles"): cada columna numerada se
    asigna a la hoja de horarios con la que comparte más nombres, así que no
    depende del orden de las columnas. Lee también "CANT CAJAS" y el bloque
    de encargados y subs sin sucursal.

  Se pueden subir juntas o por separado (con sólo el plantel se actualizan
  las posiciones sobre la grilla ya cargada). También acepta el HTML del
  artifact "Plantel y Horarios 2026".
  Suma sobre lo que mostraba el tablero:
  - **Cobertura por día real**: interpreta el franco de cada persona ("mierc
    tard", "juev-ta", "MART/TA", "lunes manaña"…) y lo descuenta del día que
    corresponde, en vez de mirar sólo la semana tipo.
  - **Huecos contra mínimos configurables** (p. ej. "Cajas ≥ 2 de 9 a 21 hs"),
    por sucursal o para todas, sólo en las horas en que la sucursal está abierta.
  - **Plantel × Productividad**: horas programadas en la grilla (× 4,33
    semanas) contra las horas-hombre y colaboradores cargados en Productividad
    para el mismo mes, al lado de la columna de horas/mes que calcula la
    propia planilla.
  - **Calidad de datos con arreglo en un clic**: nombres casi iguales entre
    plantel y horarios (comparación difusa: "IBARRECHE" ↔ "IBARRECHEA",
    "PEREYRA J." ↔ "PEREYRA JULIAN") con botón *Unificar*; personas
    cargadas en otra unidad; grillas pintadas distinto del horario escrito con
    botón *Repintar según horario*; francos ilegibles; la misma persona en dos
    filas; vacantes; y encabezados de la planilla pegados como si fueran
    personas (se descartan al importar).
  - **Edición**: alta, baja, traslado de unidad y cambio de horario; la grilla
    se pinta sola a partir del horario escrito.
  - Búsqueda en toda la red y **exportación a CSV** para Excel.

  **Privacidad**: el plantel tiene nombres, partes médicos y ausencias, así
  que se guarda en `plantel.json` (en `DATA_DIR`), separado de `db.json` y
  excluido del repositorio con `.gitignore`. En Railway queda en el mismo
  volumen que el resto de los datos.

## Arquitectura (igual patrón que el resto del repo)

Mismo enfoque que `clases-matematica/`: Node.js + Express exponiendo una API
REST, frontend en HTML/CSS/JS sin frameworks, datos en un archivo JSON
(`data/db.json`) cuya ubicación es configurable con la variable de entorno
`DATA_DIR` (para usar un volumen persistente en producción).

```
server/
  index.js, db.js
  routes/
    sucursales.js, vendedores.js, productos.js, ventas.js, objetivos.js
    dashboard.js   → agrega y calcula todos los KPIs del dashboard
    plantel.js     → API del módulo Plantel y Horarios
  plantel/
    analisis.js    → lógica pura: horarios, francos, nombres, cobertura
                     (la usa también el navegador, servida en /plantel-analisis.js)
    importarExcel.js → lee los Excel de horarios y de plantel
    importar.js    → lee el HTML/JSON del artifact (formato anterior)
    store.js       → lee/guarda plantel.json
test/
  plantel.test.js  → npm test
public/
  plantel.js                         → pestaña Plantel y Horarios
  index.html, styles.css, app.js   → dibuja los gráficos con SVG a mano,
                                      sin librerías externas
```

### Por qué SVG a mano en vez de una librería de gráficos

Con dos tipos de gráfico (línea de tendencia y barras por categoría) alcanza
con generar el SVG desde JavaScript calculando escalas simples (valor →
píxel). Esto evita sumar una dependencia pesada y hace que el código de
`renderLineChart` / `renderBarChart` en `app.js` sea fácil de leer y de
adaptar.

## Publicar en Railway (segundo servicio en el mismo repo)

Como este proyecto convive en el mismo repositorio que `clases-matematica/`,
en Railway se agrega como **un servicio nuevo dentro del mismo proyecto**,
indicándole que la raíz del código es esta carpeta:

1. En tu proyecto de Railway, click **+ New → GitHub Repo** y elegí de nuevo
   `juancollins27/Repositorio`.
2. Andá a **Settings** del nuevo servicio → sección **Source** → **Root
   Directory** → poné `panel-comercial`.
3. (Igual que con la otra app) en **Settings → Networking** → **Generate
   Domain** para obtener la URL pública.
4. Si querés persistencia real de datos: **Settings → Volumes** → crear
   volumen montado en `/data`, y en **Variables** agregar `DATA_DIR=/data`.

## Endpoints de la API

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/api/sucursales` | listar / crear sucursal |
| DELETE | `/api/sucursales/:id` | eliminar sucursal |
| GET/POST | `/api/vendedores` | listar / crear vendedor |
| DELETE | `/api/vendedores/:id` | eliminar vendedor |
| GET/POST | `/api/productos` | listar / crear producto |
| PUT/DELETE | `/api/productos/:id` | editar / eliminar producto |
| GET/POST | `/api/ventas` | listar (filtros `sucursalId`, `vendedorId`, `desde`, `hasta`) / registrar venta |
| DELETE | `/api/ventas/:id` | eliminar venta (repone stock) |
| GET/POST | `/api/objetivos` | listar (filtro `periodo`) / definir objetivo mensual |
| DELETE | `/api/objetivos/:id` | eliminar objetivo |
| GET | `/api/dashboard?periodo=YYYY-MM` | KPIs agregados del período |
| GET/POST | `/api/productividad` | listar / cargar un mes de productividad de una sucursal |
| DELETE | `/api/productividad/:id` | eliminar un mes cargado |
| GET | `/api/productividad/resumen?anio=&mesDesde=&mesHasta=` | métricas calculadas, promedio empresa/formato, rankings y brechas |
| GET | `/api/quiebres` | listar análisis de quiebres importados |
| POST | `/api/quiebres/importar` | subir un .xlsx (campo `archivo`) y analizarlo |
| GET/DELETE | `/api/quiebres/:id` | ver / eliminar un análisis guardado |
| GET | `/api/plantel` | plantel completo: unidades, personas (con horas/semana y alertas), posiciones, mínimos |
| GET | `/api/plantel/resumen` | KPIs por unidad y cobertura por hora y sector de toda la red |
| GET | `/api/plantel/cobertura?dia=&sector=` | personas por hora y unidad (`dia` 0–5 = lunes–sábado, con francos) |
| GET | `/api/plantel/huecos` | horas por debajo de los mínimos, por unidad, día y sector |
| GET | `/api/plantel/calidad` | diferencias plantel/horarios y demás chequeos de datos |
| GET | `/api/plantel/productividad?anio=&mes=` | horas programadas vs. horas-hombre reales del mes |
| GET | `/api/plantel/export.csv` | grilla completa en CSV (separador `;`) |
| POST | `/api/plantel/importar` | subir los Excel de horarios y/o plantel, o el HTML/JSON del artifact (campo `archivo`, hasta 3) |
| POST/PUT/DELETE | `/api/plantel/personas[/:id]` | alta / edición / baja de una fila de la grilla |
| PUT | `/api/plantel/minimos` | reemplazar la lista de mínimos de cobertura |
| PUT | `/api/plantel/config` | días trabajados por semana (5 o 6) |
| PUT | `/api/plantel/unidades/:clave` | cajas declaradas / sucursal vinculada |

## Ideas para seguir extendiendo

- Comisiones automáticas por vendedor según % de cumplimiento.
- Exportar el listado de ventas a CSV/Excel.
- Multi-usuario con login y permisos por sucursal.
- Reportes comparativos entre meses (variación % vs. mes anterior).
