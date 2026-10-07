// Pestaña "Plantel y Horarios". Usa api() y ejeYNiveles() de app.js, y la
// misma lógica de horarios/francos que el servidor (server/plantel/analisis.js).
import {
  HORAS, DIAS, SECTORES, parsearHorario, bloquesDesdeTramos, parsearFranco,
  horasSemanales, cobertura, normalizarTexto, trabaja
} from '/plantel-analisis.js';

const COLOR_SECTOR = {
  'Conducción': 'var(--sec-cond)',
  'Cajas': 'var(--sec-cajas)',
  'Salón y depósito': 'var(--sec-salon)',
  'Carnicería': 'var(--sec-carn)',
  'Frescos': 'var(--sec-frescos)',
  'Otros': 'var(--sec-otros)'
};
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const VISTAS = [
  ['resumen', 'Resumen'],
  ['sucursal', 'Sucursal'],
  ['cobertura', 'Cobertura y huecos'],
  ['calidad', 'Calidad de datos'],
  ['productividad', 'Plantel × Productividad'],
  ['config', 'Importar y configurar']
];

const st = {
  vista: 'resumen', unidad: null, dia: '', sector: 'Todos',
  cobDia: '', cobSector: 'Cajas', busqueda: '', prod: null
};
let P = null;   // GET /api/plantel
let R = null;   // GET /api/plantel/resumen
let C = null;   // GET /api/plantel/calidad (bajo demanda)
let H = null;   // GET /api/plantel/huecos (bajo demanda)
let minimosEdit = null;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtHora = (h) => String(h).padStart(2, '0') + ' hs';
const fmtNum = (n) => (n === null || n === undefined ? '–' : Number(n).toLocaleString('es-AR'));
const fmtPct = (n) => (n === null || n === undefined ? '–' : `${n > 0 ? '+' : ''}${n.toLocaleString('es-AR')}%`);
const unidadNombre = (clave) => (P.unidades.find((u) => u.clave === clave) || {}).nombre || clave;
const personasDe = (clave) => P.personas.filter((p) => p.unidad === clave);

// ---------- carga ----------

async function cargarPlantel() {
  P = await api('/api/plantel');
  R = P.vacio ? null : await api('/api/plantel/resumen');
  C = null;
  H = null;
  minimosEdit = null;
  if (!st.unidad && P.unidades.length) st.unidad = P.unidades[0].clave;
  if (P.vacio && st.vista !== 'config') st.vista = 'vacio';
  else if (!P.vacio && st.vista === 'vacio') st.vista = 'resumen';
  await render();
}

async function asegurarCalidad() { if (!C) C = await api('/api/plantel/calidad'); }
async function asegurarHuecos() { if (!H) H = await api('/api/plantel/huecos'); }

// ---------- piezas comunes ----------

function colorBloque(p, i) {
  const c = p.colores && p.colores[i];
  return c ? `#${c}` : COLOR_SECTOR[p.sector] || 'var(--accent)';
}

// Tira de 15 horas. Con día elegido, las horas que caen en el franco se ven rayadas.
function tira(p, dia = null) {
  const f = p.francoParseado || parsearFranco(p.franco);
  return `<div class="pl-tira">${HORAS.map((h, i) => {
    if (p.bloques[i] !== '1') return '<i></i>';
    const libre = dia !== null && f.dia === dia && f.turno && (f.turno === 'mañana' ? h < 14 : h >= 14);
    return `<i class="${libre ? 'libre' : 'on'}" style="--c:${colorBloque(p, i)}" title="${fmtHora(h)}${libre ? ' · franco' : ''}"></i>`;
  }).join('')}</div>`;
}

function tiraBloques(bloques, color = 'var(--accent)') {
  return `<div class="pl-tira">${bloques.split('').map((b) => (b === '1' ? `<i class="on" style="--c:${color}"></i>` : '<i></i>')).join('')}</div>`;
}

function ejeHoras() {
  return `<div class="pl-tira pl-eje">${HORAS.map((h) => `<span>${h}</span>`).join('')}</div>`;
}

function etiquetas(p) {
  let t = '';
  if (p.modalidad === 'part time') t += '<span class="pl-tag">part time</span>';
  if (p.modalidad === 'parte médico') t += '<span class="pl-tag">parte médico</span>';
  if (p.ausencia) t += '<span class="pl-tag aviso" title="Figura en la hoja de ausencias">ausencia</span>';
  if (p.grillaOk === false) t += '<span class="pl-tag alerta" title="La grilla pintada no coincide con el horario escrito">grilla ≠ horario</span>';
  if (p.nombre && trabaja(p) && !p.francoParseado.ok) t += '<span class="pl-tag alerta" title="No se pudo leer el franco">franco ?</span>';
  return t;
}

function pills(lista, activo, attr) {
  return `<div class="pl-pills">${lista.map(([v, l]) => `<button type="button" class="pl-pill" ${attr}="${esc(v)}" aria-pressed="${String(v) === String(activo)}">${esc(l)}</button>`).join('')}</div>`;
}

function leyendaSectores(sectores = SECTORES) {
  return `<div class="pl-leyenda">${sectores.map((s) => `<span><i style="background:${COLOR_SECTOR[s]}"></i>${s}</span>`).join('')}</div>`;
}

function tile(label, value, extra = '', clase = '') {
  return `<div class="stat-tile"><div class="label">${label}</div><div class="value ${clase}">${value}</div>${extra ? `<div class="delta">${extra}</div>` : ''}</div>`;
}

