import { Router } from 'express';
import { leerDB, guardarDB, nuevoId } from '../db.js';

const router = Router();

const ESTADOS = ['pendiente', 'confirmado', 'completado', 'cancelado'];

router.get('/', (req, res) => {
  const db = leerDB();
  let turnos = db.turnos;

  const { alumnoId, desde, hasta } = req.query;
  if (alumnoId) turnos = turnos.filter((t) => t.alumnoId === Number(alumnoId));
  if (desde) turnos = turnos.filter((t) => t.fecha >= desde);
  if (hasta) turnos = turnos.filter((t) => t.fecha <= hasta);

  turnos = [...turnos].sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));
  res.json(turnos);
});

router.post('/', (req, res) => {
  const { alumnoId, fecha, horaInicio, horaFin, precio, notas } = req.body;

  if (!alumnoId || !fecha || !horaInicio || !horaFin) {
    return res.status(400).json({ error: 'alumnoId, fecha, horaInicio y horaFin son obligatorios' });
  }
  if (horaInicio >= horaFin) {
    return res.status(400).json({ error: 'horaInicio debe ser menor a horaFin' });
  }

  const db = leerDB();
  const alumno = db.alumnos.find((a) => a.id === Number(alumnoId));
  if (!alumno) return res.status(404).json({ error: 'alumno no encontrado' });

  const turno = {
    id: nuevoId(db, 'turnos'),
    alumnoId: Number(alumnoId),
    fecha,
    horaInicio,
    horaFin,
    precio: Number(precio) || 0,
    estado: 'pendiente',
    notas: notas || '',
    facturaId: null
  };
  db.turnos.push(turno);
  guardarDB(db);
  res.status(201).json(turno);
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = leerDB();
  const turno = db.turnos.find((t) => t.id === id);
  if (!turno) return res.status(404).json({ error: 'turno no encontrado' });

  const { estado, precio, notas } = req.body;
  if (estado !== undefined) {
    if (!ESTADOS.includes(estado)) {
      return res.status(400).json({ error: `estado invalido, debe ser uno de: ${ESTADOS.join(', ')}` });
    }
    turno.estado = estado;
  }
  if (precio !== undefined) turno.precio = Number(precio);
  if (notas !== undefined) turno.notas = notas;

  guardarDB(db);
  res.json(turno);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const db = leerDB();
  db.turnos = db.turnos.filter((t) => t.id !== id);
  guardarDB(db);
  res.status(204).end();
});

export default router;
