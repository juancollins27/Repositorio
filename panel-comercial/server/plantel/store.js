// El plantel se guarda en su propio archivo (plantel.json), separado de
// db.json: tiene nombres de personas, partes médicos y ausencias, y no
// tiene que terminar en el repositorio. data/plantel.json está en .gitignore.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const PLANTEL_PATH = path.join(DATA_DIR, 'plantel.json');

// Mínimos de arranque: siempre alguien de conducción y al menos dos cajas
// abiertas. Se editan desde la pestaña (Cobertura → Mínimos).
export const MINIMOS_INICIALES = [
  { unidad: '*', sector: 'Conducción', desde: 8, hasta: 21, minimo: 1 },
  { unidad: '*', sector: 'Cajas', desde: 9, hasta: 21, minimo: 2 }
];

function plantelInicial() {
  return {
    unidades: [],
    personas: [],
    posiciones: [],
    ausencias: { periodo: '', nombres: [] },
    pool: { encargados: [], sub: [] },
    descartadas: [],
    minimos: MINIMOS_INICIALES,
    config: { diasSemana: 6 },
    importacion: null,
    nextId: { personas: 1, posiciones: 1 }
  };
}

export function leerPlantel() {
  if (!fs.existsSync(PLANTEL_PATH)) return plantelInicial();
  return { ...plantelInicial(), ...JSON.parse(fs.readFileSync(PLANTEL_PATH, 'utf-8')) };
}

export function guardarPlantel(plantel) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PLANTEL_PATH, JSON.stringify(plantel, null, 2));
}

export function nuevoIdPlantel(plantel, coleccion) {
  const id = plantel.nextId[coleccion] || 1;
  plantel.nextId[coleccion] = id + 1;
  return id;
}
