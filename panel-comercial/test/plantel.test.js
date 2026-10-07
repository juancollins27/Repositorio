import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsearHorario, bloquesDesdeTramos, parsearFranco, horasSemanales, similitudNombres,
  cobertura, huecosDeCobertura, grillaCoincideConTexto, filasRepetidas, UMBRAL_PROBABLE
} from '../server/plantel/analisis.js';
import { convertirDataset, extraerDataset } from '../server/plantel/importar.js';

test('lee los formatos de horario de la planilla', () => {
  assert.deepEqual(parsearHorario('07:30 a 12:00 - 16:30 a 21:00 Hs.').tramos, [[450, 720], [990, 1260]]);
  assert.deepEqual(parsearHorario('8 :00 A 13: 30  /  17: 30  A  21 .').tramos, [[480, 810], [1050, 1260]]);
  assert.deepEqual(parsearHorario('12:00 - 21:00HS').tramos, [[720, 1260]]);
  assert.equal(parsearHorario('20/08 LICENCIA MATERNIDAD'), null);
});

test('elige la variante "//" que coincide con la grilla pintada', () => {
  const texto = '07:00 A 12:00 - 17:00 A 21:00 HS. // 08:00 a 17:00 Hs.';
  assert.deepEqual(parsearHorario(texto, '011111111100000').tramos, [[480, 1020]]);
  assert.equal(grillaCoincideConTexto({ horario: texto, bloques: '011111111100000' }), true);
  assert.equal(grillaCoincideConTexto({ horario: '08:00 a 12:00', bloques: '111110000000000' }), false);
});

test('un tramo que se superpone con el anterior es otra variante, no se suma', () => {
  const v = parsearHorario('07:00 A 12:00 - 18:00 a 21:00 Hs.- 13:00 a 21:00');
  assert.equal(v.minutos, 8 * 60);
  assert.equal(parsearHorario('07:30 a 16:30 Hs. - 12:00 a 21:00', '000001111111110').tramos[0][0], 720);
});

test('pinta la grilla con la misma regla que la planilla (media hora pinta el bloque)', () => {
  const t = parsearHorario('07:30 a 12:00 - 16:30 a 21:00').tramos;
  assert.equal(bloquesDesdeTramos(t), '111110000111110');
  assert.equal(bloquesDesdeTramos(parsearHorario('09:30 a 13:30 - 17:00 a 21:00').tramos), '001111100011110');
});

test('interpreta francos escritos de muchas formas', () => {
  assert.deepEqual(parsearFranco('mierc tard'), { dia: 2, turno: 'tarde', ok: true });
  assert.deepEqual(parsearFranco('MART/TA'), { dia: 1, turno: 'tarde', ok: true });
  assert.deepEqual(parsearFranco('lunes manaña'), { dia: 0, turno: 'mañana', ok: true });
  assert.deepEqual(parsearFranco('juev-ma'), { dia: 3, turno: 'mañana', ok: true });
  assert.equal(parsearFranco('MIERCOLES T/M').ok, false);
  assert.equal(parsearFranco('rotativo').ok, false);
});

test('horas semanales descuentan el medio día de franco', () => {
  const p = { horario: '07:30 a 12:00 - 16:30 a 21:00', bloques: '111110000111110', franco: 'martes tarde' };
  assert.equal(horasSemanales(p, 6), 9 * 6 - 4.5);
  assert.equal(horasSemanales({ ...p, franco: '' }, 6), 54);
});

test('reconoce el mismo nombre escrito distinto sin unir personas distintas', () => {
  const igual = (a, b) => similitudNombres(a, b) >= UMBRAL_PROBABLE;
  assert.ok(igual('IBARRECHE TOMAS', 'IBARRECHEA TOMAS'));
  assert.ok(igual('PEREYRA J.', 'PEREYRA JULIAN'));
  assert.ok(igual('LUCIA FERRANTE', 'FERRANTE LUCIA'));
  assert.ok(igual('MUÑOZ ESTEBAN', 'MUNOZ ESTEBAN'));
  assert.ok(!igual('SOSA RAMIRO', 'SOSA DAMIAN'));
  assert.ok(!igual('VERA PAULA', 'VERA SILVINA'));
});

const persona = (nombre, sector, bloques, franco = '', extra = {}) =>
  ({ unidad: 'X', nombre, sector, bloques, franco, horario: '', modalidad: 'completa', ...extra });

