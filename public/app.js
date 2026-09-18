const DIAS_SEMANA = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

let alumnos = [];
let horarios = [];
let turnos = [];
let facturas = [];

// ---------- utilidades ----------

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error en ${url}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function nombreAlumno(id) {
  const a = alumnos.find((x) => x.id === id);
  return a ? `${a.nombre} ${a.apellido}` : '(alumno eliminado)';
}

function horasEntre(horaInicio, horaFin) {
  const [h1, m1] = horaInicio.split(':').map(Number);
  const [h2, m2] = horaFin.split(':').map(Number);
  return (h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
}

// ---------- tabs ----------

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ---------- alumnos ----------

const formAlumno = document.getElementById('form-alumno');
const alumnoCancelar = document.getElementById('alumno-cancelar');

async function cargarAlumnos() {
  alumnos = await api('/api/alumnos');
  renderAlumnos();
  renderSelectAlumnos();
}

function renderAlumnos() {
  const tbody = document.getElementById('tabla-alumnos');
  tbody.innerHTML = '';
  alumnos.forEach((a) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${a.nombre} ${a.apellido}</td>
      <td>${a.telefono || ''} ${a.email ? `· ${a.email}` : ''}</td>
      <td>$${a.tarifaHora}</td>
      <td>
        <button class="link" data-editar="${a.id}">Editar</button>
        <button class="link" data-borrar="${a.id}">Eliminar</button>
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => cargarAlumnoEnFormulario(Number(btn.dataset.editar)));
  });
  tbody.querySelectorAll('[data-borrar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este alumno?')) return;
      await api(`/api/alumnos/${btn.dataset.borrar}`, { method: 'DELETE' });
      await cargarAlumnos();
    });
  });
}

function renderSelectAlumnos() {
  const opciones = alumnos.map((a) => `<option value="${a.id}">${a.nombre} ${a.apellido}</option>`).join('');
  document.getElementById('turno-alumno').innerHTML = opciones;
  document.getElementById('factura-alumno').innerHTML = opciones;
}

function cargarAlumnoEnFormulario(id) {
  const a = alumnos.find((x) => x.id === id);
  if (!a) return;
  document.getElementById('alumno-id').value = a.id;
  document.getElementById('alumno-nombre').value = a.nombre;
  document.getElementById('alumno-apellido').value = a.apellido;
  document.getElementById('alumno-telefono').value = a.telefono;
  document.getElementById('alumno-email').value = a.email;
  document.getElementById('alumno-tarifa').value = a.tarifaHora;
  document.getElementById('alumno-notas').value = a.notas;
  document.getElementById('alumno-submit').textContent = 'Guardar cambios';
  alumnoCancelar.classList.remove('hidden');
}

function limpiarFormularioAlumno() {
  formAlumno.reset();
  document.getElementById('alumno-id').value = '';
  document.getElementById('alumno-submit').textContent = 'Agregar alumno';
  alumnoCancelar.classList.add('hidden');
}

alumnoCancelar.addEventListener('click', limpiarFormularioAlumno);

formAlumno.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('alumno-id').value;
  const datos = {
    nombre: document.getElementById('alumno-nombre').value,
    apellido: document.getElementById('alumno-apellido').value,
    telefono: document.getElementById('alumno-telefono').value,
    email: document.getElementById('alumno-email').value,
    tarifaHora: document.getElementById('alumno-tarifa').value,
    notas: document.getElementById('alumno-notas').value
  };

  try {
    if (id) {
      await api(`/api/alumnos/${id}`, { method: 'PUT', body: JSON.stringify(datos) });
    } else {
      await api('/api/alumnos', { method: 'POST', body: JSON.stringify(datos) });
    }
    limpiarFormularioAlumno();
    await cargarAlumnos();
  } catch (err) {
    alert(err.message);
  }
});

// ---------- horarios ----------

const formHorario = document.getElementById('form-horario');

async function cargarHorarios() {
  horarios = await api('/api/horarios');
  renderHorarios();
}

function renderHorarios() {
  const grilla = document.getElementById('grilla-horarios');
  grilla.innerHTML = '';
  DIAS_SEMANA.forEach((dia) => {
    const col = document.createElement('div');
    col.className = 'dia-col';
    const franjasDia = horarios
      .filter((h) => h.diaSemana === dia)
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

    col.innerHTML = `
      <h3>${dia}</h3>
      ${
        franjasDia.length
          ? franjasDia
              .map(
                (h) => `
        <div class="franja">
          <span>${h.horaInicio} - ${h.horaFin}</span>
          <button data-borrar-horario="${h.id}" title="Eliminar">×</button>
        </div>`
              )
              .join('')
          : '<p class="hint">Sin franjas</p>'
      }
    `;
    grilla.appendChild(col);
  });

  grilla.querySelectorAll('[data-borrar-horario]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/horarios/${btn.dataset.borrarHorario}`, { method: 'DELETE' });
      await cargarHorarios();
    });
  });
}

