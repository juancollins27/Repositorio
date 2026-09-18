import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const DB_INICIAL = {
  sucursales: [],
  vendedores: [],
  productos: [],
  ventas: [],
  objetivos: [],
  nextId: { sucursales: 1, vendedores: 1, productos: 1, ventas: 1, objetivos: 1 }
};

function asegurarDB() {
  if (fs.existsSync(DB_PATH)) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(DB_INICIAL, null, 2));
}

export function leerDB() {
  asegurarDB();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

export function guardarDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function nuevoId(db, coleccion) {
  const id = db.nextId[coleccion];
  db.nextId[coleccion] = id + 1;
  return id;
}