// Barras apiladas por sector, en SVG como el resto del panel.
function graficoApilado(series, sectores) {
  const ancho = 640, alto = 230;
  const m = { top: 18, right: 10, bottom: 26, left: 36 };
  const w = ancho - m.left - m.right, h = alto - m.top - m.bottom;
  const totales = HORAS.map((_, i) => sectores.reduce((acc, s) => acc + series[s][i], 0));
  const niveles = ejeYNiveles(Math.max(...totales, 1));
  const maxEje = niveles[niveles.length - 1];
  const y = (v) => h - (v / maxEje) * h;
  const banda = w / HORAS.length, barra = Math.min(28, banda * 0.7);
  const grid = niveles.map((n) => `<line class="gridline" x1="0" y1="${y(n)}" x2="${w}" y2="${y(n)}"/><text class="eje-texto" x="-8" y="${y(n) + 4}" text-anchor="end">${n}</text>`).join('');
  const barras = HORAS.map((hr, i) => {
    let acum = 0;
    const x = banda * i + (banda - barra) / 2;
    const rects = sectores.map((s) => {
      const v = series[s][i];
      if (!v) return '';
      const r = `<rect x="${x}" y="${y(acum + v)}" width="${barra}" height="${y(acum) - y(acum + v)}" fill="${COLOR_SECTOR[s]}"><title>${s}: ${v} a las ${hr} hs</title></rect>`;
      acum += v;
      return r;
    }).join('');
    return `${rects}${totales[i] ? `<text class="valor-texto" x="${x + barra / 2}" y="${y(totales[i]) - 5}" text-anchor="middle">${totales[i]}</text>` : ''}<text class="eje-texto" x="${x + barra / 2}" y="${h + 17}" text-anchor="middle">${hr}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${ancho} ${alto}" width="100%" role="img" aria-label="Personas trabajando por hora"><g transform="translate(${m.left},${m.top})">${grid}<line class="baseline" x1="0" y1="${h}" x2="${w}" y2="${h}"/>${barras}</g></svg>`;
}

// ---------- vistas ----------

function vVacio() {
  return `<div class="card pl-vacio">
    <h2>Todavía no hay plantel cargado</h2>
    <p class="card-nota">Subí los dos Excel (HORARIOS DE SUC. y PLANTEL) para ver la dotación de cada sucursal, la cobertura por hora,
    los huecos contra los mínimos y el cruce con Productividad.</p>
    <button type="button" data-pl-vista="config">Importar planilla</button>
  </div>`;
}

function vResumen() {
  const T = R.totales;
  const totalHora = HORAS.map((_, i) => SECTORES.reduce((acc, s) => acc + R.coberturaPorSector[s][i], 0));
  const pico = Math.max(...totalHora);
  const conHuecos = [...R.unidades].sort((a, b) => b.huecos - a.huecos)[0];
  const conDif = [...R.unidades].sort((a, b) => b.diferencias - a.diferencias)[0];
  const sectores = SECTORES.filter((s) => R.coberturaPorSector[s].some(Boolean));

  let frase = `La red tiene <strong>${T.personas} personas</strong> en grilla en ${T.unidades} unidades, con el pico de <strong>${pico} personas a las ${HORAS[totalHora.indexOf(pico)]} hs</strong>. `;
  frase += `El ${T.cortadoPct}% trabaja con turno cortado. `;
  if (T.huecos) frase += `Contra los mínimos configurados hay <strong>${T.huecos} horas-sector sin cubrir</strong> en la semana, la mayoría en ${esc(conHuecos.nombre)} (${conHuecos.huecos}). `;
  if (T.diferencias) frase += `${esc(conDif.nombre)} es la unidad con más diferencias entre plantel y horarios (${conDif.diferencias}).`;

  const filas = R.unidades.map((u) => `<tr class="pl-fila-click" data-pl-unidad="${u.clave}">
    <td><strong>${esc(u.nombre)}</strong></td>
    <td class="num">${u.personas}</td>
    <td class="num">${u.cajas}${u.cajasDeclaradas ? ` / ${u.cajasDeclaradas}` : ''}</td>
    <td class="num">${u.partTime}</td>
    <td class="num">${u.parteMedico || ''}</td>
    <td class="num">${u.vacantes || ''}</td>
    <td class="num">${u.ausencias || ''}</td>
    <td class="num">${u.cortadoPct}%</td>
    <td class="num">${fmtNum(u.horasSemana)}</td>
    <td class="num">${u.pico} · ${u.picoHora} hs</td>
    <td class="num ${u.huecos ? 'delta-critical' : ''}">${u.huecos || '–'}</td>
    <td class="num ${u.diferencias ? 'delta-warning' : ''}">${u.diferencias || '–'}</td>
  </tr>`).join('');

  return `
    <div class="stat-grid pl-stats">
      ${tile('Personas en grilla', T.personas, `${T.unidades} unidades`)}
      ${tile('En cajas', T.cajas)}
      ${tile('Horas programadas', fmtNum(T.horasSemana), 'por semana')}
      ${tile('Turno cortado', `${T.cortadoPct}%`)}
      ${tile('Huecos de cobertura', T.huecos, 'horas-sector / semana', T.huecos ? 'delta-critical' : 'delta-good')}
      ${tile('Diferencias de datos', T.diferencias, 'plantel vs. horarios', T.diferencias ? 'delta-warning' : 'delta-good')}
    </div>
    <div class="insight"><span class="marca">☞</span><span>${frase}</span></div>
    <div class="card pl-card">
      <h2>Personas trabajando por hora, toda la red</h2>
      ${leyendaSectores(sectores)}
      <div class="chart-wrap">${graficoApilado(R.coberturaPorSector, sectores)}</div>
      <p class="hint">Semana tipo, sin descontar francos. Una persona cargada en dos filas cuenta una vez por hora.</p>
    </div>
    <div class="card pl-card">
      <h2>Unidades</h2>
      <div class="chart-wrap"><table class="pl-tabla">
        <thead><tr><th>Unidad</th><th class="num">Personas</th><th class="num">Cajeros / cajas</th><th class="num">Part time</th>
        <th class="num">Parte méd.</th><th class="num">Vacantes</th><th class="num">Ausencias</th><th class="num">Cortado</th>
        <th class="num">Horas/sem</th><th class="num">Pico</th><th class="num">Huecos</th><th class="num">Diferencias</th></tr></thead>
        <tbody>${filas}</tbody>
      </table></div>
      <p class="hint">Tocá una unidad para ver su grilla. ${T.ausencias ? `Ausencias: ${T.ausencias} nombres en la hoja de ${esc(T.periodoAusencias)}.` : ''}</p>
    </div>`;
}

function barrasCobertura(valores) {
  const max = Math.max(...valores, 1);
  return `<div class="pl-cob">${valores.map((v, i) => `<div title="${fmtHora(HORAS[i])}: ${v}"><small>${v || ''}</small><i style="height:${(v / max) * 90}px"></i></div>`).join('')}</div>${ejeHoras()}`;
}

async function vSucursal() {
  await asegurarCalidad();
  const u = P.unidades.find((x) => x.clave === st.unidad);
  const r = R.unidades.find((x) => x.clave === st.unidad);
  const propias = personasDe(st.unidad);
  const dia = st.dia === '' ? null : Number(st.dia);
  const sector = st.sector === 'Todos' ? null : st.sector;
  const cob = cobertura(propias, { dia, sector });
  const sectoresPresentes = SECTORES.filter((s) => propias.some((p) => p.sector === s));
  const cruce = C.cruce[st.unidad];

  const grupos = SECTORES.filter((s) => !sector || s === sector).map((s) => {
    const filas = propias.filter((p) => p.sector === s).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    if (!filas.length) return '';
    return `<div class="pl-gsec"><i style="background:${COLOR_SECTOR[s]}"></i>${s} · ${filas.filter((p) => p.nombre).length}</div>
      ${filas.map((p) => `<div class="pl-grow" data-pl-editar="${p.id}" tabindex="0">
        <div class="pl-who"><b>${p.nombre ? esc(p.nombre) : '<em>Vacante</em>'}${etiquetas(p)}</b><small>${esc(p.puesto)}</small></div>
        ${tira(p, dia)}
        <div class="pl-when"><b>${esc(p.horario)}</b>${p.franco ? `<br>Franco: ${esc(p.franco)}` : ''}${p.horasSemana ? ` · ${String(p.horasSemana).replace('.', ',')} h/sem` : ''}</div>
      </div>`).join('')}`;
  }).join('');

  const lista = (items, campo, sub) => (items.length ? `<ul class="pl-lista">${items.map((x) => `<li>${esc(x[campo])}<span>${esc(sub(x))}</span></li>`).join('')}</ul>` : '<p class="ok-texto">Sin diferencias</p>');

  return `
    <div class="pl-barra">
      <label class="periodo-label">Unidad
        <select id="pl-sel-unidad">${P.unidades.map((x) => `<option value="${x.clave}" ${x.clave === st.unidad ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select>
      </label>
      <button type="button" data-pl-nueva="${st.unidad}">+ Agregar persona</button>
    </div>
    <div class="stat-grid">
      ${tile('Personas en grilla', r.personas, r.partTime ? `${r.partTime} part time` : '')}
      ${tile('Cajeros', `${r.cajas}${u.cajasDeclaradas ? ` / ${u.cajasDeclaradas}` : ''}`, u.cajasDeclaradas ? 'en grilla / cajas declaradas' : '')}
      ${tile('Horas programadas', fmtNum(r.horasSemana), 'por semana')}
      ${tile('Pico', r.pico, `a las ${r.picoHora} hs`)}
      ${tile('Huecos', r.huecos, 'horas-sector / semana', r.huecos ? 'delta-critical' : 'delta-good')}
    </div>
    <div class="card pl-card">
      <div class="pl-barra">
        ${pills([['', 'Semana tipo'], ...DIAS.map((d, i) => [i, d])], st.dia, 'data-pl-dia')}
        ${pills([['Todos', 'Todos'], ...sectoresPresentes.map((s) => [s, s])], st.sector, 'data-pl-sector')}
      </div>
      <h2>Personas por hora${dia !== null ? ` · ${DIAS[dia]} (con francos descontados)` : ''}</h2>
      ${barrasCobertura(cob)}
    </div>
    <div class="card pl-card">
      <h2>Grilla de horarios</h2>
      <div class="chart-wrap"><div class="pl-gantt">
        <div class="pl-grow pl-ghead"><div>Persona</div>${ejeHoras()}<div>Horario</div></div>
        ${grupos}
      </div></div>
      <p class="hint">Tocá una fila para editarla. ${dia !== null ? 'Las horas rayadas son el franco de ese día.' : 'Elegí un día para ver los francos descontados.'}</p>
    </div>
    <div class="chart-grid">
      <div class="card"><h2>En el plantel, sin horario · ${cruce.sinHorario.length}</h2>${lista(cruce.sinHorario, 'nombre', (x) => x.posicion)}</div>
      <div class="card"><h2>En horarios, sin plantel · ${cruce.sinPlantel.length}</h2>${lista(cruce.sinPlantel, 'nombre', (x) => x.puesto)}</div>
    </div>
    ${cruce.enOtraUnidad.length || cruce.probables.length ? `<div class="card pl-card"><h2>Para revisar</h2>
      ${cruce.enOtraUnidad.map((x) => `<p class="pl-nota-item"><strong>${esc(x.nombre)}</strong> figura en ${x.segun === 'plantel' ? 'el plantel' : 'los horarios'} de ${esc(u.nombre)} y en ${x.segun === 'plantel' ? 'los horarios' : 'el plantel'} de <strong>${esc(unidadNombre(x.otraUnidad))}</strong>.</p>`).join('')}
      ${cruce.probables.map((x) => `<p class="pl-nota-item">"${esc(x.posicion.nombre)}" (plantel) y "${esc(x.persona.nombre)}" (horarios) parecen la misma persona. <button type="button" class="link" data-pl-unificar="${x.persona.id}" data-nombre="${esc(x.posicion.nombre)}">Usar el nombre del plantel</button></p>`).join('')}
    </div>` : ''}`;
}

// Junta horas consecutivas: [14,15,16] → "14–17 hs".
function rangos(horas) {
  const out = [];
  horas.sort((a, b) => a - b).forEach((h) => {
    const u = out[out.length - 1];
    if (u && u[1] === h) u[1] = h + 1;
    else out.push([h, h + 1]);
  });
  return out.map(([a, b]) => (b - a === 1 ? `${a} hs` : `${a}–${b} hs`)).join(', ');
}

async function vCobertura() {
  await asegurarHuecos();
  const dia = st.cobDia === '' ? null : Number(st.cobDia);
  const sector = st.cobSector === 'Todos' ? null : st.cobSector;
  const matriz = P.unidades.map((u) => cobertura(personasDe(u.clave), { dia, sector }));
  const max = Math.max(...matriz.flat(), 1);
  const huecoEn = (clave, i) => dia !== null && H.unidades.find((x) => x.clave === clave).huecos
    .some((h) => h.dia === dia && h.hora === HORAS[i] && (!sector || h.sector === sector));

  const heat = P.unidades.map((u, ui) => `<button type="button" class="pl-rl" data-pl-unidad="${u.clave}">${esc(u.nombre)}</button>
    ${matriz[ui].map((v, i) => {
      const p = v / max;
      const bg = v ? `color-mix(in oklab, var(--series-1) ${Math.round(10 + p * 90)}%, var(--surface))` : 'var(--surface-2)';
      return `<div class="pl-hc ${huecoEn(u.clave, i) ? 'hueco' : ''}" style="background:${bg};color:${p > 0.55 ? '#fff' : 'var(--ink)'}" title="${esc(u.nombre)} · ${fmtHora(HORAS[i])}: ${v}">${v || ''}</div>`;
    }).join('')}
    <div class="pl-hpk">${Math.max(...matriz[ui])}</div>`).join('');

  const detalle = H.unidades.filter((u) => u.total).map((u) => {
    const grupos = {};
    u.huecos.filter((h) => dia === null || h.dia === dia).forEach((h) => {
      const k = `${h.sector}|${h.dia}|${h.minimo}`;
      (grupos[k] = grupos[k] || { ...h, horas: [], hay: [] }).horas.push(h.hora);
      grupos[k].hay.push(h.hay);
    });
    const items = Object.values(grupos).sort((a, b) => a.dia - b.dia || a.sector.localeCompare(b.sector));
    if (!items.length) return '';
    return `<div class="card pl-hueco-card"><h2>${esc(u.nombre)} <span class="pl-badge">${items.reduce((a, g) => a + g.horas.length, 0)}</span></h2>
      <ul class="pl-lista">${items.map((g) => `<li><b><span class="pl-dia">${DIAS_CORTOS[g.dia]}</span>${rangos(g.horas)}</b><span>${esc(g.sector)}: ${Math.min(...g.hay)} de ${g.minimo}</span></li>`).join('')}</ul></div>`;
  }).join('');

  return `
    <div class="card pl-card">
      <div class="pl-barra">
        ${pills([['', 'Semana tipo'], ...DIAS.map((d, i) => [i, d])], st.cobDia, 'data-pl-cobdia')}
        ${pills([['Todos', 'Todos'], ...SECTORES.map((s) => [s, s])], st.cobSector, 'data-pl-cobsector')}
      </div>
      <h2>Personas por hora y unidad${sector ? ` · ${sector}` : ''}${dia !== null ? ` · ${DIAS[dia]}` : ''}</h2>
      <div class="chart-wrap"><div class="pl-heat">
        <div></div>${HORAS.map((h) => `<div class="pl-hh">${h}</div>`).join('')}<div class="pl-hh">pico</div>
        ${heat}
      </div></div>
      <p class="hint">${dia === null ? 'Semana tipo, sin francos. Elegí un día para descontar los francos y marcar en rojo las horas que quedan debajo del mínimo.' : 'Con borde rojo: horas debajo del mínimo configurado para ese sector.'}</p>
    </div>
    <div class="seccion-titulo"><span class="eyebrow">Contra los mínimos</span><h2>Huecos de cobertura${dia !== null ? ` · ${DIAS[dia]}` : ' en la semana'}</h2></div>
    <p class="hint">Mínimos actuales: ${H.minimos.map((m) => `${esc(m.sector)} ≥ ${m.minimo} de ${m.desde} a ${m.hasta} hs${m.unidad !== '*' ? ` (${esc(unidadNombre(m.unidad))})` : ''}`).join(' · ')}.
      Sólo se miran las horas en que la unidad está abierta. <button type="button" class="link" data-pl-vista="config">Cambiar mínimos</button></p>
    <div class="pl-huecos">${detalle || '<p class="ok-texto">No hay huecos con los mínimos actuales.</p>'}</div>`;
}

async function vCalidad() {
  await asegurarCalidad();
  const unidades = P.unidades.map((u) => ({ u, c: C.cruce[u.clave] }));
  const probables = unidades.flatMap(({ u, c }) => c.probables.map((x) => ({ ...x, unidad: u })));
  const otraUnidad = unidades.flatMap(({ u, c }) => c.enOtraUnidad.map((x) => ({ ...x, unidad: u })));
  const sinHorario = unidades.flatMap(({ u, c }) => c.sinHorario.map((x) => ({ ...x, unidad: u })));
  const sinPlantel = unidades.flatMap(({ u, c }) => c.sinPlantel.map((x) => ({ ...x, unidad: u })));

  const seccion = (titulo, n, nota, cuerpo) => `<details class="card pl-det" ${n ? 'open' : ''}><summary><h2>${titulo} <span class="pl-badge ${n ? '' : 'ok'}">${n}</span></h2></summary><p class="card-nota">${nota}</p>${n ? cuerpo : '<p class="ok-texto">Nada para revisar.</p>'}</details>`;
  const editar = (id) => `<button type="button" class="link" data-pl-editar="${id}">Editar</button>`;

  return `
    <div class="insight"><span class="marca">☞</span><span>Antes de mirar la cobertura conviene que los datos estén limpios: cada arreglo de abajo cambia los números de las otras vistas.
      Hay <strong>${probables.length}</strong> nombres casi iguales, <strong>${C.grillaDistinta.length}</strong> grillas que no coinciden con el horario escrito
      y <strong>${C.francosSinLeer.length}</strong> francos que no se pueden interpretar.</span></div>

    ${seccion('Nombres casi iguales en plantel y horarios', probables.length,
      'Misma persona escrita distinto (letra de más, abreviatura, tilde). Unificar deja el nombre del plantel en la grilla.',
      `<table class="pl-tabla"><thead><tr><th>Unidad</th><th>En plantel</th><th>En horarios</th><th class="num">Parecido</th><th></th></tr></thead><tbody>
      ${probables.map((x) => `<tr><td>${esc(x.unidad.nombre)}</td><td>${esc(x.posicion.nombre)}</td><td>${esc(x.persona.nombre)}</td><td class="num">${Math.round(x.score * 100)}%</td>
        <td><button type="button" class="link" data-pl-unificar="${x.persona.id}" data-nombre="${esc(x.posicion.nombre)}">Unificar</button></td></tr>`).join('')}</tbody></table>`)}

    ${seccion('Cargados en otra unidad', otraUnidad.length,
      'La persona está en el plantel de una unidad y en los horarios de otra. Suele ser un traslado sin actualizar o planillas cruzadas.',
      `<table class="pl-tabla"><thead><tr><th>Persona</th><th>Posición</th><th>Plantel</th><th>Horarios</th><th></th></tr></thead><tbody>
      ${otraUnidad.map((x) => `<tr><td>${esc(x.nombre)}</td><td>${esc(x.posicion)}</td>
        <td>${esc(x.segun === 'plantel' ? x.unidad.nombre : unidadNombre(x.otraUnidad))}</td>
        <td>${esc(x.segun === 'plantel' ? unidadNombre(x.otraUnidad) : x.unidad.nombre)}</td>
        <td>${x.personaId ? editar(x.personaId) : ''}</td></tr>`).join('')}</tbody></table>`)}

    ${seccion('Grilla pintada distinta del horario escrito', C.grillaDistinta.length,
      'La celda dice un horario y la grilla tiene pintadas otras horas. La cobertura usa la grilla: si el texto es el correcto, repintá.',
      `<div class="pl-gantt pl-gantt-mini">${C.grillaDistinta.map((p) => `<div class="pl-grow pl-grow-cal">
        <div class="pl-who"><b>${esc(p.nombre)}</b><small>${esc(unidadNombre(p.unidad))} · ${esc(p.puesto)}</small></div>
        <div>${tiraBloques(p.bloques, 'var(--status-warning)')}${tiraBloques(p.bloquesSegunTexto, 'var(--series-1)')}</div>
        <div class="pl-when"><b>${esc(p.horario)}</b><br><button type="button" class="link" data-pl-repintar="${p.id}" data-bloques="${p.bloquesSegunTexto}">Repintar según horario</button> ${editar(p.id)}</div>
      </div>`).join('')}</div>
      <p class="hint">Arriba, en ocre: lo pintado. Abajo, en azul: lo que dice el texto.</p>`)}

    ${seccion('Francos que no se pueden leer', C.francosSinLeer.length,
      'Sin franco legible no se puede descontar del día correspondiente. Formato sugerido: "martes tarde" o "jueves mañana".',
      `<ul class="pl-lista">${C.francosSinLeer.map((p) => `<li>${esc(p.nombre)} <span>${esc(unidadNombre(p.unidad))} · "${esc(p.franco || 'vacío')}" ${editar(p.id)}</span></li>`).join('')}</ul>`)}

    ${seccion('Misma persona en dos filas', C.repetidas.length,
      'Cuenta una sola vez en la cobertura, pero suma horas dos veces en el cruce con Productividad.',
      `<ul class="pl-lista">${C.repetidas.map((g) => `<li>${esc(g[0].nombre)} <span>${esc(unidadNombre(g[0].unidad))} · ${g.map((p) => `${esc(p.puesto)} ${editar(p.id)}`).join(' + ')}</span></li>`).join('')}</ul>`)}

    ${seccion('En el plantel pero sin horario', sinHorario.length, 'Posiciones del plantel sin ninguna fila en la grilla.',
      `<ul class="pl-lista">${sinHorario.map((x) => `<li>${esc(x.nombre)}<span>${esc(x.unidad.nombre)} · ${esc(x.posicion)}</span></li>`).join('')}</ul>`)}

    ${seccion('En horarios pero no en el plantel', sinPlantel.length, 'Personas con horario que no figuran en el plantel por posición.',
      `<ul class="pl-lista">${sinPlantel.map((x) => `<li>${esc(x.nombre)}<span>${esc(x.unidad.nombre)} · ${esc(x.puesto)} ${editar(x.id)}</span></li>`).join('')}</ul>`)}

    ${seccion('Puestos vacantes', C.vacantes.length, 'Filas de la grilla sin nombre. Las que tienen horas pintadas son turnos previstos sin cubrir.',
      `<ul class="pl-lista">${C.vacantes.map((p) => `<li>${esc(p.puesto || '(sin puesto)')}<span>${esc(unidadNombre(p.unidad))}${p.conGrilla ? ' · con horario pintado' : ''} ${editar(p.id)}</span></li>`).join('')}</ul>`)}

    ${seccion('Personas con ausencias que no aparecen en ninguna grilla', C.ausenciasNoEncontradas.length, 'Pueden ser bajas o nombres escritos muy distinto.',
      `<div class="pl-chips">${C.ausenciasNoEncontradas.map((n) => `<span class="pl-chip">${esc(n)}</span>`).join('')}</div>`)}

    ${seccion('Filas descartadas al importar', C.descartadas.length, 'Encabezados repetidos dentro de la grilla que la planilla tenía como si fueran personas.',
      `<ul class="pl-lista">${C.descartadas.map((d) => `<li>${esc(d.puesto)}${d.nombre ? ` / ${esc(d.nombre)}` : ''}<span>${esc(unidadNombre(d.unidad))} · ${esc(d.motivo)}</span></li>`).join('')}</ul>`)}`;
}

function graficoDelta(filas) {
  const datos = filas.filter((f) => f.deltaHorasPct !== null);
  if (!datos.length) return '<p class="hint">No hay datos de Productividad para ese mes.</p>';
  const ancho = 980, fila = 30, alto = datos.length * fila + 30;
  const izq = 170, der = 70, w = ancho - izq - der;
  const lim = Math.max(10, ...datos.map((d) => Math.abs(d.deltaHorasPct)));
  const x = (v) => izq + w / 2 + (v / lim) * (w / 2);
  const barras = datos.map((d, i) => {
    const y0 = i * fila + 6, alto2 = fila - 12;
    const color = Math.abs(d.deltaHorasPct) <= 5 ? 'var(--status-good)' : d.deltaHorasPct < 0 ? 'var(--status-critical)' : 'var(--status-warning)';
    const xa = Math.min(x(0), x(d.deltaHorasPct)), largo = Math.abs(x(d.deltaHorasPct) - x(0));
    // La etiqueta va afuera de la barra; si no entra (barra larga hacia la izquierda), va adentro en blanco.
    const neg = d.deltaHorasPct < 0;
    const adentro = neg && xa - 60 < izq;
    const tx = adentro ? xa + 6 : neg ? xa - 6 : xa + largo + 6;
    return `<text class="pl-svg-label" x="${izq - 12}" y="${y0 + alto2 / 2 + 4}" text-anchor="end">${esc(d.nombre)}</text>
      <rect x="${xa}" y="${y0}" width="${Math.max(largo, 2)}" height="${alto2}" rx="3" fill="${color}"/>
      <text class="valor-texto" x="${tx}" y="${y0 + alto2 / 2 + 4}" text-anchor="${adentro || !neg ? 'start' : 'end'}" ${adentro ? 'style="fill:#fff"' : ''}>${fmtPct(d.deltaHorasPct)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${ancho} ${alto}" width="100%" role="img" aria-label="Diferencia de horas por unidad">
    <line class="baseline" x1="${x(0)}" y1="0" x2="${x(0)}" y2="${alto - 22}"/>
    ${barras}
    <text class="eje-texto" x="${x(-lim)}" y="${alto - 6}">← grilla con menos horas</text>
    <text class="eje-texto" x="${x(lim)}" y="${alto - 6}" text-anchor="end">grilla con más horas →</text>
  </svg>`;
}

async function vProductividad() {
  const registros = await api('/api/productividad');
  const meses = [...new Map(registros.map((r) => [`${r.anio}-${r.mesNro}`, r])).values()].sort((a, b) => b.anio - a.anio || b.mesNro - a.mesNro);
  const q = st.prod ? `?anio=${st.prod.split('-')[0]}&mes=${st.prod.split('-')[1]}` : '';
  const d = await api(`/api/plantel/productividad${q}`);
  st.prod = `${d.anio}-${d.mesNro}`;
  const filas = d.unidades;
  const conDatos = filas.filter((f) => f.horasReales);
  const prog = conDatos.reduce((a, f) => a + f.horasMesProg, 0), real = conDatos.reduce((a, f) => a + f.horasReales, 0);
  const peor = [...conDatos].sort((a, b) => a.deltaHorasPct - b.deltaHorasPct)[0];

  let frase = `En ${esc(d.mes)} ${d.anio} la grilla programa <strong>${fmtNum(prog)} horas</strong> contra <strong>${fmtNum(real)} horas-hombre</strong> cargadas en Productividad (${fmtPct(Math.round((prog / real - 1) * 1000) / 10)}). `;
  if (peor && peor.deltaHorasPct < -10) frase += `La brecha más grande es <strong>${esc(peor.nombre)}</strong> (${fmtPct(peor.deltaHorasPct)}): ${peor.dotacionGrilla} personas en grilla contra ${fmtNum(peor.colaboradores)} colaboradores. `;
  frase += 'Si la grilla tiene menos horas, falta cargar gente o hay horas extra. Si tiene más, puede haber ausencias o licencias que no se descontaron.';

  return `
    <div class="pl-barra">
      <label class="periodo-label">Mes de Productividad
        <select id="pl-sel-mes">${meses.map((m) => `<option value="${m.anio}-${m.mesNro}" ${`${m.anio}-${m.mesNro}` === st.prod ? 'selected' : ''}>${esc(m.mes)} ${m.anio}</option>`).join('')}</select>
      </label>
    </div>
    <div class="insight"><span class="marca">☞</span><span>${frase}</span></div>
    <div class="card pl-card"><h2>Horas programadas vs. horas-hombre reales</h2>
      <div class="chart-wrap">${graficoDelta(filas)}</div>
      <p class="hint">Horas programadas = horas por semana de la grilla × ${String(d.semanasPorMes).replace('.', ',')} semanas por mes, con ${d.diasSemana} días por semana y el franco descontado. En verde: dentro de ±5%.</p>
    </div>
    <div class="card pl-card"><h2>Detalle por unidad</h2>
      <div class="chart-wrap"><table class="pl-tabla">
        <thead><tr><th>Unidad</th><th class="num">En grilla</th><th class="num">Colaboradores</th><th class="num">Δ personas</th>
          <th class="num">Horas/mes grilla</th><th class="num" title="Columna de horas/mes de la propia planilla (horas por día × 26)">Según planilla</th><th class="num">Horas-hombre reales</th><th class="num">Δ horas</th>
          <th class="num">Tickets/hora real</th><th class="num">Tickets/hora grilla</th></tr></thead>
        <tbody>${filas.map((f) => `<tr class="pl-fila-click" data-pl-unidad="${f.clave}"><td><strong>${esc(f.nombre)}</strong>${f.formato ? ` <span class="formato-badge ${f.formato.toLowerCase()}">${f.formato}</span>` : ''}</td>
          <td class="num">${f.dotacionGrilla}</td><td class="num">${fmtNum(f.colaboradores)}</td>
          <td class="num delta-cell ${f.deltaDotacion < 0 ? 'neg' : ''}">${f.deltaDotacion === null ? '–' : (f.deltaDotacion > 0 ? '+' : '') + fmtNum(f.deltaDotacion)}</td>
          <td class="num">${fmtNum(f.horasMesProg)}</td><td class="num pl-tenue">${fmtNum(f.horasMesPlanilla)}</td><td class="num">${fmtNum(f.horasReales)}</td>
          <td class="num delta-cell ${f.deltaHorasPct < -5 ? 'neg' : f.deltaHorasPct > 5 ? '' : 'pos'}">${fmtPct(f.deltaHorasPct)}</td>
          <td class="num">${fmtNum(f.ticketsPorHoraReal)}</td><td class="num">${fmtNum(f.ticketsPorHoraProg)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>`;
}

function vConfig() {
  if (!minimosEdit) minimosEdit = P.minimos.map((m) => ({ ...m }));
  const opcUnidad = (sel) => `<option value="*" ${sel === '*' ? 'selected' : ''}>Todas</option>${P.unidades.map((u) => `<option value="${u.clave}" ${u.clave === sel ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('')}`;
  const opcSector = (sel) => ['Todos', ...SECTORES].map((s) => `<option ${s === sel ? 'selected' : ''}>${s}</option>`).join('');
  const imp = P.importacion;
  return `
    <div class="panel-grid">
      <div class="card">
        <h2>Importar planilla</h2>
        <p class="card-nota">Subí las planillas tal cual: <strong>HORARIOS DE SUC.</strong> (una hoja por sucursal, con la grilla pintada)
          y <strong>PLANTEL</strong> (hoja "prox planteles"). Podés subir las dos juntas o sólo una: con sólo el plantel se actualizan
          las posiciones sobre la grilla que ya está cargada. Los mínimos y la configuración se mantienen.</p>
        <form id="pl-form-importar">
          <label>Archivos (.xlsx; también acepta el HTML del artifact) <input type="file" id="pl-archivo" accept=".xlsx,.xlsm,.html,.htm,.json" multiple required /></label>
          <div class="form-actions"><button type="submit">Importar</button></div>
        </form>
        <p class="hint" id="pl-import-estado">${imp ? `Última importación: ${esc(imp.archivo)}, ${new Date(imp.fecha).toLocaleString('es-AR')} · ${imp.personas} filas de grilla en ${imp.unidades} unidades${imp.posiciones !== undefined ? ` · ${imp.posiciones} posiciones de plantel` : ''} · ${imp.descartadas} filas descartadas (ver Calidad de datos).` : ''}</p>
        ${P.columnasPlantel.length ? `<details class="pl-columnas"><summary class="hint">Cómo se leyeron las columnas del plantel</summary>
          <p class="hint">Cada columna numerada se asigna a la hoja de horarios con la que comparte más nombres.</p>
          <ul class="pl-lista">${P.columnasPlantel.map((c) => `<li>Columna ${esc(c.columna)}<span>${esc(unidadNombre(c.unidad))}</span></li>`).join('')}</ul>
          ${P.notasPlantel.length ? `<p class="hint">Anotaciones que no son personas: ${P.notasPlantel.map((x) => `"${esc(x.texto)}" (col. ${esc(x.columna)})`).join(', ')}.</p>` : ''}
        </details>` : ''}
        <p class="hint">Los datos del plantel se guardan en <code>plantel.json</code>, aparte del resto del panel, y no se suben al repositorio.</p>
        ${P.vacio ? '' : '<p><a class="pl-boton-link" href="/api/plantel/export.csv" download>Descargar grilla en CSV (Excel)</a></p>'}
      </div>
      <div class="card">
        <h2>Mínimos de cobertura</h2>
        <p class="card-nota">Cuántas personas tiene que haber como mínimo, por sector y franja horaria. Una regla de una unidad puntual reemplaza a la regla general del mismo sector.</p>
        <table class="pl-tabla pl-minimos">
          <thead><tr><th>Unidad</th><th>Sector</th><th class="num">Desde</th><th class="num">Hasta</th><th class="num">Mínimo</th><th></th></tr></thead>
          <tbody>${minimosEdit.map((m, i) => `<tr data-pl-min="${i}">
            <td><select data-campo="unidad">${opcUnidad(m.unidad)}</select></td>
            <td><select data-campo="sector">${opcSector(m.sector)}</select></td>
            <td><input type="number" data-campo="desde" min="7" max="21" value="${m.desde}"/></td>
            <td><input type="number" data-campo="hasta" min="8" max="22" value="${m.hasta}"/></td>
            <td><input type="number" data-campo="minimo" min="0" max="50" value="${m.minimo}"/></td>
            <td><button type="button" class="link" data-pl-min-borrar="${i}">Quitar</button></td></tr>`).join('')}</tbody>
        </table>
        <div class="form-actions">
          <button type="button" class="pl-secundario" data-pl-min-agregar>+ Regla</button>
          <button type="button" data-pl-min-guardar>Guardar mínimos</button>
        </div>
        <p class="hint" id="pl-min-estado"></p>
        <h2 style="margin-top:1.4rem">Semana laboral</h2>
        <label class="periodo-label">Días trabajados por semana
          <select id="pl-dias-semana">${[5, 6].map((n) => `<option value="${n}" ${n === P.config.diasSemana ? 'selected' : ''}>${n} (${n === 6 ? 'lunes a sábado' : 'lunes a viernes'})</option>`).join('')}</select>
        </label>
        <p class="hint">Se usa para las horas por semana y para el cruce con Productividad.</p>
      </div>
    </div>`;
}

function vBuscar() {
  const q = normalizarTexto(st.busqueda).trim();
  const res = P.personas.filter((p) => [p.nombre, p.puesto, unidadNombre(p.unidad), p.sector].some((x) => normalizarTexto(x).includes(q))).slice(0, 100);
  return `<div class="card pl-card"><h2>${res.length} resultado${res.length === 1 ? '' : 's'} para "${esc(st.busqueda)}"</h2>
    <div class="chart-wrap"><div class="pl-gantt">
      <div class="pl-grow pl-ghead"><div>Persona</div>${ejeHoras()}<div>Unidad y horario</div></div>
      ${res.map((p) => `<div class="pl-grow" data-pl-editar="${p.id}" tabindex="0">
        <div class="pl-who"><b>${p.nombre ? esc(p.nombre) : '<em>Vacante</em>'}${etiquetas(p)}</b><small>${esc(p.puesto)} · ${esc(p.sector)}</small></div>
        ${tira(p)}
        <div class="pl-when"><b>${esc(unidadNombre(p.unidad))}</b><br>${esc(p.horario)}${p.franco ? ` · Franco: ${esc(p.franco)}` : ''}</div>
      </div>`).join('')}
    </div></div></div>`;
}

async function render() {
  const nav = $('pl-subnav');
  nav.innerHTML = P.vacio ? '' : VISTAS.map(([k, l]) => `<button type="button" class="pl-subtab ${st.vista === k ? 'activa' : ''}" data-pl-vista="${k}">${l}</button>`).join('');
  const vistas = { vacio: vVacio, resumen: vResumen, sucursal: vSucursal, cobertura: vCobertura, calidad: vCalidad, productividad: vProductividad, config: vConfig, buscar: vBuscar };
  const cont = $('pl-vista');
  try {
    cont.innerHTML = await vistas[st.vista]();
  } catch (err) {
    cont.innerHTML = `<p class="hint pl-error">No se pudo cargar esta vista: ${esc(err.message)}</p>`;
  }
}

// ---------- edición ----------

const edicion = { persona: null, bloques: '0'.repeat(15), manual: false, original: null };

function pintarGrillaEdicion() {
  $('plf-grilla').innerHTML = HORAS.map((h, i) => `<button type="button" class="${edicion.bloques[i] === '1' ? 'on' : ''}" data-plf-hora="${i}" title="${fmtHora(h)}">${h}</button>`).join('');
  const datos = { horario: $('plf-horario').value, bloques: edicion.bloques, franco: $('plf-franco').value };
  const hs = horasSemanales(datos, P.config.diasSemana);
  $('plf-horas').textContent = edicion.bloques.includes('1') ? `${String(Math.round(hs * 10) / 10).replace('.', ',')} horas por semana` : '';
}

function leerFrancoEdicion() {
  const f = parsearFranco($('plf-franco').value);
  $('plf-franco-lectura').textContent = $('plf-franco').value
    ? (f.ok ? `→ ${DIAS[f.dia]} a la ${f.turno}` : 'No se puede interpretar (probá "martes tarde")')
    : '';
}

function abrirDialogo(persona, unidad) {
  edicion.persona = persona;
  edicion.bloques = persona ? persona.bloques : '0'.repeat(15);
  edicion.original = edicion.bloques;
  edicion.manual = false;
  $('pl-dialogo-titulo').textContent = persona ? (persona.nombre || 'Puesto vacante') : 'Agregar persona';
  $('plf-unidad').innerHTML = P.unidades.map((u) => `<option value="${u.clave}">${esc(u.nombre)}</option>`).join('');
  $('plf-sector').innerHTML = SECTORES.map((s) => `<option>${s}</option>`).join('');
  $('plf-modalidad').innerHTML = P.modalidades.map((m) => `<option>${m}</option>`).join('');
  $('plf-nombre').value = persona ? persona.nombre || '' : '';
  $('plf-puesto').value = persona ? persona.puesto : '';
  $('plf-unidad').value = persona ? persona.unidad : unidad;
  $('plf-sector').value = persona ? persona.sector : 'Cajas';
  $('plf-modalidad').value = persona ? persona.modalidad : 'completa';
  $('plf-franco').value = persona ? persona.franco : '';
  $('plf-horario').value = persona ? persona.horario : '';
  $('plf-borrar').style.visibility = persona ? 'visible' : 'hidden';
  $('plf-error').textContent = '';
  leerFrancoEdicion();
  pintarGrillaEdicion();
  $('pl-dialogo').showModal();
}

$('plf-horario').addEventListener('input', () => {
  const h = parsearHorario($('plf-horario').value);
  if (h && !edicion.manual) edicion.bloques = bloquesDesdeTramos(h.tramos);
  pintarGrillaEdicion();
});
$('plf-franco').addEventListener('input', () => { leerFrancoEdicion(); pintarGrillaEdicion(); });
$('plf-grilla').addEventListener('click', (e) => {
  const b = e.target.closest('[data-plf-hora]');
  if (!b) return;
  const i = Number(b.dataset.plfHora);
  edicion.bloques = edicion.bloques.slice(0, i) + (edicion.bloques[i] === '1' ? '0' : '1') + edicion.bloques.slice(i + 1);
  edicion.manual = true;
  pintarGrillaEdicion();
});
$('plf-cancelar').addEventListener('click', () => $('pl-dialogo').close());
$('plf-borrar').addEventListener('click', async () => {
  if (!edicion.persona || !confirm('¿Eliminar esta fila de la grilla?')) return;
  await api(`/api/plantel/personas/${edicion.persona.id}`, { method: 'DELETE' });
  $('pl-dialogo').close();
  await cargarPlantel();
});
$('pl-form-persona').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    nombre: $('plf-nombre').value,
    puesto: $('plf-puesto').value,
    unidad: $('plf-unidad').value,
    sector: $('plf-sector').value,
    modalidad: $('plf-modalidad').value,
    franco: $('plf-franco').value,
    horario: $('plf-horario').value
  };
  // Si no se tocó ni el horario ni la grilla, no se mandan: así se conservan
  // los colores de la planilla original.
  body.bloques = edicion.bloques;
  if (edicion.persona && edicion.bloques === edicion.original && body.horario === edicion.persona.horario) {
    delete body.bloques;
    delete body.horario;
  }
  try {
    if (edicion.persona) await api(`/api/plantel/personas/${edicion.persona.id}`, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/plantel/personas', { method: 'POST', body: JSON.stringify(body) });
    $('pl-dialogo').close();
    await cargarPlantel();
  } catch (err) {
    $('plf-error').textContent = err.message;
  }
});

// ---------- eventos de las vistas ----------

$('tab-plantel').addEventListener('click', async (e) => {
  const t = e.target.closest('[data-pl-vista],[data-pl-unidad],[data-pl-dia],[data-pl-sector],[data-pl-cobdia],[data-pl-cobsector],[data-pl-editar],[data-pl-nueva],[data-pl-unificar],[data-pl-repintar],[data-pl-min-agregar],[data-pl-min-borrar],[data-pl-min-guardar]');
  if (!t || t.closest('#pl-dialogo')) return;
  const d = t.dataset;
  if (d.plVista) { st.vista = d.plVista; $('pl-buscar').value = ''; }
  else if (d.plUnidad) { st.unidad = d.plUnidad; st.vista = 'sucursal'; st.sector = 'Todos'; window.scrollTo({ top: 0 }); }
  else if (d.plDia !== undefined) st.dia = d.plDia;
  else if (d.plSector) st.sector = d.plSector;
  else if (d.plCobdia !== undefined) st.cobDia = d.plCobdia;
  else if (d.plCobsector) st.cobSector = d.plCobsector;
  else if (d.plEditar) {
    if (document.body.classList.contains('solo-lectura')) return;
    return abrirDialogo(P.personas.find((p) => p.id === Number(d.plEditar)));
  }
  else if (d.plNueva) return abrirDialogo(null, d.plNueva);
  else if (d.plUnificar) {
    await api(`/api/plantel/personas/${d.plUnificar}`, { method: 'PUT', body: JSON.stringify({ nombre: d.nombre }) });
    return cargarPlantel();
  } else if (d.plRepintar) {
    await api(`/api/plantel/personas/${d.plRepintar}`, { method: 'PUT', body: JSON.stringify({ bloques: d.bloques }) });
    return cargarPlantel();
  } else if (d.plMinAgregar !== undefined) {
    leerMinimosDelForm();
    minimosEdit.push({ unidad: '*', sector: 'Cajas', desde: 9, hasta: 21, minimo: 1 });
  } else if (d.plMinBorrar !== undefined) {
    leerMinimosDelForm();
    minimosEdit.splice(Number(d.plMinBorrar), 1);
  } else if (d.plMinGuardar !== undefined) {
    leerMinimosDelForm();
    try {
      await api('/api/plantel/minimos', { method: 'PUT', body: JSON.stringify(minimosEdit) });
      await cargarPlantel();
      $('pl-min-estado').textContent = 'Mínimos guardados. Los huecos se recalcularon.';
    } catch (err) {
      $('pl-min-estado').textContent = err.message;
    }
    return;
  }
  await render();
});

$('tab-plantel').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-pl-editar]')) e.target.click();
});

function leerMinimosDelForm() {
  document.querySelectorAll('[data-pl-min]').forEach((tr) => {
    const m = minimosEdit[Number(tr.dataset.plMin)];
    tr.querySelectorAll('[data-campo]').forEach((el) => {
      m[el.dataset.campo] = el.type === 'number' ? Number(el.value) : el.value;
    });
  });
}

$('tab-plantel').addEventListener('change', async (e) => {
  if (e.target.id === 'pl-sel-unidad') { st.unidad = e.target.value; await render(); }
  else if (e.target.id === 'pl-sel-mes') { st.prod = e.target.value; await render(); }
  else if (e.target.id === 'pl-dias-semana') {
    await api('/api/plantel/config', { method: 'PUT', body: JSON.stringify({ diasSemana: Number(e.target.value) }) });
    await cargarPlantel();
  }
});

$('tab-plantel').addEventListener('submit', async (e) => {
  if (e.target.id !== 'pl-form-importar') return;
  e.preventDefault();
  const input = $('pl-archivo');
  if (!input.files.length) return;
  const fd = new FormData();
  [...input.files].forEach((f) => fd.append('archivo', f));
  $('pl-import-estado').textContent = 'Importando…';
  try {
    const res = await fetch('/api/plantel/importar', { method: 'POST', body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'no se pudo importar');
    st.vista = 'resumen';
    await cargarPlantel();
  } catch (err) {
    $('pl-import-estado').textContent = err.message;
  }
});

$('pl-buscar').addEventListener('input', async (e) => {
  if (!P || P.vacio) return;
  st.busqueda = e.target.value;
  if (st.busqueda.trim()) st.vista = 'buscar';
  else if (st.vista === 'buscar') st.vista = 'resumen';
  await render();
});

cargarPlantel();
