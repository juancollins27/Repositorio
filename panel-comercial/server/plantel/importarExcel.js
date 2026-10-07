// Lee directamente las dos planillas de origen:
//
// - HORARIOS DE SUC. (una hoja por unidad: LP, FZ, …, ECOM): puesto, nombre,
//   una columna por hora de 7 a 21 pintada con color de relleno, el horario
//   escrito y el franco. Al pie, "PARTE MÉDICO PROLONGADO" y totales. Trae
//   además las hojas "TOTAL SUC." (lista de part time) y "Ausencias".
// - PLANTEL (hoja "prox planteles"): una fila por posición y una columna por
//   sucursal numerada, más un bloque aparte de encargados y subs sin sucursal.
//
// Devuelve el mismo modelo que importar.js, así el resto del módulo no se
// entera de dónde vinieron los datos.

import XLSX from 'xlsx';
import { normalizarTexto, HORAS, SECTORES, bloquesVacios, similitudNombres, UMBRAL_PROBABLE } from './analisis.js';

const NOMBRES_UNIDAD = {
  LP: 'López y Planes', FZ: 'Facundo Zuviría', MN: 'Mercado Norte', CT: 'Corrientes', LR: 'La Rioja',
  UR: 'Uruguay', GP: 'General Paz', COL: 'Colastiné', JDR: 'J. de la Rosa', BCE: 'Balcarce',
  JDG: 'J. de Garay', PP: 'Plaza', ECOM: 'E-Commerce'
};

// Claves de hoja → nombre en la pestaña Sucursales (E-Commerce no es sucursal).
const ALIAS_SUCURSAL = {
  LP: 'Lopez y Planes', FZ: 'Facundo Zuviria', MN: 'Mercado Norte', CT: 'Corrientes', LR: 'La Rioja',
  UR: 'Uruguay', GP: 'Gral. Paz', COL: 'Colastiné', JDR: 'Javier de la Rosa', BCE: 'Balcarce',
  JDG: 'Juan de Garay', PP: 'Puerto Plaza'
};

const HOJAS_NO_UNIDAD = ['total suc.', 'ausencias'];

const n = (v) => normalizarTexto(v).replace(/\s+/g, ' ').trim();
const limpiarNombre = (v) => String(v ?? '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();

export function sectorDesdePuesto(puesto) {
  const p = n(puesto);
  if (/encarg|superv|aux sup|jefe de sup/.test(p)) return 'Conducción';
  if (/caj|cartel/.test(p)) return 'Cajas';
  if (/salon|deposito|repositor/.test(p)) return 'Salón y depósito';
  if (/carni/.test(p)) return 'Carnicería';
  if (/verdu|panad|lacteo|fiamb|friamb|rotis|salad/.test(p)) return 'Frescos';
  return 'Otros';
}

// Una celda de hora cuenta como trabajada si tiene relleno de color. El
// blanco (rgb FFFFFF o el color de tema 0 sin oscurecer) es "sin pintar".
function celdaPintada(celda) {
  const s = celda && celda.s;
  if (!s || s.patternType !== 'solid' || !s.fgColor) return { pintada: false, color: null };
  const c = s.fgColor;
  if (c.rgb === undefined && c.theme === undefined) return { pintada: false, color: null };
  if (c.rgb && /^(FF)?FFFFFF$/i.test(c.rgb)) return { pintada: false, color: null };
  if (c.theme === 0 && !(c.tint < 0)) return { pintada: false, color: null };
  return { pintada: true, color: c.rgb ? c.rgb.slice(-6).toUpperCase() : null };
}

// Filas de la hoja con índice de columna absoluto (algunas hojas empiezan en
// la columna B: sin esto las horas quedan corridas una posición).
function filasDeHoja(hoja) {
  const origen = XLSX.utils.decode_range(hoja['!ref'] || 'A1').s;
  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '', raw: true, blankrows: true });
  const desplazadas = filas.map((f) => [...Array(origen.c).fill(''), ...f]);
  return [...Array.from({ length: origen.r }, () => []), ...desplazadas];
}

// El encabezado de la grilla se reconoce por la fila de horas 7…21 (el texto
// de la columna de puesto varía: "PUESTO / SECTOR", "NOMBRES", hasta un "7").
function horasDelEncabezado(fila) {
  // Busca la corrida 7, 8, …, 21 en columnas consecutivas (así un "26" o un
  // "7" suelto en la columna de puesto no confunden).
  const t = fila.map(n);
  for (let c = 0; c + HORAS.length <= t.length; c++) {
    if (HORAS.every((h, k) => t[c + k] === String(h))) {
      return Object.fromEntries(HORAS.map((h, k) => [h, c + k]));
    }
  }
  return null;
}

