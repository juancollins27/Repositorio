import { Router } from 'express';
import multer from 'multer';
import { leerDB } from '../db.js';
import { leerPlantel, guardarPlantel, nuevoIdPlantel } from '../plantel/store.js';
import XLSX from 'xlsx';
import { extraerDataset, convertirDataset } from '../plantel/importar.js';
import { convertirLibros, leerPlantel as leerLibroPlantel, esLibroHorarios, esLibroPlantel } from '../plantel/importarExcel.js';
import {
  HORAS, SECTORES, MODALIDADES, parsearFranco, parsearHorario, parsearHorarioVariantes,
  bloquesDesdeTramos, bloquesVacios, horasSemanales, tieneTurnoCortado, grillaCoincideConTexto,
  cobertura, huecosDeCobertura, filasRepetidas, mejorCoincidencia, trabaja, UMBRAL_IGUAL
} from '../plantel/analisis.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const SEMANAS_POR_MES = 52 / 12;
const redondear = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// ---------- helpers ----------

function ausentesPorPersona(plantel) {
  const conNombre = plantel.personas.filter((p) => p.nombre);
  const porPersona = new Map();
  const noEncontradas = [];
  plantel.ausencias.nombres.forEach((n) => {
    const m = mejorCoincidencia(n, conNombre);
    if (m) porPersona.set(m.item.id, n);
    else noEncontradas.push(n);
  });
  return { porPersona, noEncontradas };
}

function enriquecer(plantel) {
  const { porPersona } = ausentesPorPersona(plantel);
  const dias = plantel.config.diasSemana;
  return plantel.personas.map((p) => {
    const francoParseado = parsearFranco(p.franco);
    const conFranco = { ...p, francoParseado };
    return {
      ...conFranco,
      horasSemana: trabaja(p) ? redondear(horasSemanales(conFranco, dias)) : 0,
      cortado: tieneTurnoCortado(p.bloques),
      grillaOk: grillaCoincideConTexto(p),
      ausencia: porPersona.get(p.id) || null
    };
  });
}

// Horas en que la unidad está abierta en la semana tipo: los mínimos sólo se
// exigen ahí (muchas sucursales cierran al mediodía). Se pide al menos el 30%
// del pico para que una sola fila mal pintada no "abra" la siesta.
function horasAbiertas(personas) {
  const cob = cobertura(personas);
  const umbral = Math.max(1, Math.ceil(Math.max(...cob) * 0.3));
  return new Set(HORAS.filter((_, i) => cob[i] >= umbral));
}

// Las reglas generales ("Todas") son para las sucursales físicas; una unidad
// sin sucursal (E-Commerce) sólo usa las reglas que la nombran a ella.
function huecosUnidad(plantel, personas, clave) {
  const unidad = plantel.unidades.find((u) => u.clave === clave);
  const minimos = unidad && unidad.sucursalId ? plantel.minimos : plantel.minimos.filter((m) => m.unidad === clave);
  const abiertas = horasAbiertas(personas);
  return huecosDeCobertura(personas, minimos, clave, plantel.config.diasSemana).filter((h) => abiertas.has(h.hora));
}

