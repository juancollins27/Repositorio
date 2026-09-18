import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import alumnosRouter from './routes/alumnos.js';
import horariosRouter from './routes/horarios.js';
import turnosRouter from './routes/turnos.js';
import facturacionRouter from './routes/facturacion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use('/api/alumnos', alumnosRouter);
app.use('/api/horarios', horariosRouter);
app.use('/api/turnos', turnosRouter);
app.use('/api/facturas', facturacionRouter);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