function esEncabezado(fila) {
  const textos = fila.map(n);
  return Boolean(horasDelEncabezado(fila)) && textos.some((t) => t.startsWith('puesto') || t === 'nombre' || t === 'horarios');
}

function leerEncabezado(fila) {
  const horas = horasDelEncabezado(fila) || {};
  const textos = fila.map(n);
  const cols = { puesto: -1, nombre: textos.indexOf('nombre'), horas, horario: textos.indexOf('horarios'), franco: -1 };
  cols.franco = textos.findIndex((t) => /compensatorio|franco/.test(t));
  if (cols.franco < 0) cols.franco = textos.findIndex((t) => t.startsWith('observ'));
  // Si el encabezado no los rotula (segundo bloque de Corrientes y
  // Colastiné), horario y franco siguen estando a la derecha de las 21.
  if (cols.horario < 0 && horas[21] !== undefined) cols.horario = horas[21] + 1;
  if (cols.franco < 0 && horas[21] !== undefined) cols.franco = cols.horario + 1;
  if (cols.nombre >= 0) cols.puesto = cols.nombre - 1;
  else {
    cols.puesto = textos.findIndex((t) => t.startsWith('puesto'));
    cols.nombre = cols.puesto + 1;
  }
  return cols;
}

function nombreDeTitulo(texto) {
  const t = String(texto).replace(/horarios\s+sucursal\s*\.?/i, '').replace(/\b(actual|fecha)\b/gi, '').replace(/\s+/g, ' ').trim();
  return t ? t.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()) : null;
}

export function leerHorarios(wb, sucursales) {
  const porNombre = new Map(sucursales.map((s) => [normalizarTexto(s.nombre), s.id]));
  const unidades = [], personas = [], descartadas = [];
  let id = 1;

  wb.SheetNames.filter((nombreHoja) => !HOJAS_NO_UNIDAD.includes(nombreHoja.trim().toLowerCase())).forEach((nombreHoja) => {
    const hoja = wb.Sheets[nombreHoja];
    const filas = filasDeHoja(hoja);
    const clave = nombreHoja.trim().toUpperCase();
    let cols = null, parteMedico = false, titulo = null, orden = 0;
    let bloque = [];

    // Un bloque sin ninguna hora pintada es una propuesta o un borrador
    // escrito debajo de la grilla vigente (pasa en Balcarce): no se importa.
    // Una segunda grilla que vuelve a empezar por el encargado es otra versión
    // de la misma sucursal (pasa en Balcarce): vale la primera. Corrientes y
    // Colastiné sí tienen un segundo bloque, pero con otros sectores.
    let yaHuboConduccion = false;
    const cerrarBloque = () => {
      const conHoras = bloque.some((x) => x.bloques.includes('1'));
      const repiteConduccion = yaHuboConduccion && bloque.some((x) => /^encargad/.test(n(x.puesto)));
      if (conHoras && !repiteConduccion) {
        personas.push(...bloque);
        if (bloque.some((x) => /^encargad/.test(n(x.puesto)))) yaHuboConduccion = true;
      } else {
        const motivo = repiteConduccion ? 'segunda versión de la grilla en la misma hoja (se toma la primera)' : 'bloque sin horas pintadas';
        bloque.filter((x) => x.nombre).forEach((x) => descartadas.push({ unidad: clave, puesto: x.puesto, nombre: x.nombre, motivo }));
      }
      bloque = [];
    };

    filas.forEach((fila, r) => {
      if (!fila) return;
      const textos = fila.map(n);
      const tituloIdx = textos.findIndex((t) => t.startsWith('horarios sucursal'));
      if (tituloIdx >= 0) {
        if (!titulo) titulo = nombreDeTitulo(fila[tituloIdx]);
        else descartadas.push({ unidad: clave, puesto: String(fila[tituloIdx]).trim(), nombre: null, motivo: 'título de un segundo bloque dentro de la hoja' });
        return;
      }
      if (esEncabezado(fila)) {
        cerrarBloque();
        cols = leerEncabezado(fila);
        parteMedico = false;
        return;
      }
      if (!cols) return;
      const puesto = String(fila[cols.puesto] ?? '').trim();
      const nombre = limpiarNombre(fila[cols.nombre]);
      const p = n(puesto);
      if (/^part(e)? med/.test(p)) { parteMedico = true; return; }
      if (/^(total|no operativo|part time$)/.test(p) || /^total/.test(n(nombre))) return;
      // Celdas sueltas con números (subtotales al pie) no son personas.
      if (!puesto && (!nombre || /^[\d.,+\s]+$/.test(nombre))) return;
      const celdas = HORAS.map((h) => celdaPintada(hoja[XLSX.utils.encode_cell({ r, c: cols.horas[h] })]));
      const bloques = celdas.map((c) => (c.pintada ? '1' : '0')).join('');
      // Debajo de "PARTE MÉDICO PROLONGADO" sólo vienen nombres; si aparece un
      // puesto con horas, es otra vez grilla.
      if (parteMedico && puesto && bloques.includes('1')) parteMedico = false;
      const horasMes = Number(fila[cols.puesto - 1]);
      bloque.push({
        id: id++,
        unidad: clave,
        orden: orden++,
        puesto: parteMedico ? '' : puesto,
        sector: parteMedico ? 'Otros' : sectorDesdePuesto(puesto),
        modalidad: parteMedico ? 'parte médico' : /part\s*time/.test(p) ? 'part time' : 'completa',
        nombre: nombre || null,
        horario: cols.horario >= 0 ? String(fila[cols.horario] ?? '').trim() : '',
        franco: cols.franco >= 0 ? String(fila[cols.franco] ?? '').trim() : '',
        bloques,
        colores: celdas.map((c) => c.color),
        horasMesPlanilla: Number.isFinite(horasMes) && horasMes > 0 ? horasMes : null
      });
    });
    cerrarBloque();

    if (!personas.some((x) => x.unidad === clave)) return;
    const sucursalId = porNombre.get(normalizarTexto(ALIAS_SUCURSAL[clave] || titulo || '')) ?? null;
    unidades.push({ clave, nombre: NOMBRES_UNIDAD[clave] || titulo || clave, sucursalId, cajasDeclaradas: null });
  });

  return { unidades, personas, descartadas, nextId: id };
}