function cruceNombres(plantel, personas) {
  const resultado = {};
  const conNombre = personas.filter((p) => p.nombre && p.modalidad !== 'parte médico');
  plantel.unidades.forEach((u) => {
    const propias = conNombre.filter((p) => p.unidad === u.clave);
    const ajenas = conNombre.filter((p) => p.unidad !== u.clave);
    const posPropias = plantel.posiciones.filter((q) => q.unidad === u.clave);
    const posAjenas = plantel.posiciones.filter((q) => q.unidad !== u.clave);

    const sinHorario = [], probables = [], enOtraUnidad = [];
    posPropias.forEach((q) => {
      const m = mejorCoincidencia(q.nombre, propias);
      if (m) {
        if (m.score < UMBRAL_IGUAL) probables.push({ posicion: q, persona: m.item, score: redondear(m.score, 2) });
        return;
      }
      const otra = mejorCoincidencia(q.nombre, ajenas);
      if (otra) enOtraUnidad.push({ nombre: q.nombre, posicion: q.posicion, segun: 'plantel', otraUnidad: otra.item.unidad });
      else sinHorario.push(q);
    });

    const sinPlantel = [];
    propias.forEach((p) => {
      if (mejorCoincidencia(p.nombre, posPropias)) return;
      const otra = mejorCoincidencia(p.nombre, posAjenas);
      if (otra) enOtraUnidad.push({ nombre: p.nombre, posicion: p.puesto, segun: 'horarios', otraUnidad: otra.item.unidad, personaId: p.id });
      else sinPlantel.push(p);
    });

    resultado[u.clave] = { sinHorario, sinPlantel, probables, enOtraUnidad };
  });
  return resultado;
}

function resumenUnidad(plantel, u, personas, cruce) {
  const propias = personas.filter((p) => p.unidad === u.clave);
  const activas = propias.filter(trabaja);
  const cob = cobertura(propias);
  const pico = Math.max(...cob);
  const porSector = {};
  SECTORES.forEach((s) => { porSector[s] = activas.filter((p) => p.sector === s).length; });
  const conHorario = activas.filter((p) => p.bloques.includes('1'));
  const c = cruce[u.clave];
  return {
    clave: u.clave,
    nombre: u.nombre,
    sucursalId: u.sucursalId,
    personas: activas.length,
    cajas: porSector['Cajas'],
    cajasDeclaradas: u.cajasDeclaradas,
    partTime: activas.filter((p) => p.modalidad === 'part time').length,
    parteMedico: propias.filter((p) => p.nombre && p.modalidad === 'parte médico').length,
    vacantes: propias.filter((p) => !p.nombre).length,
    ausencias: propias.filter((p) => p.ausencia).length,
    cortadoPct: conHorario.length ? Math.round((conHorario.filter((p) => p.cortado).length / conHorario.length) * 100) : 0,
    horasSemana: redondear(activas.reduce((acc, p) => acc + p.horasSemana, 0), 0),
    pico,
    picoHora: HORAS[cob.indexOf(pico)],
    cobertura: cob,
    porSector,
    huecos: huecosUnidad(plantel, propias, u.clave).length,
    diferencias: c.sinHorario.length + c.sinPlantel.length + c.enOtraUnidad.length
  };
}

function validarPersona(body, plantel, previa = {}) {
  const datos = { ...previa };
  if (body.unidad !== undefined) {
    if (!plantel.unidades.some((u) => u.clave === body.unidad)) throw new Error('unidad inexistente');
    datos.unidad = body.unidad;
  }
  if (body.sector !== undefined) {
    if (!SECTORES.includes(body.sector)) throw new Error(`sector inválido (opciones: ${SECTORES.join(', ')})`);
    datos.sector = body.sector;
  }
  if (body.modalidad !== undefined) {
    if (!MODALIDADES.includes(body.modalidad)) throw new Error(`modalidad inválida (opciones: ${MODALIDADES.join(', ')})`);
    datos.modalidad = body.modalidad;
  }
  if (body.puesto !== undefined) datos.puesto = String(body.puesto).trim();
  if (body.nombre !== undefined) datos.nombre = String(body.nombre || '').trim() || null;
  if (body.franco !== undefined) datos.franco = String(body.franco || '').trim();

  if (body.bloques !== undefined) {
    if (!/^[01]{15}$/.test(body.bloques)) throw new Error('bloques debe tener 15 caracteres 0/1 (de 7 a 21 hs)');
    datos.bloques = body.bloques;
    datos.colores = [];
  }
  if (body.horario !== undefined) {
    datos.horario = String(body.horario || '').trim();
    // Si no mandan la grilla a mano, se pinta sola a partir del horario escrito.
    if (body.bloques === undefined) {
      const h = parsearHorario(datos.horario);
      datos.bloques = h ? bloquesDesdeTramos(h.tramos) : bloquesVacios();
      datos.colores = [];
    }
  }
  if (!datos.unidad) throw new Error('unidad es obligatoria');
  return datos;
}

