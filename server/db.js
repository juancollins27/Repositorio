import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

export function leerDB() {
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