// "TOTAL SUC.": la columna "PART TIME" lista a las personas part time de la red.
export function leerPartTime(wb) {
  const hoja = wb.Sheets[wb.SheetNames.find((s) => s.trim().toLowerCase() === 'total suc.')];
  if (!hoja) return [];
  const filas = filasDeHoja(hoja);
  const r0 = filas.findIndex((f) => f.some((v) => n(v) === 'part time'));
  if (r0 < 0) return [];
  const c = filas[r0].findIndex((v) => n(v) === 'part time');
  return filas.slice(r0 + 1).map((f) => limpiarNombre(f[c])).filter((v) => v && !/^\d/.test(v));
}

// "Ausencias": nombres en la columna A y un día por columna en la fila 1.
export function leerAusencias(wb) {
  const hoja = wb.Sheets[wb.SheetNames.find((s) => s.trim().toLowerCase() === 'ausencias')];
  if (!hoja) return { periodo: '', nombres: [], dias: {} };
  const filas = filasDeHoja(hoja);
  const fechas = (filas[0] || []).map((v) => (typeof v === 'number' ? XLSX.SSF.parse_date_code(v) : null));
  const primera = fechas.find(Boolean);
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const nombres = [], dias = {};
  filas.slice(1).forEach((f, i) => {
    const nombre = limpiarNombre(f[0]);
    if (!nombre) return;
    nombres.push(nombre);
    const marcados = [];
    fechas.forEach((d, c) => {
      if (!d) return;
      const celda = hoja[XLSX.utils.encode_cell({ r: i + 1, c })];
      const marcada = (celda && celda.v !== undefined && String(celda.v).trim() !== '') || celdaPintada(celda).pintada;
      if (marcada) marcados.push(`${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`);
    });
    if (marcados.length) dias[nombre] = marcados;
  });
  return { periodo: primera ? `${MESES[primera.m - 1]} ${primera.y}` : '', nombres, dias };
}