test('cobertura descuenta francos y cuenta una vez a quien está en dos filas', () => {
  const ps = [
    persona('ANA', 'Cajas', '011110000000000'),
    persona('BETO', 'Cajas', '011110000000000', 'martes mañana'),
    persona('ANA', 'Carnicería', '011110000000000'),
    persona('CARLA', 'Cajas', '011110000000000', '', { modalidad: 'parte médico' })
  ];
  assert.equal(cobertura(ps)[1], 2);
  assert.equal(cobertura(ps, { dia: 1 })[1], 1);
  assert.equal(cobertura(ps, { sector: 'Cajas' })[1], 2);
  assert.equal(filasRepetidas(ps).length, 1);
});

test('huecos: una regla de la unidad pisa a la general', () => {
  const ps = [persona('ANA', 'Cajas', '011110000000000')];
  const general = [{ unidad: '*', sector: 'Cajas', desde: 8, hasta: 12, minimo: 2 }];
  assert.equal(huecosDeCobertura(ps, general, 'X', 1).length, 4);
  const conPropia = [...general, { unidad: 'X', sector: 'Cajas', desde: 8, hasta: 12, minimo: 1 }];
  assert.equal(huecosDeCobertura(ps, conPropia, 'X', 1).length, 0);
});

test('el importador lee el HTML del artifact y descarta encabezados pegados en la grilla', () => {
  const D = {
    b: [{
      i: 1, k: 'LP', name: 'López y Planes', cajas: 6,
      rows: [
        { p: 'CAJERO 1', n: 'GOMEZ ANA', s: 'Cajas', sec: 'op', t: '07:30 a 12:00', o: 'mierc tard', h: '111110000000000', cs: [] },
        { p: 'PUESTO / SECTOR', n: 'NOMBRE', s: 'Otros', sec: 'pt', h: '000000000000000' },
        { p: 'PART MEDICO PROLONGADO', n: null, s: 'Otros', sec: 'pt', h: '000000000000000' },
        { p: '', n: 'PEREZ JUANA', s: 'Otros', sec: 'pt', h: '000000000000000' }
      ],
      plantel: [{ l: 'CAJAS 1', n: 'GOMEZ ANA' }]
    }],
    aus: ['Perez Juana'], pool: {}
  };
  const html = `<script>\nconst D=${JSON.stringify(D)};\nconst HRS=[];\n</script>`;
  const r = convertirDataset(extraerDataset(html), [{ id: 1, nombre: 'Lopez y Planes' }]);
  assert.equal(r.unidades[0].sucursalId, 1);
  assert.equal(r.personas.length, 2);
  assert.equal(r.descartadas.length, 2);
  assert.equal(r.personas[1].modalidad, 'parte médico');
});

test('plantel en Excel: cada columna va a la unidad con la que comparte nombres', async () => {
  const { default: XLSX } = await import('xlsx');
  const { leerPlantel, sectorDesdePuesto } = await import('../server/plantel/importarExcel.js');
  const hoja = XLSX.utils.aoa_to_sheet([
    ['ACTUAL'],
    ['PUESTOS', 1, 2, '', 'ENCARGADOS'],
    ['ENCARGADOS', 'GOMEZ ANA', 'PEREZ JUAN', '', 'DIAZ LUIS'],
    ['CANT CAJAS', '6 CAJAS', '4CAJAS'],
    ['CAJAS 1', 'SOSA EVA', '3 CAJEROS + 1 AUX']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hoja, 'prox planteles');
  // Las hojas de horarios están en el orden inverso al de las columnas.
  const unidades = [{ clave: 'B' }, { clave: 'A' }];
  const personas = [{ unidad: 'A', nombre: 'GOMEZ ANA' }, { unidad: 'A', nombre: 'SOSA EVA' }, { unidad: 'B', nombre: 'PEREZ JUAN' }];
  const r = leerPlantel(wb, unidades, personas);
  assert.deepEqual(r.columnas, [{ columna: 1, unidad: 'A' }, { columna: 2, unidad: 'B' }]);
  assert.deepEqual(r.cajasPorUnidad, { A: 6, B: 4 });
  assert.equal(r.posiciones.length, 3);
  assert.deepEqual(r.notas, [{ columna: 2, texto: '3 CAJEROS + 1 AUX' }]);
  assert.deepEqual(r.pool.encargados, ['DIAZ LUIS']);
  assert.equal(sectorDesdePuesto('CAJERO PART TIME 32'), 'Cajas');
  assert.equal(sectorDesdePuesto('JEFA. DE FRIAMBRERIA'), 'Frescos');
  assert.equal(sectorDesdePuesto('AUX. DE SUPERV'), 'Conducción');
});
