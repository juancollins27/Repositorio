import { Router } from 'express';
import { leerDB, guardarDB, nuevoId } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const db = leerDB();
  const { periodo } = req.query;
  const objetivos = periodo ? db.objetivos.filter((o) => o.periodo === periodo) : db.objetivos;
  res.json(objetivos);
});

router.post('/', (req, res) => {
  const { sucursalId, periodo, montoObjetivo } = req.body;
  if (!sucursalId || !periodo || !montoObjetivo) {
    return res.status(400).json({ error: 'sucursalId, periodo y montoObjetivo son obligatorios' });
  }

  const db = leerDB();
  if (!db.sucursales.find((s) => s.id === Number(sucursalId))) {
    return res.status(404).json({ error: 'sucursal no encontrada' });
  }

  const existente = db.objetivos.find(
    (o) => o.sucursalId === Number(sucursalId) && o.periodo === periodo
  );
  if (existente) {
    existente.montoObjetivo = Number(montoObjetivo);
    guardarDB(db);
    return res.json(existente);
  }

  const objetivo = {
    id: nuevoId(db, 'objetivos'),
    sucursalId: Number(sucursalId),
    periodo,
    montoObjetivo: Number(montoObjetivo)
  };
  db.objetivos.push(objetivo);
  guardarDB(db);
  res.status(201).json(objetivo);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = leerDB();
  db.objetivos = db.objetivos.filter((o) => o.id !== id);
  guardarDB(db);
  res.status(204).end();
});

export default router;
