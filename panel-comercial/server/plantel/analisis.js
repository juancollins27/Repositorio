// Lógica pura del módulo Plantel y Horarios: interpretar los textos de la
// planilla (horario, franco), comparar nombres escritos distinto y calcular
// cobertura por hora. No toca la base: recibe datos y devuelve resultados,
// así se puede probar sola (ver test/plantel.test.js).

// Cada persona tiene 15 bloques de una hora: el bloque i va de HORAS[i] a HORAS[i] + 1.
export const HORAS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
export const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const SECTORES = ['Conducción', 'Cajas', 'Salón y depósito', 'Carnicería', 'Frescos', 'Otros'];
export const MODALIDADES = ['completa', 'part time', 'parte médico'];

// El franco de medio día divide la jornada en mañana (antes de esta hora) y tarde.
export const CORTE_MEDIODIA = 14;

export function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// ---------- horario ----------

function aMinutos(h, m) {
  return Number(h) * 60 + Number(m || 0);
}

// "07:30 a 12:00 - 16:30 a 21:00 Hs." → tramos en minutos desde las 00:00.
// Acepta también "8 :00 A 13: 30 / 17: 30 A 21" y "12:00 - 21:00HS".
function parsearTramos(texto) {
  const patron = /(\d{1,2})\s*(?::\s*(\d{2}))?\s*(?:a|-)\s*(\d{1,2})\s*(?::\s*(\d{2}))?/gi;
  const tramos = [];
  let m;
  while ((m = patron.exec(texto))) {
    const ini = aMinutos(m[1], m[2]);
    const fin = aMinutos(m[3], m[4]);
    if (fin > ini && ini >= 5 * 60 && fin <= 24 * 60) tramos.push([ini, fin]);
  }
  return tramos;
}

// Si la celda trae dos variantes separadas por "//" (semana A / semana B),
// devuelve todas; la principal es la que coincide con la grilla pintada o,
// si ninguna coincide, la primera.
export function parsearHorarioVariantes(texto) {
  if (!texto) return [];
  return String(texto)
    .split('//')
    .map(parsearTramos)
    .filter((t) => t.length)
    .map((tramos) => ({ tramos, minutos: tramos.reduce((acc, [a, b]) => acc + (b - a), 0) }));
}

export function parsearHorario(texto, bloques = null) {
  const variantes = parsearHorarioVariantes(texto);
  if (!variantes.length) return null;
  return (bloques && variantes.find((v) => bloquesDesdeTramos(v.tramos) === bloques)) || variantes[0];
}

// ¿La grilla pintada coincide con alguna variante del horario escrito?
export function grillaCoincideConTexto(persona) {
  const variantes = parsearHorarioVariantes(persona.horario);
  if (!variantes.length) return null;
  return variantes.some((v) => bloquesDesdeTramos(v.tramos) === persona.bloques);
}

// Un bloque se pinta si el tramo lo ocupa al menos media hora: es la misma
// regla con la que está pintada la planilla original (07:30 → pinta las 7).
export function bloquesDesdeTramos(tramos) {
  return HORAS.map((h) => {
    const ini = h * 60, fin = ini + 60;
    const ocupado = tramos.reduce((acc, [a, b]) => acc + Math.max(0, Math.min(fin, b) - Math.max(ini, a)), 0);
    return ocupado >= 30 ? '1' : '0';
  }).join('');
}

export function bloquesVacios() {
  return '0'.repeat(HORAS.length);
}

// ---------- franco ----------

// La planilla escribe el franco de mil formas: "mierc tard", "juev-ta",
// "lunes manaña", "viernes t/t", "martes  m"… Devuelve el día (0 = lunes) y
// el turno libre. "t/m", "rotativo" o "comparte con fdo" quedan sin
// interpretar y se listan en Calidad de datos.
export function parsearFranco(texto) {
  const s = normalizarTexto(texto).trim();
  if (!s) return { dia: null, turno: null, ok: false };
  const dias = [/^lun/, /^mar/, /^mi/, /^jue/, /^vie/, /^sab/];
  const dia = dias.findIndex((re) => re.test(s));
  if (dia < 0) return { dia: null, turno: null, ok: false };
  const resto = s.replace(/^[a-z]+/, '').replace(/[^a-z/]/g, ' ').trim().replace(/^\/+/, '');
  let turno = null;
  if (resto !== 't/m' && resto !== 'm/t') {
    if (resto.startsWith('m')) turno = 'mañana';
    else if (resto.startsWith('t')) turno = 'tarde';
  }
  return { dia, turno, ok: turno !== null };
}

function enTurno(hora, turno) {
  return turno === 'mañana' ? hora < CORTE_MEDIODIA : hora >= CORTE_MEDIODIA;
}

// Bloques que la persona trabaja un día puntual, descontando su franco.
export function bloquesDelDia(persona, dia) {
  const f = persona.francoParseado || parsearFranco(persona.franco);
  if (f.dia !== dia || !f.turno) return persona.bloques;
  return persona.bloques
    .split('')
    .map((b, i) => (b === '1' && enTurno(HORAS[i], f.turno) ? '0' : b))
    .join('');
}

// Horas de trabajo por semana según el texto del horario (más preciso que los
// bloques, que redondean a la hora). Si el texto no se puede leer, se usan los bloques.
export function horasSemanales(persona, diasSemana = 6) {
  const p = parsearHorario(persona.horario, persona.bloques);
  const tramos = p ? p.tramos : tramosDesdeBloques(persona.bloques);
  const diario = tramos.reduce((acc, [a, b]) => acc + (b - a), 0);
  const f = persona.francoParseado || parsearFranco(persona.franco);
  let descuento = 0;
  if (f.turno && f.dia !== null && f.dia < diasSemana) {
    const corte = CORTE_MEDIODIA * 60;
    descuento = tramos.reduce((acc, [a, b]) => {
      const lo = f.turno === 'mañana' ? a : Math.max(a, corte);
      const hi = f.turno === 'mañana' ? Math.min(b, corte) : b;
      return acc + Math.max(0, hi - lo);
    }, 0);
  }
  return (diario * diasSemana - descuento) / 60;
}

