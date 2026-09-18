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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/api/sucursales', sucursalesRouter);
app.use('/api/vendedores', vendedoresRouter);
app.use('/api/productos', productosRouter);
app.use('/api/ventas', ventasRouter);
app.use('/api/objetivos', objetivosRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/productividad', productividadRouter);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Panel comercial corriendo en http://localhost:${PORT}`);
});
