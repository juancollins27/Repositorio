import { Router } from 'express';
import { leerDB, guardarDB, nuevoId } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const db = leerDB();
  let ventas = db.ventas;

  const { sucursalId, vendedorId, desde, hasta } = req.query;
  if (sucursalId) ventas = ventas.filter((v) => v.sucursalId === Number(sucursalId));
  if (vendedorId) ventas = ventas.filter((v) => v.vendedorId === Number(vendedorId));
  if (desde) ventas = ventas.filter((v) => v.fecha >= desde);
  if (hasta) ventas = ventas.filter((v) => v.fecha <= hasta);

  ventas = [...ventas].sort((a, b) => b.fecha.localeCompare(a.fecha));
  res.json(ventas);
});

router.post('/', (req, res) => {
  const { fecha, sucursalId, vendedorId, productoId, cantidad, precioUnitario } = req.body;

  if (!fecha || !sucursalId || !vendedorId || !productoId || !cantidad) {
    return res
      .status(400)
      .json({ error: 'fecha, sucursalId, vendedorId, productoId y cantidad son obligatorios' });
  }

  const db = leerDB();
  const producto = db.productos.find((p) => p.id === Number(productoId));
  if (!producto) return res.status(404).json({ error: 'producto no encontrado' });
  if (!db.sucursales.find((s) => s.id === Number(sucursalId))) {
    return res.status(404).json({ error: 'sucursal no encontrada' });
  }
  if (!db.vendedores.find((v) => v.id === Number(vendedorId))) {
    return res.status(404).json({ error: 'vendedor no encontrado' });
  }

  const cant = Number(cantidad);
  const precio = precioUnitario !== undefined ? Number(precioUnitario) : producto.precio;

  const venta = {
    id: nuevoId(db, 'ventas'),
    fecha,
    sucursalId: Number(sucursalId),
    vendedorId: Number(vendedorId),
    productoId: Number(productoId),
    cantidad: cant,
    precioUnitario: precio,
    total: Math.round(cant * precio * 100) / 100
  };

  producto.stock = Math.max(0, producto.stock - cant);

  db.ventas.push(venta);
  guardarDB(db);
  res.status(201).json(venta);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = leerDB();
  const venta = db.ventas.find((v) => v.id === id);
  if (!venta) return res.status(404).json({ error: 'venta no encontrada' });

  const producto = db.productos.find((p) => p.id === venta.productoId);
  if (producto) producto.stock += venta.cantidad;

  db.ventas = db.ventas.filter((v) => v.id !== id);
  guardarDB(db);
  res.status(204).end();
});

export default router;