// ---------- lectura ----------

router.get('/', (req, res) => {
  const plantel = leerPlantel();
  res.json({
    vacio: plantel.personas.length === 0,
    horas: HORAS,
    sectores: SECTORES,
    modalidades: MODALIDADES,
    unidades: plantel.unidades,
    personas: enriquecer(plantel),
    posiciones: plantel.posiciones,
    pool: plantel.pool,
    ausencias: plantel.ausencias,
    minimos: plantel.minimos,
    config: plantel.config,
    importacion: plantel.importacion,
    columnasPlantel: plantel.columnasPlantel || [],
    notasPlantel: plantel.notasPlantel || []
  });
});

router.get('/resumen', (req, res) => {
  const plantel = leerPlantel();
  const personas = enriquecer(plantel);
  const cruce = cruceNombres(plantel, personas);
  const unidades = plantel.unidades.map((u) => resumenUnidad(plantel, u, personas, cruce));
  const activas = personas.filter(trabaja);
  const conHorario = activas.filter((p) => p.bloques.includes('1'));
  const coberturaPorSector = {};
  SECTORES.forEach((s) => { coberturaPorSector[s] = cobertura(personas, { sector: s }); });
  res.json({
    totales: {
      unidades: unidades.length,
      personas: unidades.reduce((acc, u) => acc + u.personas, 0),
      cajas: unidades.reduce((acc, u) => acc + u.cajas, 0),
      partTime: unidades.reduce((acc, u) => acc + u.partTime, 0),
      parteMedico: unidades.reduce((acc, u) => acc + u.parteMedico, 0),
      vacantes: unidades.reduce((acc, u) => acc + u.vacantes, 0),
      ausencias: plantel.ausencias.nombres.length,
      periodoAusencias: plantel.ausencias.periodo,
      cortadoPct: conHorario.length ? Math.round((conHorario.filter((p) => p.cortado).length / conHorario.length) * 100) : 0,
      horasSemana: unidades.reduce((acc, u) => acc + u.horasSemana, 0),
      huecos: unidades.reduce((acc, u) => acc + u.huecos, 0),
      diferencias: unidades.reduce((acc, u) => acc + u.diferencias, 0)
    },
    coberturaPorSector,
    unidades
  });
});

// Matriz unidad × hora. dia vacío = semana tipo; 0..5 = lunes..sábado con francos descontados.
router.get('/cobertura', (req, res) => {
  const plantel = leerPlantel();
  const personas = enriquecer(plantel);
  const dia = req.query.dia === undefined || req.query.dia === '' ? null : Number(req.query.dia);
  const sector = req.query.sector && req.query.sector !== 'Todos' ? req.query.sector : null;
  res.json({
    dia,
    sector,
    horas: HORAS,
    unidades: plantel.unidades.map((u) => ({
      clave: u.clave,
      nombre: u.nombre,
      valores: cobertura(personas.filter((p) => p.unidad === u.clave), { dia, sector })
    }))
  });
});

router.get('/huecos', (req, res) => {
  const plantel = leerPlantel();
  const personas = enriquecer(plantel);
  res.json({
    minimos: plantel.minimos,
    diasSemana: plantel.config.diasSemana,
    unidades: plantel.unidades.map((u) => {
      const huecos = huecosUnidad(plantel, personas.filter((p) => p.unidad === u.clave), u.clave);
      return { clave: u.clave, nombre: u.nombre, total: huecos.length, huecos };
    })
  });
});

