import { Router } from 'express';
import { leerDB, guardarDB, nuevoId } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const db = leerDB();
  res.json(db.facturas);
});

router.post('/generar', (req, res) => {
  const { alumnoId, periodo } = req.body; // periodo: "YYYY-MM"

  if (!alumnoId || !periodo) {
    return res.status(400).json({ error: 'alumnoId y periodo son obligatorios' });
  }

  const db = leerDB();
  const alumno = db.alumnos.find((a) => a.id === Number(alumnoId));
  if (!alumno) return res.status(404).json({ error: 'alumno no encontrado' });

  const turnosAFacturar = db.turnos.filter(
    (t) =>
      t.alumnoId === Number(alumnoId) &&
      t.estado === 'completado' &&
      t.fecha.startsWith(periodo) &&
      !t.facturaId
  );

  if (turnosAFacturar.length === 0) {
    return res.status(400).json({ error: 'no hay turnos completados sin facturar en ese periodo' });
  }

  const total = turnosAFacturar.reduce((suma, t) => suma + t.precio, 0);

  const factura = {
    id: nuevoId(db, 'facturas'),
    alumnoId: Number(alumnoId),
    periodo,
    turnoIds: turnosAFacturar.map((t) => t.id),
    total,
    estado: 'pendiente',
    fechaEmision: new Date().toISOString().slice(0, 10),
    fechaPago: null
  };

  turnosAFacturar.forEach((t) => {
    t.facturaId = factura.id;
  });

  db.facturas.push(factura);
  guardarDB(db);
  res.status(201).json(factura);
});

router.patch('/:id/pagar', (req, res) => {
  const id = Number(req.params.id);
  const db = leerDB();
  const factura = db.facturas.find((f) => f.id === id);
  if (!factura) return res.status(404).json({ error: 'factura no encontrada' });

  factura.estado = 'pagada';
  factura.fechaPago = new Date().toISOString().slice(0, 10);
  guardarDB(db);
  res.json(factura);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = leerDB();
  const factura = db.facturas.find((f) => f.id === id);
  if (!factura) return res.status(404).json({ error: 'factura no encontrada' });

  db.turnos.forEach((t) => {
    if (t.facturaId === id) t.facturaId = null;
  });
  db.facturas = db.facturas.filter((f) => f.id !== id);
  guardarDB(db);
  res.status(204).end();
});

export default router;
