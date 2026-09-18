import { Router } from 'express';
import { leerDB, guardarDB, nuevoId } from '../db.js';

const router = Router();

router.get('/', (req, res) => {
  const db = leerDB();
  res.json(db.alumnos);
});

router.post('/', (req, res) => {
  const { nombre, apellido, telefono, email, tarifaHora, notas } = req.body;
  if (!nombre || !apellido) {
    return res.status(400).json({ error: 'nombre y apellido son obligatorios' });
  }

  const db = leerDB();
  const alumno = {
    id: nuevoId(db, 'alumnos'),
    nombre,
    apellido,
    telefono: telefono || '',
    email: email || '',
    tarifaHora: Number(tarifaHora) || 0,
    notas: notas || ''
  };
  db.alumnos.push(alumno);
  guardarDB(db);
  res.status(201).json(alumno);
});

router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = leerDB();
  const alumno = db.alumnos.find((a) => a.id === id);
  if (!alumno) return res.status(404).json({ error: 'alumno no encontrado' });

  const { nombre, apellido, telefono, email, tarifaHora, notas } = req.body;
  Object.assign(alumno, {
    nombre: nombre ?? alumno.nombre,
    apellido: apellido ?? alumno.apellido,
    telefono: telefono ?? alumno.telefono,
    email: email ?? alumno.email,
    tarifaHora: tarifaHora !== undefined ? Number(tarifaHora) : alumno.tarifaHora,
    notas: notas ?? alumno.notas
  });
  guardarDB(db);
  res.json(alumno);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = leerDB();
  db.alumnos = db.alumnos.filter((a) => a.id !== id);
  guardarDB(db);
  res.status(204).end();
});

export default router;
