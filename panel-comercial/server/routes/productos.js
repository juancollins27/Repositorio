import { Router } from 'express';
import { leerDB, guardarDB, nuevoId } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(leerDB().productos);
});

router.post('/', (req, res) => {
  const { nombre, categoria, precio, stock, stockMinimo } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es obligatorio' });

  const db = leerDB();
  const producto = {
    id: nuevoId(db, 'productos'),
    nombre,
    categoria: categoria || '',
    precio: Number(precio) || 0,
    stock: Number(stock) || 0,
    stockMinimo: Number(stockMinimo) || 0
  };
  db.productos.push(producto);
  guardarDB(db);
  res.status(201).json(producto);
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = leerDB();
  const producto = db.productos.find((p) => p.id === id);
  if (!producto) return res.status(404).json({ error: 'producto no encontrado' });

  const { nombre, categoria, precio, stock, stockMinimo } = req.body;
  Object.assign(producto, {
    nombre: nombre ?? producto.nombre,
    categoria: categoria ?? producto.categoria,
    precio: precio !== undefined ? Number(precio) : producto.precio,
    stock: stock !== undefined ? Number(stock) : producto.stock,
    stockMinimo: stockMinimo !== undefined ? Number(stockMinimo) : producto.stockMinimo
  });
  guardarDB(db);
  res.json(producto);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = leerDB();
  db.productos = db.productos.filter((p) => p.id !== id);
  guardarDB(db);
  res.status(204).end();
});

export default router;