function tramosDesdeBloques(bloques) {
  const tramos = [];
  String(bloques || '').split('').forEach((b, i) => {
    if (b !== '1') return;
    const ini = HORAS[i] * 60;
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo[1] === ini) ultimo[1] = ini + 60;
    else tramos.push([ini, ini + 60]);
  });
  return tramos;
}

// Turno cortado = trabaja, corta y vuelve el mismo día.
export function tieneTurnoCortado(bloques) {
  const a = bloques.indexOf('1');
  if (a < 0) return false;
  return /10+1/.test(bloques.slice(a, bloques.lastIndexOf('1') + 1));
}

// ---------- nombres ----------

// "PEREYRA J." → ['pereyra', 'j']; "LOPEZ JUAN(MEDIA JORNADA)" → ['lopez', 'juan'];
// "DIAZ ANA 18/08" → ['diaz', 'ana'].
export function tokensNombre(nombre) {
  return normalizarTexto(nombre)
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function claveNombre(nombre) {
  return [...tokensNombre(nombre)].sort().join(' ');
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function similitudToken(a, b) {
  if (a === b) return 1;
  const corto = a.length <= b.length ? a : b;
  const largo = corto === a ? b : a;
  // Abreviaturas e iniciales: "c" ↔ "carlos", "nico" ↔ "nicolas", "m" ↔ "maria".
  if (largo.startsWith(corto) && (corto.length <= 2 || corto.length >= 4)) return 0.9;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// Parecido entre dos nombres, de 0 a 1, sin importar el orden (apellido
// primero o último). Pide que todos los tokens del nombre más corto tengan
// pareja y que al menos uno sea un token largo y casi igual, para no unir a
// dos personas distintas sólo por compartir un nombre de pila corto.
export function similitudNombres(a, b) {
  const ta = tokensNombre(a), tb = tokensNombre(b);
  if (!ta.length || !tb.length) return 0;
  const [corto, largo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const usados = new Set();
  let suma = 0, ancla = false;
  for (const t of corto) {
    let mejor = 0, idx = -1;
    largo.forEach((u, j) => {
      if (usados.has(j)) return;
      const s = similitudToken(t, u);
      if (s > mejor) { mejor = s; idx = j; }
    });
    if (mejor < 0.75) return 0;
    usados.add(idx);
    suma += mejor;
    if (t.length >= 4 && mejor >= 0.85) ancla = true;
  }
  if (!ancla) return 0;
  // Penaliza un poco cuando al nombre largo le sobran tokens sin pareja.
  return (suma / corto.length) * (corto.length === largo.length ? 1 : 0.97);
}

export const UMBRAL_IGUAL = 0.97;
export const UMBRAL_PROBABLE = 0.8;

export function mejorCoincidencia(nombre, candidatos, campo = 'nombre') {
  let mejor = null;
  for (const c of candidatos) {
    const s = similitudNombres(nombre, c[campo]);
    if (s >= UMBRAL_PROBABLE && (!mejor || s > mejor.score)) mejor = { item: c, score: s };
  }
  return mejor;
}

// ---------- cobertura ----------

export function trabaja(persona) {
  return Boolean(persona.nombre) && persona.modalidad !== 'parte médico';
}

// Personas distintas trabajando en cada bloque horario un día dado (null =
// semana tipo, sin descontar francos). Una persona cargada en dos filas
// (p. ej. cajas y carnicería) cuenta una sola vez por hora.
export function cobertura(personas, { dia = null, sector = null } = {}) {
  const porHora = HORAS.map(() => new Set());
  personas.filter(trabaja).forEach((p) => {
    if (sector && p.sector !== sector) return;
    const b = dia === null ? p.bloques : bloquesDelDia(p, dia);
    const clave = claveNombre(p.nombre);
    b.split('').forEach((x, i) => { if (x === '1') porHora[i].add(clave); });
  });
  return porHora.map((s) => s.size);
}

// Huecos contra los mínimos configurados: cada hora de cada día en que hay
// menos gente que la pedida para ese sector.
export function huecosDeCobertura(personas, minimos, unidad, diasSemana = 6) {
  const reglas = minimos.filter((m) => m.unidad === '*' || m.unidad === unidad);
  // Una regla específica de la unidad pisa a la general del mismo sector.
  const porSector = {};
  reglas.forEach((r) => {
    if (!porSector[r.sector] || r.unidad !== '*') porSector[r.sector] = r;
  });
  const huecos = [];
  Object.values(porSector).forEach((r) => {
    for (let d = 0; d < diasSemana; d++) {
      const cob = cobertura(personas, { dia: d, sector: r.sector === 'Todos' ? null : r.sector });
      HORAS.forEach((h, i) => {
        if (h < r.desde || h >= r.hasta) return;
        if (cob[i] < r.minimo) huecos.push({ dia: d, hora: h, sector: r.sector, hay: cob[i], minimo: r.minimo });
      });
    }
  });
  return huecos;
}

// ---------- personas repetidas ----------

// Misma persona cargada en más de una fila de la misma unidad.

export function filasRepetidas(personas) {
  const grupos = {};
  personas.filter((p) => p.nombre).forEach((p) => {
    const k = `${p.unidad}|${claveNombre(p.nombre)}`;
    (grupos[k] = grupos[k] || []).push(p);
  });
  return Object.values(grupos).filter((g) => g.length > 1);
}