router.get('/calidad', (req, res) => {
  const plantel = leerPlantel();
  const personas = enriquecer(plantel);
  const activas = personas.filter(trabaja);
  const { noEncontradas } = ausentesPorPersona(plantel);
  const resumir = (p) => ({ id: p.id, unidad: p.unidad, nombre: p.nombre, puesto: p.puesto, horario: p.horario, franco: p.franco, bloques: p.bloques });
  res.json({
    cruce: cruceNombres(plantel, personas),
    grillaDistinta: activas.filter((p) => p.grillaOk === false).map((p) => ({
      ...resumir(p),
      bloquesSegunTexto: bloquesDesdeTramos(parsearHorarioVariantes(p.horario)[0].tramos)
    })),
    francosSinLeer: activas.filter((p) => !p.francoParseado.ok).map(resumir),
    sinHorario: activas.filter((p) => !p.bloques.includes('1')).map(resumir),
    repetidas: filasRepetidas(activas).map((g) => g.map(resumir)),
    vacantes: personas.filter((p) => !p.nombre).map((p) => ({ ...resumir(p), conGrilla: p.bloques.includes('1') })),
    ausenciasNoEncontradas: noEncontradas,
    descartadas: plantel.descartadas
  });
});

// Cruza las horas programadas en la grilla con las horas-hombre y
// colaboradores cargados en Productividad para el mismo mes.
router.get('/productividad', (req, res) => {
  const plantel = leerPlantel();
  const db = leerDB();
  const personas = enriquecer(plantel);
  const registros = db.productividadMensual;
  const extra = db.productividadExtra || [];

  let anio = Number(req.query.anio), mesNro = Number(req.query.mes);
  if (!anio || !mesNro) {
    const ultimo = [...registros].sort((a, b) => b.anio - a.anio || b.mesNro - a.mesNro)[0];
    anio = ultimo ? ultimo.anio : null;
    mesNro = ultimo ? ultimo.mesNro : null;
  }

  const filas = plantel.unidades.map((u) => {
    const activas = personas.filter((p) => p.unidad === u.clave && trabaja(p));
    const horasSemana = activas.reduce((acc, p) => acc + p.horasSemana, 0);
    const horasMesProg = horasSemana * SEMANAS_POR_MES;
    // Lo que la propia planilla calcula (columna de horas/mes: horas por día × 26).
    const conPlanilla = activas.filter((p) => p.horasMesPlanilla);
    const horasMesPlanilla = conPlanilla.length ? conPlanilla.reduce((acc, p) => acc + p.horasMesPlanilla, 0) : null;
    const suc = db.sucursales.find((s) => s.id === u.sucursalId);
    const real = u.sucursalId
      ? registros.find((r) => r.sucursalId === u.sucursalId && r.anio === anio && r.mesNro === mesNro)
      : extra.find((r) => r.unidad === u.nombre && r.anio === anio && r.mesNro === mesNro);
    return {
      clave: u.clave,
      nombre: u.nombre,
      formato: suc ? suc.formato : null,
      dotacionGrilla: activas.length,
      horasSemanaProg: redondear(horasSemana, 0),
      horasMesProg: redondear(horasMesProg, 0),
      horasMesPlanilla,
      colaboradores: real ? real.colaboradores : null,
      horasReales: real ? real.horas : null,
      tickets: real ? real.tickets : null,
      deltaHorasPct: real && real.horas ? redondear((horasMesProg / real.horas - 1) * 100) : null,
      deltaDotacion: real ? redondear(activas.length - real.colaboradores) : null,
      ticketsPorHoraProg: real && horasMesProg ? redondear(real.tickets / horasMesProg, 2) : null,
      ticketsPorHoraReal: real && real.horas ? redondear(real.tickets / real.horas, 2) : null
    };
  });

  const mes = registros.find((r) => r.anio === anio && r.mesNro === mesNro);
  res.json({ anio, mesNro, mes: mes ? mes.mes : null, semanasPorMes: redondear(SEMANAS_POR_MES, 2), diasSemana: plantel.config.diasSemana, unidades: filas });
});

