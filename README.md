# Clases de Matemática — Panel de gestión

Aplicación web para una profesora particular de matemática: alumnos, horarios
disponibles por día de semana, turnos y facturación. Este proyecto está pensado
como guía práctica: es funcional de punta a punta y usa las piezas mínimas
necesarias para que se entienda cada capa.

## Cómo probarla

```bash
npm install
npm start
```

Abrí `http://localhost:3000` en el navegador.

## La arquitectura, explicada

### 1. ¿Por qué esta pila tecnológica?

- **Backend: Node.js + Express.** Express expone una API REST (un conjunto de
  URLs que devuelven/reciben JSON). Es la opción más simple para no mezclar la
  lógica de datos con el HTML.
- **Frontend: HTML + CSS + JavaScript "vanilla" (sin frameworks).** Con cuatro
  pantallas y formularios simples no hace falta React ni Vue; usar `fetch` y
  manipular el DOM directamente alcanza y es más fácil de leer para aprender.
- **Base de datos: un archivo JSON (`data/db.json`).** Para una sola usuaria
  (la profesora) no hace falta un motor de base de datos. El archivo se lee y
  se sobreescribe en cada operación. El día que la app crezca (varios
  usuarios, muchos datos), este archivo se reemplaza por SQLite/PostgreSQL sin
  tocar el resto del diseño: toda la lectura/escritura pasa por `server/db.js`.

### 2. El modelo de datos

- **Alumnos** (`alumnos`): nombre, apellido, contacto y `tarifaHora` (precio
  por hora, usado para sugerir el precio de cada turno).
- **Horarios** (`horarios`): la disponibilidad semanal de la profesora, como
  una plantilla que se repite. Cada franja es `{ diaSemana, horaInicio,
  horaFin }`, por ejemplo "lunes 16:00–20:00". Esto es independiente de los
  turnos concretos: define *cuándo puede dar clase*, no clases ya agendadas.
- **Turnos** (`turnos`): una clase concreta en una fecha puntual, ligada a un
  alumno, con un `estado` (`pendiente → confirmado → completado`, o
  `cancelado`). El campo `facturaId` indica si ya fue incluido en una factura.
- **Facturas** (`facturas`): se generan por alumno y por período (mes),
  sumando el precio de todos los turnos `completado` de ese alumno en ese mes
  que todavía no estén facturados. Al generarla, esos turnos quedan "sellados"
  (su `facturaId` se completa) para no facturarlos dos veces.

Esta separación entre **horarios** (disponibilidad recurrente) y **turnos**
(eventos puntuales) es el patrón típico de cualquier sistema de reservas
(consultorios, academias, canchas): la disponibilidad es una regla semanal, la
reserva es un hecho concreto en el calendario.

### 3. Cómo está organizado el código

```
server/
  index.js          → arma la app de Express y monta cada router
  db.js             → leer/guardar el archivo JSON (una sola responsabilidad)
  routes/
    alumnos.js       → CRUD de alumnos
    horarios.js      → alta/baja de franjas horarias
    turnos.js        → alta/baja/cambio de estado de turnos
    facturacion.js    → generar factura, marcarla pagada
public/
  index.html         → estructura de las 4 pestañas
  styles.css         → estilos
  app.js             → llama a la API con fetch() y actualiza el DOM
data/
  db.json            → "la base de datos"
```

Cada archivo de `routes/` es responsable de un solo recurso. Esto es lo que en
una API REST se llama "un router por entidad": facilita encontrar dónde está
cada endpoint y agregar validaciones sin tocar el resto.

### 4. El flujo típico (cómo se conectan las piezas)

1. El navegador carga `index.html`, que pide `app.js`.
2. `app.js` llama a `fetch('/api/alumnos')`, etc., para traer los datos y
   dibujar las tablas.
3. Al enviar un formulario, `app.js` hace `fetch(..., { method: 'POST', body:
   JSON.stringify(datos) })`.
4. Express recibe la petición, la ruta correspondiente en `routes/` valida los
   datos, los guarda en `db.json` y responde con JSON.
5. `app.js` vuelve a pedir la lista actualizada y refresca la tabla.

Es el ciclo clásico de una SPA simple: **UI → API → datos → UI**, sin
recargar la página.

### 5. Ideas para seguir aprendiendo/extendiendo

- **Autenticación**: agregar login para que sólo la profesora entre (por
  ejemplo con `express-session` y una contraseña).
- **Base de datos real**: migrar `db.json` a SQLite (con `better-sqlite3`) el
  día que quieras hacer backups más robustos o consultas más complejas.
- **Recordatorios**: enviar un email o WhatsApp automático antes de cada
  turno (se integraría en `routes/turnos.js`).
- **Vista de calendario**: en vez de una tabla, mostrar los turnos en una
  grilla semanal/mensual (se puede hacer con CSS grid o una librería como
  FullCalendar).
- **Despliegue**: subir la carpeta a un servicio como Render, Railway o un
  VPS; `npm start` ya deja el servidor listo para producción con pequeños
  ajustes (variable `PORT`, proceso administrado con `pm2`).

## Endpoints de la API

| Método | Ruta | Descripción |
|---|---|---|
| GET/POST | `/api/alumnos` | listar / crear alumno |
| PUT/DELETE | `/api/alumnos/:id` | editar / eliminar alumno |
| GET/POST | `/api/horarios` | listar / crear franja horaria |
| DELETE | `/api/horarios/:id` | eliminar franja |
| GET/POST | `/api/turnos` | listar (con filtros `alumnoId`, `desde`, `hasta`) / crear turno |
| PATCH/DELETE | `/api/turnos/:id` | cambiar estado o precio / eliminar |
| GET | `/api/facturas` | listar facturas |
| POST | `/api/facturas/generar` | generar factura de un alumno y período |
| PATCH | `/api/facturas/:id/pagar` | marcar factura como pagada |
