import { Router } from 'express';
import { leerDB } from '../db.js';

const router = Router();

function periodoActual() {
  return new Date().toISOString().slice(0, 7);
}

router.get('/', (req, res) => {
  const db = leerDB();
  const periodo = req.query.periodo || periodoActual();

  const ventasPeriodo = db.ventas.filter((v) => v.fecha.startsWith(periodo));
  const totalVentas = ventasPeriodo.reduce((s, v) => s + v.total, 0);
  const cantidadVentas = ventasPeriodo.length;
  const ticketPromedio = cantidadVentas ? totalVentas / cantidadVentas : 0;

  const objetivosPeriodo = db.objetivos.filter((o) => o.periodo === periodo);
  const objetivoTotal = objetivosPeriodo.reduce((s, o) => s + o.montoObjetivo, 0);
  const cumplimiento = objetivoTotal > 0 ? (totalVentas / objetivoTotal) * 100 : null;

  const porDia = {};
  ventasPeriodo.forEach((v) => {
    porDia[v.fecha] = (porDia[v.fecha] || 0) + v.total;
  });
  const ventasPorDia = Object.entries(porDia)
    .map(([fecha, total]) => ({ fecha, total }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const porSucursal = {};
  ventasPeriodo.forEach((v) => {
    porSucursal[v.sucursalId] = (porSucursal[v.sucursalId] || 0) + v.total;
  });
  const ventasPorSucursal = db.sucursales.map((s) => {
    const objetivo = objetivosPeriodo.find((o) => o.sucursalId === s.id);
    const total = porSucursal[s.id] || 0;
    return {
      sucursalId: s.id,
      nombre: s.nombre,
      total,
      objetivo: objetivo ? objetivo.montoObjetivo : null,
      cumplimiento: objetivo ? (total / objetivo.montoObjetivo) * 100 : null
    };
  });

  const porVendedor = {};
  ventasPeriodo.forEach((v) => {
    porVendedor[v.vendedorId] = (porVendedor[v.vendedorId] || 0) + v.total;
  });
  const rankingVendedores = Object.entries(porVendedor)
    .map(([vendedorId, total]) => {
      const vendedor = db.vendedores.find((v) => v.id === Number(vendedorId));
      return { vendedorId: Number(vendedorId), nombre: vendedor ? vendedor.nombre : '—', total };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const porProducto = {};
  ventasPeriodo.forEach((v) => {
    if (!porProducto[v.productoId]) porProducto[v.productoId] = { cantidad: 0, total: 0 };
    porProducto[v.productoId].cantidad += v.cantidad;
    porProducto[v.productoId].total += v.total;
  });
  const rankingProductos = Object.entries(porProducto)
    .map(([productoId, datos]) => {
      const producto = db.productos.find((p) => p.id === Number(productoId));
      return { productoId: Number(productoId), nombre: producto ? producto.nombre : '—', ...datos };
    })
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 10);

  const productosStockBajo = db.productos.filter((p) => p.stock <= p.stockMinimo);

  res.json({
    periodo,
    totalVentas,
    cantidadVentas,
    ticketPromedio,
    objetivoTotal,
    cumplimiento,
    ventasPorDia,
    ventasPorSucursal,
    rankingVendedores,
    rankingProductos,
    productosStockBajo
  });
});

export default router;