router.get('/export.csv', (req, res) => {
  const plantel = leerPlantel();
  const personas = enriquecer(plantel);
  const nombreUnidad = Object.fromEntries(plantel.unidades.map((u) => [u.clave, u.nombre]));
  const celda = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const encabezado = ['Unidad', 'Sector', 'Puesto', 'Nombre', 'Modalidad', 'Horario', 'Franco', 'Horas semana', 'Ausencia', ...HORAS.map((h) => `${h} hs`)];
  const filas = personas.map((p) => [
    nombreUnidad[p.unidad], p.sector, p.puesto, p.nombre || '(vacante)', p.modalidad, p.horario, p.franco,
    String(p.horasSemana).replace('.', ','), p.ausencia ? 'sí' : '', ...p.bloques.split('')
  ]);
  // Separador ";" para que Excel en español lo abra en columnas directamente.
  const csv = '﻿' + [encabezado, ...filas].map((f) => f.map(celda).join(';')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="plantel-horarios.csv"');
  res.send(csv);
});

// ---------- escritura ----------

// Acepta los dos Excel de origen (horarios y plantel), juntos o por separado,
// o el HTML/JSON del artifact. Con sólo el plantel, se actualizan las
// posiciones sobre la grilla ya cargada.
router.post('/importar', upload.array('archivo', 3), (req, res) => {
  const archivos = req.files || [];
  if (!archivos.length) return res.status(400).json({ error: 'no se recibió ningún archivo' });
  const anterior = leerPlantel();
  const sucursales = leerDB().sucursales;
  let convertido;
  try {
    const libros = {};
    let dataset = null;
    for (const a of archivos) {
      if (/\.(xlsx|xlsm|xls)$/i.test(a.originalname)) {
        const wb = XLSX.read(a.buffer, { type: 'buffer', cellStyles: true });
        if (esLibroHorarios(wb)) libros.horarios = wb;
        else if (esLibroPlantel(wb)) libros.plantel = wb;
        else throw new Error(`"${a.originalname}" no parece la planilla de horarios ni la de plantel`);
      } else {
        dataset = extraerDataset(a.buffer.toString('utf-8'));
      }
    }
    if (libros.horarios) {
      convertido = convertirLibros(libros, sucursales);
      if (!libros.plantel) {
        // Sin plantel nuevo se conservan las posiciones y cajas declaradas que había.
        Object.assign(convertido, { posiciones: anterior.posiciones, pool: anterior.pool, columnasPlantel: anterior.columnasPlantel || [], notasPlantel: anterior.notasPlantel || [] });
        convertido.nextId.posiciones = anterior.nextId.posiciones;
        convertido.unidades.forEach((u) => {
          const previa = anterior.unidades.find((x) => x.clave === u.clave);
          if (previa) u.cajasDeclaradas = previa.cajasDeclaradas;
        });
      }
    } else if (libros.plantel) {
      if (!anterior.personas.length) throw new Error('primero importá la planilla de horarios (o subí las dos juntas)');
      const pl = leerLibroPlantel(libros.plantel, anterior.unidades, anterior.personas);
      convertido = {
        posiciones: pl.posiciones,
        pool: pl.pool,
        columnasPlantel: pl.columnas,
        notasPlantel: pl.notas,
        unidades: anterior.unidades.map((u) => ({ ...u, cajasDeclaradas: pl.cajasPorUnidad[u.clave] ?? u.cajasDeclaradas })),
        nextId: { ...anterior.nextId, posiciones: pl.nextId }
      };
    } else if (dataset) {
      convertido = convertirDataset(dataset, sucursales);
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  const plantel = {
    ...anterior,
    ...convertido,
    // Lo que el usuario configuró a mano sobrevive a una reimportación.
    minimos: anterior.minimos,
    config: anterior.config
  };
  plantel.importacion = {
    fecha: new Date().toISOString(),
    archivo: archivos.map((a) => a.originalname).join(' + '),
    unidades: plantel.unidades.length,
    personas: plantel.personas.length,
    posiciones: plantel.posiciones.length,
    descartadas: plantel.descartadas.length
  };
  guardarPlantel(plantel);
  res.status(201).json(plantel.importacion);
});

router.post('/personas', (req, res) => {
  const plantel = leerPlantel();
  try {
    const base = { puesto: '', sector: 'Otros', modalidad: 'completa', nombre: null, horario: '', franco: '', bloques: bloquesVacios(), colores: [] };
    const datos = validarPersona(req.body, plantel, base);
    const orden = Math.max(-1, ...plantel.personas.filter((p) => p.unidad === datos.unidad).map((p) => p.orden ?? 0)) + 1;
    const persona = { id: nuevoIdPlantel(plantel, 'personas'), orden, ...datos };
    plantel.personas.push(persona);
    guardarPlantel(plantel);
    res.status(201).json(persona);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/personas/:id', (req, res) => {
  const plantel = leerPlantel();
  const idx = plantel.personas.findIndex((p) => p.id === Number(req.params.id));
  if (idx < 0) return res.status(404).json({ error: 'persona no encontrada' });
  try {
    plantel.personas[idx] = validarPersona(req.body, plantel, plantel.personas[idx]);
    guardarPlantel(plantel);
    res.json(plantel.personas[idx]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/personas/:id', (req, res) => {
  const plantel = leerPlantel();
  plantel.personas = plantel.personas.filter((p) => p.id !== Number(req.params.id));
  guardarPlantel(plantel);
  res.status(204).end();
});

router.put('/minimos', (req, res) => {
  const lista = Array.isArray(req.body) ? req.body : req.body.minimos;
  if (!Array.isArray(lista)) return res.status(400).json({ error: 'se espera una lista de mínimos' });
  const plantel = leerPlantel();
  const claves = new Set(['*', ...plantel.unidades.map((u) => u.clave)]);
  const minimos = [];
  for (const m of lista) {
    const regla = { unidad: m.unidad || '*', sector: m.sector, desde: Number(m.desde), hasta: Number(m.hasta), minimo: Number(m.minimo) };
    if (!claves.has(regla.unidad)) return res.status(400).json({ error: `unidad inexistente: ${regla.unidad}` });
    if (regla.sector !== 'Todos' && !SECTORES.includes(regla.sector)) return res.status(400).json({ error: `sector inválido: ${regla.sector}` });
    if (!(regla.desde >= 7 && regla.hasta <= 22 && regla.desde < regla.hasta)) return res.status(400).json({ error: 'el rango horario tiene que estar entre 7 y 22 hs' });
    if (!(regla.minimo >= 0)) return res.status(400).json({ error: 'el mínimo tiene que ser un número' });
    minimos.push(regla);
  }
  plantel.minimos = minimos;
  guardarPlantel(plantel);
  res.json(minimos);
});

router.put('/config', (req, res) => {
  const plantel = leerPlantel();
  const diasSemana = Number(req.body.diasSemana);
  if (!(diasSemana >= 5 && diasSemana <= 6)) return res.status(400).json({ error: 'diasSemana tiene que ser 5 o 6' });
  plantel.config = { ...plantel.config, diasSemana };
  guardarPlantel(plantel);
  res.json(plantel.config);
});

router.put('/unidades/:clave', (req, res) => {
  const plantel = leerPlantel();
  const u = plantel.unidades.find((x) => x.clave === req.params.clave);
  if (!u) return res.status(404).json({ error: 'unidad no encontrada' });
  if (req.body.cajasDeclaradas !== undefined) u.cajasDeclaradas = req.body.cajasDeclaradas === null ? null : Number(req.body.cajasDeclaradas);
  if (req.body.sucursalId !== undefined) u.sucursalId = req.body.sucursalId === null ? null : Number(req.body.sucursalId);
  guardarPlantel(plantel);
  res.json(u);
});

export default router;
