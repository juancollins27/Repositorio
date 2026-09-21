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

- **Reconocimiento de producto**: sacás una foto de un producto (envase o
  etiqueta) y elegís la sucursal contra la que querés contrastarlo. Una IA de
  visión (Claude) "lee" la foto — nombre, marca, categoría y el texto del
  envase — y el sistema busca en el catálogo los productos cuyo nombre y
  categoría coincidan con lo detectado, mostrando los candidatos más
  parecidos (también podés buscar manualmente si no hay match). Al confirmar
  un producto, se arma su ficha en esa sucursal: **participación de ventas**
  (% de las ventas de la sucursal y de su categoría que representa, y su
  ranking), y **estrategia de precios** (precio promedio cobrado ahí vs. el
  precio de lista y vs. el promedio del resto de las sucursales, con el
  detalle por sucursal), además de la evolución de sus ventas en el período.
  **Requiere** la variable de entorno `ANTHROPIC_API_KEY` para poder llamar al
  servicio de visión (ver más abajo); sin ella, la identificación por foto
  devuelve error pero el resto del panel sigue funcionando igual.

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
public/
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
5. Para que funcione la pestaña **Reconocimiento** (identificar productos por
   foto), en **Settings → Variables** agregá `ANTHROPIC_API_KEY` con una API
   key de [console.anthropic.com](https://console.anthropic.com). Opcionalmente
   podés fijar `RECONOCIMIENTO_MODELO` (por defecto usa un modelo Claude
   económico con visión) si querés usar un modelo más potente.

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
| POST | `/api/reconocimiento/identificar` | subir una foto (campo `foto`) e identificar candidatos del catálogo |
| GET | `/api/reconocimiento/ficha?productoId=&sucursalId=&periodo=YYYY-MM` | participación de ventas y estrategia de precios de un producto en una sucursal |

## Ideas para seguir extendiendo

- Comisiones automáticas por vendedor según % de cumplimiento.
- Exportar el listado de ventas a CSV/Excel.
- Multi-usuario con login y permisos por sucursal.
- Reportes comparativos entre meses (variación % vs. mes anterior).
