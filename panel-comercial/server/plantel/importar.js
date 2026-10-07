// Convierte la planilla de plantel y horarios al modelo del módulo.
//
// La fuente es el dataset del artifact "Plantel y Horarios 2026": se puede
// subir la página HTML tal cual (se extrae la constante `D`) o el JSON con
// la misma forma. De paso limpia lo que en la planilla son filas de
// encabezado pegadas en medio de la grilla.

import { normalizarTexto, SECTORES, bloquesVacios } from './analisis.js';

// Claves de sucursal de la planilla → nombre en la pestaña Sucursales.
const ALIAS_SUCURSAL = {
  LP: 'Lopez y Planes',
  FZ: 'Facundo Zuviria',
  MN: 'Mercado Norte',
  CT: 'Corrientes',
  LR: 'La Rioja',
  UR: 'Uruguay',
  GP: 'Gral. Paz',
  COL: 'Colastiné',
  JDR: 'Javier de la Rosa',
  BCE: 'Balcarce',
  JDG: 'Juan de Garay',
  PP: 'Puerto Plaza'
};

// Colores de tema de Excel que la planilla usa en algunas celdas.
const COLORES_TEMA = { 'th7_-0.2': 'BF9000', 'th3_0.4': '8EA9DB', th0_0: null };

const MODALIDAD = { op: 'completa', pt: 'part time', med: 'parte médico' };

function esEncabezado(fila) {
  const p = normalizarTexto(fila.p).trim();
  return /^horarios sucursal/.test(p) || p === 'puesto / sector' || normalizarTexto(fila.n).trim() === 'nombre';
}

function esTituloParteMedico(fila) {
  return /^part(e)? medico/.test(normalizarTexto(fila.p).trim()) && !fila.n;
}

export function extraerDataset(contenido) {
  const texto = String(contenido).trim();
  if (texto.startsWith('{')) return JSON.parse(texto);
  const m = texto.match(/const D=(\{.*?\});\s*\n/s);
  if (!m) throw new Error('no se encontró el dataset: subí el HTML del artifact o el JSON de la planilla');
  return JSON.parse(m[1]);
}

export function convertirDataset(D, sucursales) {
  if (!D || !Array.isArray(D.b)) throw new Error('el archivo no tiene la forma esperada (falta la lista de sucursales "b")');

  const porNombre = new Map(sucursales.map((s) => [normalizarTexto(s.nombre), s.id]));
  const unidades = [];
  const personas = [];
  const posiciones = [];
  const descartadas = [];
  let idPersona = 1, idPosicion = 1;

  D.b.forEach((b) => {
    const alias = ALIAS_SUCURSAL[b.k];
    const sucursalId = porNombre.get(normalizarTexto(alias || b.name)) ?? null;
    unidades.push({ clave: b.k, nombre: b.name, sucursalId, cajasDeclaradas: b.cajas ?? null });

    let enParteMedico = false;
    (b.rows || []).forEach((r, orden) => {
      if (esEncabezado(r)) {
        descartadas.push({ unidad: b.k, puesto: r.p, nombre: r.n, motivo: 'fila de encabezado dentro de la grilla' });
        return;
      }
      if (esTituloParteMedico(r)) {
        enParteMedico = true;
        descartadas.push({ unidad: b.k, puesto: r.p, nombre: r.n, motivo: 'título de sección (parte médico)' });
        return;
      }
      // Debajo de "PART MEDICO PROLONGADO" vienen personas sin puesto: son partes médicos.
      const modalidad = enParteMedico && !r.p ? 'parte médico' : MODALIDAD[r.sec] || 'completa';
      personas.push({
        id: idPersona++,
        unidad: b.k,
        orden,
        puesto: r.p || '',
        sector: SECTORES.includes(r.s) ? r.s : 'Otros',
        modalidad,
        nombre: r.n || null,
        horario: r.t || '',
        franco: r.o || '',
        bloques: /^[01]{15}$/.test(r.h || '') ? r.h : bloquesVacios(),
        colores: (r.cs || []).map((c) => (c && c.startsWith('th') ? COLORES_TEMA[c] ?? null : c || null))
      });
    });

    (b.plantel || []).forEach((q) => {
      posiciones.push({ id: idPosicion++, unidad: b.k, posicion: q.l, nombre: q.n });
    });
  });

  return {
    unidades,
    personas,
    posiciones,
    ausencias: { periodo: 'Septiembre 2026', nombres: D.aus || [] },
    pool: { encargados: (D.pool && D.pool.ENCARGADOS) || [], sub: (D.pool && D.pool.SUB) || [] },
    descartadas,
    nextId: { personas: idPersona, posiciones: idPosicion }
  };
}