formHorario.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = {
    diaSemana: document.getElementById('horario-dia').value,
    horaInicio: document.getElementById('horario-inicio').value,
    horaFin: document.getElementById('horario-fin').value
  };
  try {
    await api('/api/horarios', { method: 'POST', body: JSON.stringify(datos) });
    formHorario.reset();
    await cargarHorarios();
  } catch (err) {
    alert(err.message);
  }
});

// ---------- turnos ----------

const formTurno = document.getElementById('form-turno');

async function cargarTurnos() {
  turnos = await api('/api/turnos');
  renderTurnos();
}

function renderTurnos() {
  const tbody = document.getElementById('tabla-turnos');
  tbody.innerHTML = '';
  turnos.forEach((t) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.fecha}</td>
      <td>${t.horaInicio} - ${t.horaFin}</td>
      <td>${nombreAlumno(t.alumnoId)}</td>
      <td>$${t.precio}</td>
      <td>
        <select data-estado="${t.id}">
          ${['pendiente', 'confirmado', 'completado', 'cancelado']
            .map((e) => `<option value="${e}" ${e === t.estado ? 'selected' : ''}>${e}</option>`)
            .join('')}
        </select>
      </td>
      <td><button class="link" data-borrar-turno="${t.id}">Eliminar</button></td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-estado]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await api(`/api/turnos/${sel.dataset.estado}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: sel.value })
      });
      await cargarTurnos();
    });
  });

  tbody.querySelectorAll('[data-borrar-turno]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este turno?')) return;
      await api(`/api/turnos/${btn.dataset.borrarTurno}`, { method: 'DELETE' });
      await cargarTurnos();
    });
  });
}

function sugerirPrecio() {
  const alumnoId = Number(document.getElementById('turno-alumno').value);
  const inicio = document.getElementById('turno-inicio').value;
  const fin = document.getElementById('turno-fin').value;
  const alumno = alumnos.find((a) => a.id === alumnoId);
  if (!alumno || !inicio || !fin || inicio >= fin) return;
  const horas = horasEntre(inicio, fin);
  document.getElementById('turno-precio').value = Math.round(alumno.tarifaHora * horas);
}

['turno-alumno', 'turno-inicio', 'turno-fin'].forEach((id) => {
  document.getElementById(id).addEventListener('change', sugerirPrecio);
});

formTurno.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = {
    alumnoId: document.getElementById('turno-alumno').value,
    fecha: document.getElementById('turno-fecha').value,
    horaInicio: document.getElementById('turno-inicio').value,
    horaFin: document.getElementById('turno-fin').value,
    precio: document.getElementById('turno-precio').value,
    notas: document.getElementById('turno-notas').value
  };
  try {
    await api('/api/turnos', { method: 'POST', body: JSON.stringify(datos) });
    formTurno.reset();
    await cargarTurnos();
  } catch (err) {
    alert(err.message);
  }
});

// ---------- facturación ----------

const formFactura = document.getElementById('form-factura');

async function cargarFacturas() {
  facturas = await api('/api/facturas');
  renderFacturas();
}

function renderFacturas() {
  const tbody = document.getElementById('tabla-facturas');
  tbody.innerHTML = '';
  facturas.forEach((f) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${nombreAlumno(f.alumnoId)}</td>
      <td>${f.periodo}</td>
      <td>$${f.total}</td>
      <td><span class="estado-badge estado-${f.estado}">${f.estado}</span></td>
      <td>${
        f.estado === 'pendiente'
          ? `<button class="link" data-pagar="${f.id}">Marcar pagada</button>`
          : `<span class="hint">Pagada el ${f.fechaPago}</span>`
      }</td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-pagar]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/facturas/${btn.dataset.pagar}/pagar`, { method: 'PATCH' });
      await cargarFacturas();
    });
  });
}

formFactura.addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = {
    alumnoId: document.getElementById('factura-alumno').value,
    periodo: document.getElementById('factura-periodo').value
  };
  try {
    await api('/api/facturas/generar', { method: 'POST', body: JSON.stringify(datos) });
    await cargarFacturas();
  } catch (err) {
    alert(err.message);
  }
});

// ---------- inicio ----------

async function iniciar() {
  await cargarAlumnos();
  await Promise.all([cargarHorarios(), cargarTurnos(), cargarFacturas()]);
}

iniciar();
