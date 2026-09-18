import { Router } from 'express';
import { leerDB, guardarDB, nuevoId } from '../db.js';

const router = Router();

const METRICAS = ['art_ticket', 'tick_colab', 'art_colab', 'tick_hora', 'art_hora'];

router.get('/', (req, res) => {
  const db = leerDB();
  res.json(db.productividadMensual);
});

router.post('/', (req, res) => {
  const { sucursalId, anio, mesNro, mes, articulos, tickets, colaboradores, horas } = req.body;
  if (!sucursalId || !anio || !mesNro || !mes) {
    return res.status(400).json({ error: 'sucursalId, anio, mesNro y mes son obligatorios' });
  }

  const db = leerDB();
  if (!db.sucursales.find((s) => s.id === Number(sucursalId))) {
    return res.status(404).json({ error: 'sucursal no encontrada' });
  }

  const datos = {
    sucursalId: Number(sucursalId),
    anio: Number(anio),
    mesNro: Number(mesNro),
    mes,
    articulos: Number(articulos) || 0,
    tickets: Number(tickets) || 0,
    colaboradores: Number(colaboradores) || 0,
    horas: Number(horas) || 0
  };

  const existente = db.productividadMensual.find(
    (r) => r.sucursalId === datos.sucursalId && r.anio === datos.anio && r.mesNro === datos.mesNro
  );
  if (existente) {
    Object.assign(existente, datos);
    guardarDB(db);
    return res.json(existente);
  }

  const registro = { id: nuevoId(db, 'productividadMensual'), ...datos };
  db.productividadMensual.push(registro);
  guardarDB(db);
  res.status(201).json(registro);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = leerDB();
  db.productividadMensual = db.productividadMensual.filter((r) => r.id !== id);
  guardarDB(db);
  res.status(204).end();
});

function sumar(registros) {
  return registros.reduce(
    (acc, r) => ({
      articulos: acc.articulos + r.articulos,
      tickets: acc.tickets + r.tickets,
      colaboradores: acc.colaboradores + r.colaboradores,
      horas: acc.horas + r.horas
    }),
    { articulos: 0, tickets: 0, colaboradores: 0, horas: 0 }
  );
}

function ratios(tot) {
  return {
    art_ticket: tot.tickets > 0 ? tot.articulos / tot.tickets : null,
    tick_colab: tot.colaboradores > 0 ? tot.tickets / tot.colaboradores : null,
    art_colab: tot.colaboradores > 0 ? tot.articulos / tot.colaboradores : null,
    tick_hora: tot.horas > 0 ? tot.tickets / tot.horas : null,
    art_hora: tot.horas > 0 ? tot.articulos / tot.horas : null
  };
}

router.get('/resumen', (req, res) => {
  const db = leerDB();
  const anio = req.query.anio ? Number(req.query.anio) : null;
  const mesDesde = req.query.mesDesde ? Number(req.query.mesDesde) : 1;
  const mesHasta = req.query.mesHasta ? Number(req.query.mesHasta) : 12;

  let registros = db.productividadMensual;
  if (anio) registros = registros.filter((r) => r.anio === anio);
  registros = registros.filter((r) => r.mesNro >= mesDesde && r.mesNro <= mesHasta);

  const sucursalesFisicas = db.sucursales;

  const porSucursal = sucursalesFisicas.map((s) => {
    const regs = registros.filter((r) => r.sucursalId === s.id);
    const tot = sumar(regs);
    return { sucursalId: s.id, nombre: s.nombre, formato: s.formato, ...tot, ...ratios(tot) };
  });

  const totalEmpresa = sumar(registros);
  const empresa = { ...totalEmpresa, ...ratios(totalEmpresa) };

  const formatos = {};
  ['Market', 'Express'].forEach((f) => {
    const regsFormato = registros.filter((r) => {
      const suc = sucursalesFisicas.find((s) => s.id === r.sucursalId);
      return suc && suc.formato === f;
    });
    const tot = sumar(regsFormato);
    formatos[f] = { ...tot, ...ratios(tot) };
  });

  const rankings = {};
  METRICAS.forEach((m) => {
    rankings[m] = [...porSucursal]
      .filter((s) => s[m] !== null)
      .sort((a, b) => b[m] - a[m])
      .map((s, i) => ({ sucursalId: s.sucursalId, puesto: i + 1 }));
  });

  porSucursal.forEach((s) => {
    s.deltaEmpresa = {};
    s.deltaFormato = {};
    s.ranking = {};
    METRICAS.forEach((m) => {
      s.deltaEmpresa[m] = s[m] !== null && empresa[m] ? (s[m] / empresa[m] - 1) * 100 : null;
      const avgFormato = formatos[s.formato] ? formatos[s.formato][m] : null;
      s.deltaFormato[m] = s[m] !== null && avgFormato ? (s[m] / avgFormato - 1) * 100 : null;
      const r = rankings[m].find((x) => x.sucursalId === s.sucursalId);
      s.ranking[m] = r ? r.puesto : null;
    });
  });

  res.json({ mesDesde, mesHasta, anio, empresa, formatos, sucursales: porSucursal });
});

export default router;
