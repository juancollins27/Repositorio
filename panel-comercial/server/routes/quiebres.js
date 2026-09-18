import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { leerDB, guardarDB, nuevoId } from '../db.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const UMBRAL_CORE = 10; // vendido en al menos 10 de las sucursales para considerarse "core"

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function encontrarHojaYEncabezado(workbook) {
  for (const nombreHoja of workbook.SheetNames) {
    const hoja = workbook.Sheets[nombreHoja];
    const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null, raw: true });
    for (let i = 0; i < Math.min(filas.length, 10); i++) {
      const fila = filas[i];
      if (fila && normalizar(fila[0]) === normalizar('SKU (Id)')) {
        return { filas, indiceEncabezado: i };
      }
    }
  }
  return null;
}

router.post('/importar', upload.single('archivo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no se recibió ningún archivo' });

  const db = leerDB();
  const sucursales = db.sucursales;

  let workbook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  } catch (err) {
    return res.status(400).json({ error: 'no se pudo leer el archivo, ¿es un .xlsx válido?' });
  }

  const encontrado = encontrarHojaYEncabezado(workbook);
  if (!encontrado) {
    return res.status(400).json({
      error:
        'no se encontró una fila de encabezado con "SKU (Id)". Se espera la misma estructura que la hoja "Matriz completa".'
    });
  }
  const { filas, indiceEncabezado } = encontrado;
  const encabezado = filas[indiceEncabezado];

  const COLUMNAS_FIJAS = ['SKU (Id)', 'Departamento', 'Rubro', 'Familia', 'Marca', 'Descripción', 'Tam'];
  const indiceColumna = {};
  COLUMNAS_FIJAS.forEach((nombre) => {
    indiceColumna[nombre] = encabezado.findIndex((h) => normalizar(h) === normalizar(nombre));
  });

  // columnas de sucursal: las que matchean el nombre de alguna sucursal cargada
  const columnasSucursal = [];
  encabezado.forEach((h, idx) => {
    const suc = sucursales.find((s) => normalizar(s.nombre) === normalizar(h));
    if (suc) columnasSucursal.push({ idx, sucursalId: suc.id, nombre: suc.nombre });
  });

  if (columnasSucursal.length < 2) {
    return res.status(400).json({
      error: `sólo se pudieron identificar ${columnasSucursal.length} columnas de sucursal por nombre. Revisá que los nombres de columna coincidan con los de "Sucursales".`
    });
  }

  const totalSucursales = columnasSucursal.length;
  const brechas = [];
  const conteoTotalPorSucursal = {};
  columnasSucursal.forEach((c) => (conteoTotalPorSucursal[c.sucursalId] = 0));
  const conteoBrechaPorSucursal = {};
  columnasSucursal.forEach((c) => (conteoBrechaPorSucursal[c.sucursalId] = 0));
  const conteoPorDepartamento = {};
  let filasProcesadas = 0;

  for (let i = indiceEncabezado + 1; i < filas.length; i++) {
    const fila = filas[i];
    if (!fila || fila[indiceColumna['SKU (Id)']] === null || fila[indiceColumna['SKU (Id)']] === undefined) continue;

    const unidadesPorSucursal = columnasSucursal.map((c) => Number(fila[c.idx]) || 0);
    const sucursalesConVenta = [];
    const sucursalesSinVenta = [];
    columnasSucursal.forEach((c, i2) => {
      if (unidadesPorSucursal[i2] > 0) {
        sucursalesConVenta.push(c);
        conteoTotalPorSucursal[c.sucursalId] += 1;
      } else {
        sucursalesSinVenta.push(c);
      }
    });

    filasProcesadas += 1;
    const esCore = sucursalesConVenta.length >= UMBRAL_CORE;
    const esBrecha = esCore && sucursalesSinVenta.length >= 1 && sucursalesSinVenta.length <= 2;

    if (esBrecha) {
      const departamento = fila[indiceColumna['Departamento']] || 'Sin departamento';
      conteoPorDepartamento[departamento] = (conteoPorDepartamento[departamento] || 0) + 1;
      sucursalesSinVenta.forEach((c) => (conteoBrechaPorSucursal[c.sucursalId] += 1));

      brechas.push({
        sku: fila[indiceColumna['SKU (Id)']],
        departamento,
        rubro: fila[indiceColumna['Rubro']] || '',
        marca: fila[indiceColumna['Marca']] || '',
        descripcion: fila[indiceColumna['Descripción']] || '',
        tam: fila[indiceColumna['Tam']] || '',
        sucursalesConVenta: sucursalesConVenta.length,
        sucursalesSinVenta: sucursalesSinVenta.map((c) => c.nombre)
      });
    }
  }

  brechas.sort((a, b) => a.sucursalesSinVenta.length - b.sucursalesSinVenta.length);

  const rankingDepartamentos = Object.entries(conteoPorDepartamento)
    .map(([departamento, cantidad]) => ({ departamento, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  const rankingSucursales = columnasSucursal
    .map((c) => ({
      sucursalId: c.sucursalId,
      nombre: c.nombre,
      brechas: conteoBrechaPorSucursal[c.sucursalId],
      skusVendidos: conteoTotalPorSucursal[c.sucursalId]
    }))
    .sort((a, b) => b.brechas - a.brechas);

  const analisis = {
    id: nuevoId(db, 'quiebresAnalisis'),
    fechaImportacion: new Date().toISOString(),
    nombreArchivo: req.file.originalname,
    totalSkusAnalizados: filasProcesadas,
    totalSucursalesDetectadas: totalSucursales,
    totalBrechas: brechas.length,
    umbralCore: UMBRAL_CORE,
    rankingDepartamentos,
    rankingSucursales,
    brechas: brechas.slice(0, 500)
  };

  db.quiebresAnalisis = db.quiebresAnalisis || [];
  db.quiebresAnalisis.unshift(analisis);
  db.quiebresAnalisis = db.quiebresAnalisis.slice(0, 20);
  guardarDB(db);

  res.status(201).json(analisis);
});

router.get('/', (req, res) => {
  const db = leerDB();
  const lista = (db.quiebresAnalisis || []).map((a) => ({
    id: a.id,
    fechaImportacion: a.fechaImportacion,
    nombreArchivo: a.nombreArchivo,
    totalSkusAnalizados: a.totalSkusAnalizados,
    totalBrechas: a.totalBrechas
  }));
  res.json(lista);
});

router.get('/:id', (req, res) => {
  const db = leerDB();
  const analisis = (db.quiebresAnalisis || []).find((a) => a.id === Number(req.params.id));
  if (!analisis) return res.status(404).json({ error: 'análisis no encontrado' });
  res.json(analisis);
});

router.delete('/:id', (req, res) => {
  const db = leerDB();
  db.quiebresAnalisis = (db.quiebresAnalisis || []).filter((a) => a.id !== Number(req.params.id));
  guardarDB(db);
  res.status(204).end();
});

export default router;