// "prox planteles": fila de encabezado "PUESTOS | 1 | 2 | …" y, a la derecha,
// columnas con título (ENCARGADOS, SUB, …) que son el pool sin sucursal.
export function leerPlantel(wb, unidades, personas) {
  const hoja = wb.Sheets[wb.SheetNames[0]];
  const filas = filasDeHoja(hoja);
  const r0 = filas.findIndex((f) => f.some((v) => n(v) === 'puestos'));
  if (r0 < 0) throw new Error('no se encontró la fila "PUESTOS" en la planilla de plantel');
  const enc = filas[r0];
  const c0 = enc.findIndex((v) => n(v) === 'puestos');
  const numeradas = enc.map((v, c) => (c > c0 && (typeof v === 'number' || /^\d+$/.test(String(v).trim())) ? c : -1)).filter((c) => c >= 0);
  const pool = {};
  enc.forEach((v, c) => { if (c > Math.max(...numeradas) && n(v)) pool[String(v).trim()] = []; });

  const celdasColumna = {}; // columna → [{posicion, nombre}]
  const cajas = {};
  const notas = [];
  filas.slice(r0 + 1).forEach((f) => {
    const etiqueta = String(f[c0] ?? '').trim();
    if (!etiqueta) return;
    enc.forEach((titulo, c) => {
      const v = limpiarNombre(f[c]);
      if (!v || c <= c0) return;
      if (pool[String(titulo).trim()]) { pool[String(titulo).trim()].push(v); return; }
      if (!numeradas.includes(c)) return;
      if (n(etiqueta) === 'cant cajas') { const k = parseInt(v, 10); if (k) cajas[c] = k; return; }
      // "3 CAJEROS + 1 AUX", "8 + 2 PART TIME": anotaciones, no personas.
      if (/\d/.test(v)) { notas.push({ columna: enc[c], texto: v }); return; }
      (celdasColumna[c] = celdasColumna[c] || []).push({ posicion: etiqueta, nombre: v });
    });
  });

  // Cada columna numerada va a la unidad con la que comparte más nombres; si
  // no comparte ninguno, se asigna por orden (columna 1 = primera hoja, …).
  const asignacion = {};
  const libres = new Set(unidades.map((u) => u.clave));
  const puntajes = [];
  Object.entries(celdasColumna).forEach(([c, lista]) => {
    unidades.forEach((u) => {
      const nombresU = personas.filter((p) => p.unidad === u.clave && p.nombre);
      const coincide = lista.filter((q) => nombresU.some((p) => similitudNombres(q.nombre, p.nombre) >= UMBRAL_PROBABLE)).length;
      if (coincide) puntajes.push({ c: Number(c), clave: u.clave, coincide });
    });
  });
  puntajes.sort((a, b) => b.coincide - a.coincide).forEach(({ c, clave }) => {
    if (asignacion[c] || !libres.has(clave)) return;
    asignacion[c] = clave;
    libres.delete(clave);
  });
  numeradas.forEach((c, i) => {
    if (asignacion[c] || !celdasColumna[c]) return;
    const porOrden = unidades[i] && libres.has(unidades[i].clave) ? unidades[i].clave : null;
    if (porOrden) { asignacion[c] = porOrden; libres.delete(porOrden); }
  });

  const posiciones = [];
  let id = 1;
  numeradas.forEach((c) => {
    const clave = asignacion[c];
    if (!clave) return;
    (celdasColumna[c] || []).forEach((q) => posiciones.push({ id: id++, unidad: clave, posicion: q.posicion, nombre: q.nombre }));
  });
  const cajasPorUnidad = {};
  Object.entries(cajas).forEach(([c, k]) => { if (asignacion[c]) cajasPorUnidad[asignacion[c]] = k; });
  const columnas = numeradas.filter((c) => asignacion[c]).map((c) => ({ columna: enc[c], unidad: asignacion[c] }));

  return {
    posiciones,
    cajasPorUnidad,
    columnas,
    notas,
    pool: {
      encargados: pool[Object.keys(pool).find((k) => /encarg/i.test(k))] || [],
      sub: pool[Object.keys(pool).find((k) => /^sub/i.test(k))] || []
    },
    nextId: id
  };
}

export function esLibroHorarios(wb) {
  return wb.SheetNames.some((s) => {
    const filas = filasDeHoja(wb.Sheets[s]).slice(0, 8);
    return filas.some((f) => f.some((v) => n(v).startsWith('puesto')) && f.some((v) => n(v) === 'horarios'));
  });
}

export function esLibroPlantel(wb) {
  return filasDeHoja(wb.Sheets[wb.SheetNames[0]]).slice(0, 6).some((f) => f.some((v) => n(v) === 'puestos'));
}

// Arma el plantel completo a partir de los libros. El de plantel es opcional:
// sin él se conservan las posiciones que hubiera (las pasa quien llama).
export function convertirLibros({ horarios, plantel }, sucursales) {
  const h = leerHorarios(horarios, sucursales);
  const partTime = leerPartTime(horarios);
  h.personas.forEach((p) => {
    if (p.nombre && p.modalidad === 'completa' && partTime.some((x) => similitudNombres(x, p.nombre) >= 0.9)) p.modalidad = 'part time';
  });
  const ausencias = leerAusencias(horarios);
  const resultado = {
    unidades: h.unidades,
    personas: h.personas,
    ausencias,
    descartadas: h.descartadas,
    nextId: { personas: h.nextId, posiciones: 1 }
  };
  if (plantel) {
    const pl = leerPlantel(plantel, h.unidades, h.personas);
    h.unidades.forEach((u) => { u.cajasDeclaradas = pl.cajasPorUnidad[u.clave] ?? null; });
    Object.assign(resultado, { posiciones: pl.posiciones, pool: pl.pool, columnasPlantel: pl.columnas, notasPlantel: pl.notas });
    resultado.nextId.posiciones = pl.nextId;
  }
  return resultado;
}

export { SECTORES };
