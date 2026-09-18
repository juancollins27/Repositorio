import { Router } from 'express';
import { leerDB, guardarDB, nuevoId } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(leerDB().sucursales);
});

router.post('/', (req, res) => {
  const { nombre, ciudad } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es obligatorio' });

  const db = leerDB();
  const sucursal = { id: nuevoId(db, 'sucursales'), nombre, ciudad: ciudad || '' };
  db.sucursales.push(sucursal);
  guardarDB(db);
  res.status(201).json(sucursal);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = leerDB();
  db.sucursales = db.sucursales.filter((s) => s.id !== id);
  guardarDB(db);
  res.status(204).end();
});

export default router;
