import { Router } from 'express';
import { leerDB, guardarDB, nuevoId } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(leerDB().vendedores);
});

router.post('/', (req, res) => {
  const { nombre, sucursalId } = req.body;
  if (!nombre || !sucursalId) {
    return res.status(400).json({ error: 'nombre y sucursalId son obligatorios' });
  }

  const db = leerDB();
  const sucursal = db.sucursales.find((s) => s.id === Number(sucursalId));
  if (!sucursal) return res.status(404).json({ error: 'sucursal no encontrada' });

  const vendedor = { id: nuevoId(db, 'vendedores'), nombre, sucursalId: Number(sucursalId) };
  db.vendedores.push(vendedor);
  guardarDB(db);
  res.status(201).json(vendedor);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = leerDB();
  db.vendedores = db.vendedores.filter((v) => v.id !== id);
  guardarDB(db);
  res.status(204).end();
});

export default router;
