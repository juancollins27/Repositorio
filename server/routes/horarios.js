import { Router } from 'express';
import { leerDB, guardarDB, nuevoId } from '../db.js';

const router = Router();

export const DIAS_SEMANA = [
  'lunes',
  'martes',
  'miercoles',
  'jueves',
  'viernes',
  'sabado',
  'domingo'
];

router.get('/', (req, res) => {
  const db = leerDB();
  res.json(db.horarios);
});

router.post('/', (req, res) => {
  const { diaSemana, horaInicio, horaFin } = req.body;

  if (!DIAS_SEMANA.includes(diaSemana)) {
    return res.status(400).json({ error: 'diaSemana invalido' });
  }
  if (!horaInicio || !horaFin || horaInicio >= horaFin) {
    return res.status(400).json({ error: 'horaInicio debe ser menor a horaFin' });
  }

  const db = leerDB();
  const horario = {
    id: nuevoId(db, 'horarios'),
    diaSemana,
    horaInicio,
    horaFin
  };
  db.horarios.push(horario);
  guardarDB(db);
  res.status(201).json(horario);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = leerDB();
  db.horarios = db.horarios.filter((h) => h.id !== id);
  guardarDB(db);
  res.status(204).end();
});

export default router;
