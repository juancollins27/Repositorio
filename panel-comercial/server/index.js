import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sucursalesRouter from './routes/sucursales.js';
import vendedoresRouter from './routes/vendedores.js';
import productosRouter from './routes/productos.js';
import ventasRouter from './routes/ventas.js';
import objetivosRouter from './routes/objetivos.js';
import dashboardRouter from './routes/dashboard.js';
import productividadRouter from './routes/productividad.js';
import quiebresRouter from './routes/quiebres.js';
import plantelRouter from './routes/plantel.js';
import { controlDeAcceso, proteccionActiva } from './acceso.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Va primero: protege la API y también las páginas.
app.use(controlDeAcceso);
app.use(express.json());

app.get('/api/sesion', (req, res) => res.json({ rol: req.rol || 'edicion', protegido: proteccionActiva() }));

app.use('/api/sucursales', sucursalesRouter);
app.use('/api/vendedores', vendedoresRouter);
app.use('/api/productos', productosRouter);
app.use('/api/ventas', ventasRouter);
app.use('/api/objetivos', objetivosRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/productividad', productividadRouter);
app.use('/api/quiebres', quiebresRouter);
app.use('/api/plantel', plantelRouter);

// La lógica de horarios y francos es la misma en el servidor y en el
// navegador (el formulario de edición pinta la grilla en vivo).
app.get('/plantel-analisis.js', (req, res) => {
  res.type('application/javascript').sendFile(path.join(__dirname, 'plantel', 'analisis.js'));
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Panel comercial corriendo en http://localhost:${PORT}`);
  if (!proteccionActiva()) console.log('Atención: sin APP_PASSWORD el panel queda abierto a cualquiera que tenga la URL.');
});
