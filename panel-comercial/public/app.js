let sucursales = [];
let vendedores = [];
let productos = [];
let ventas = [];
let objetivos = [];

// ---------- utilidades ----------

async function api(url, options = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error en ${url}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

function nombreSucursal(id) {
  const s = sucursales.find((x) => x.id === id);
  return s ? s.nombre : '(eliminada)';
}
function nombreVendedor(id) {
  const v = vendedores.find((x) => x.id === id);
  return v ? v.nombre : '(eliminado)';
}
function nombreProducto(id) {
  const p = productos.find((x) => x.id === id);
  return p ? p.nombre : '(eliminado)';
}

function formatoMoneda(n) {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

function formatoCompacto(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1_000) return '$' + (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return formatoMoneda(n);
}

function mesActual() {
  return new Date().toISOString().slice(0, 7);
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

// ---------- carga inicial ----------

async function cargarMaestros() {
  [sucursales, vendedores, productos, ventas, objetivos] = await Promise.all([
    api('/api/sucursales'),
    api('/api/vendedores'),
    api('/api/productos'),
    api('/api/ventas'),
    api('/api/objetivos')
  ]);
  renderSucursales();
  renderVendedores();
  renderProductos();
  renderVentas();
  renderObjetivos();
  llenarSelects();
}

function llenarSelects() {
  const opcionesSucursal = sucursales.map((s) => `<option value="${s.id}">${s.nombre}</option>`).join('');
  document.getElementById('vendedor-sucursal').innerHTML = opcionesSucursal;
  document.getElementById('venta-sucursal').innerHTML = opcionesSucursal;
  document.getElementById('objetivo-sucursal').innerHTML = opcionesSucursal;

  document.getElementById('venta-vendedor').innerHTML = vendedores
    .map((v) => `<option value="${v.id}">${v.nombre} (${nombreSucursal(v.sucursalId)})</option>`)
    .join('');

  document.getElementById('venta-producto').innerHTML = productos
    .map((p) => `<option value="${p.id}" data-precio="${p.precio}">${p.nombre}</option>`)
    .join('');

  const primeraOpcion = document.getElementById('venta-producto').selectedOptions[0];
  if (primeraOpcion) document.getElementById('venta-precio').value = primeraOpcion.dataset.precio;
}

// ---------- sucursales ----------

document.getElementById('form-sucursal').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/sucursales', {
      method: 'POST',
      body: JSON.stringify({
        nombre: document.getElementById('sucursal-nombre').value,
        ciudad: document.getElementById('sucursal-ciudad').value
      })
    });
    e.target.reset();
    await cargarMaestros();
  } catch (err) {
    alert(err.message);
  }
});

function renderSucursales() {
  const tbody = document.getElementById('tabla-sucursales');
  tbody.innerHTML = sucursales
    .map(
      (s) => `<tr>
        <td>${s.nombre}</td><td>${s.ciudad}</td>
        <td><button class="link" data-borrar-sucursal="${s.id}">Eliminar</button></td>
      </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-borrar-sucursal]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta sucursal?')) return;
      await api(`/api/sucursales/${btn.dataset.borrarSucursal}`, { method: 'DELETE' });
      await cargarMaestros();
    });
  });
}

// ---------- vendedores ----------

document.getElementById('form-vendedor').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/vendedores', {
      method: 'POST',
      body: JSON.stringify({
        nombre: document.getElementById('vendedor-nombre').value,
        sucursalId: document.getElementById('vendedor-sucursal').value
      })
    });
    e.target.reset();
    await cargarMaestros();
  } catch (err) {
    alert(err.message);
  }
});

function renderVendedores() {
  const tbody = document.getElementById('tabla-vendedores');
  tbody.innerHTML = vendedores
    .map(
      (v) => `<tr>
        <td>${v.nombre}</td><td>${nombreSucursal(v.sucursalId)}</td>
        <td><button class="link" data-borrar-vendedor="${v.id}">Eliminar</button></td>
      </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-borrar-vendedor]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este vendedor?')) return;
      await api(`/api/vendedores/${btn.dataset.borrarVendedor}`, { method: 'DELETE' });
      await cargarMaestros();
    });
  });
}

// ---------- productos ----------

document.getElementById('form-producto').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/productos', {
      method: 'POST',
      body: JSON.stringify({
        nombre: document.getElementById('producto-nombre').value,
        categoria: document.getElementById('producto-categoria').value,
        precio: document.getElementById('producto-precio').value,
        stock: document.getElementById('producto-stock').value,
        stockMinimo: document.getElementById('producto-stock-minimo').value
      })
    });
    e.target.reset();
    await cargarMaestros();
  } catch (err) {
    alert(err.message);
  }
});

function renderProductos() {
  const tbody = document.getElementById('tabla-productos');
  tbody.innerHTML = productos
    .map(
      (p) => `<tr class="${p.stock <= p.stockMinimo ? 'fila-alerta' : ''}">
        <td>${p.nombre}</td><td>${p.categoria}</td>
        <td class="num">${formatoMoneda(p.precio)}</td>
        <td class="num">${p.stock}</td>
        <td><button class="link" data-borrar-producto="${p.id}">Eliminar</button></td>
      </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-borrar-producto]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este producto?')) return;
      await api(`/api/productos/${btn.dataset.borrarProducto}`, { method: 'DELETE' });
      await cargarMaestros();
    });
  });
}

// ---------- ventas ----------

document.getElementById('venta-producto').addEventListener('change', (e) => {
  const opt = e.target.selectedOptions[0];
  if (opt) document.getElementById('venta-precio').value = opt.dataset.precio;
});

document.getElementById('form-venta').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/ventas', {
      method: 'POST',
      body: JSON.stringify({
        fecha: document.getElementById('venta-fecha').value,
        sucursalId: document.getElementById('venta-sucursal').value,
        vendedorId: document.getElementById('venta-vendedor').value,
        productoId: document.getElementById('venta-producto').value,
        cantidad: document.getElementById('venta-cantidad').value,
        precioUnitario: document.getElementById('venta-precio').value
      })
    });
    e.target.reset();
    document.getElementById('venta-cantidad').value = 1;
    await cargarMaestros();
    await cargarDashboard();
  } catch (err) {
    alert(err.message);
  }
});

function renderVentas() {
  const tbody = document.getElementById('tabla-ventas');
  const ultimas = ventas.slice(0, 30);
  tbody.innerHTML = ultimas
    .map(
      (v) => `<tr>
        <td>${v.fecha}</td><td>${nombreSucursal(v.sucursalId)}</td>
        <td>${nombreVendedor(v.vendedorId)}</td><td>${nombreProducto(v.productoId)}</td>
        <td class="num">${v.cantidad}</td><td class="num">${formatoMoneda(v.total)}</td>
        <td><button class="link" data-borrar-venta="${v.id}">Eliminar</button></td>
      </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-borrar-venta]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta venta? El stock del producto se repone.')) return;
      await api(`/api/ventas/${btn.dataset.borrarVenta}`, { method: 'DELETE' });
      await cargarMaestros();
      await cargarDashboard();
    });
  });
}

// ---------- objetivos ----------

document.getElementById('form-objetivo').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/objetivos', {
      method: 'POST',
      body: JSON.stringify({
        sucursalId: document.getElementById('objetivo-sucursal').value,
        periodo: document.getElementById('objetivo-periodo').value,
        montoObjetivo: document.getElementById('objetivo-monto').value
      })
    });
    e.target.reset();
    await cargarMaestros();
    await cargarDashboard();
  } catch (err) {
    alert(err.message);
  }
});

function renderObjetivos() {
  const tbody = document.getElementById('tabla-objetivos');
  tbody.innerHTML = objetivos
    .map(
      (o) => `<tr>
        <td>${nombreSucursal(o.sucursalId)}</td><td>${o.periodo}</td>
        <td class="num">${formatoMoneda(o.montoObjetivo)}</td>
        <td><button class="link" data-borrar-objetivo="${o.id}">Eliminar</button></td>
      </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-borrar-objetivo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/objetivos/${btn.dataset.borrarObjetivo}`, { method: 'DELETE' });
      await cargarMaestros();
      await cargarDashboard();
    });
  });
}

// ---------- dashboard ----------

const inputPeriodo = document.getElementById('dashboard-periodo');
inputPeriodo.value = mesActual();
inputPeriodo.addEventListener('change', cargarDashboard);

async function cargarDashboard() {
  const datos = await api(`/api/dashboard?periodo=${inputPeriodo.value}`);
  renderStatTiles(datos);
  renderLineChart(datos.ventasPorDia);
  renderBarChart(datos.ventasPorSucursal);
  renderRankingVendedores(datos.rankingVendedores);
  renderRankingProductos(datos.rankingProductos);
  renderStockBajo(datos.productosStockBajo);
}

function renderStatTiles(d) {
  const cumplimientoTexto = d.cumplimiento === null ? 'sin objetivo' : `${d.cumplimiento.toFixed(0)}%`;
  let cumplimientoClase = '';
  if (d.cumplimiento !== null) {
    cumplimientoClase = d.cumplimiento >= 100 ? 'delta-good' : d.cumplimiento >= 70 ? 'delta-warning' : 'delta-critical';
  }

  document.getElementById('stat-tiles').innerHTML = `
    <div class="stat-tile">
      <div class="label">Ventas del período</div>
      <div class="value">${formatoCompacto(d.totalVentas)}</div>
    </div>
    <div class="stat-tile">
      <div class="label">Cumplimiento objetivo</div>
      <div class="value ${cumplimientoClase}">${cumplimientoTexto}</div>
      ${d.objetivoTotal ? `<div class="delta">Meta: ${formatoCompacto(d.objetivoTotal)}</div>` : ''}
    </div>
    <div class="stat-tile">
      <div class="label">Ticket promedio</div>
      <div class="value">${formatoCompacto(d.ticketPromedio)}</div>
    </div>
    <div class="stat-tile">
      <div class="label">Ventas registradas</div>
      <div class="value">${d.cantidadVentas}</div>
    </div>
    <div class="stat-tile">
      <div class="label">Stock bajo</div>
      <div class="value ${d.productosStockBajo.length ? 'delta-critical' : ''}">${d.productosStockBajo.length}</div>
    </div>
  `;
}

function ejeYNiveles(maxValor) {
  if (maxValor <= 0) return [0, 1];
  const pasos = 4;
  const bruto = maxValor / pasos;
  const magnitud = Math.pow(10, Math.floor(Math.log10(bruto)));
  const normalizado = bruto / magnitud;
  let paso;
  if (normalizado <= 1) paso = magnitud;
  else if (normalizado <= 2) paso = 2 * magnitud;
  else if (normalizado <= 5) paso = 5 * magnitud;
  else paso = 10 * magnitud;

  const niveles = [];
  for (let v = 0; v <= maxValor + paso; v += paso) niveles.push(v);
  return niveles;
}

function renderLineChart(datos) {
  const cont = document.getElementById('chart-linea');
  if (!datos.length) {
    cont.innerHTML = '<p class="hint">Sin ventas registradas en este período.</p>';
    return;
  }

  const ancho = 520, alto = 220;
  const margen = { top: 16, right: 16, bottom: 26, left: 56 };
  const w = ancho - margen.left - margen.right;
  const h = alto - margen.top - margen.bottom;

  const maxValor = Math.max(...datos.map((d) => d.total));
  const niveles = ejeYNiveles(maxValor);
  const maxEje = niveles[niveles.length - 1];

  const x = (i) => (datos.length > 1 ? (i / (datos.length - 1)) * w : w / 2);
  const y = (v) => h - (v / maxEje) * h;

  const gridlines = niveles
    .map(
      (n) => `
      <line class="gridline" x1="0" y1="${y(n)}" x2="${w}" y2="${y(n)}" />
      <text class="eje-texto" x="-8" y="${y(n) + 4}" text-anchor="end">${formatoCompacto(n)}</text>`
    )
    .join('');

  const paso = Math.max(1, Math.ceil(datos.length / 8));
  const etiquetasX = datos
    .map((d, i) => (i % paso === 0 || i === datos.length - 1 ? `<text class="eje-texto" x="${x(i)}" y="${h + 18}" text-anchor="middle">${d.fecha.slice(8)}</text>` : ''))
    .join('');

  const ultimo = datos[datos.length - 1];

  let trazado;
  if (datos.length > 1) {
    const puntos = datos.map((d, i) => `${x(i)},${y(d.total)}`).join(' ');
    const areaPuntos = `0,${h} ${puntos} ${w},${h}`;
    trazado = `
      <polygon points="${areaPuntos}" fill="var(--series-1-wash)" />
      <polyline points="${puntos}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
  } else {
    trazado = '';
  }

  cont.innerHTML = `
    <svg viewBox="0 0 ${ancho} ${alto}" width="100%" role="img" aria-label="Ventas por día">
      <g transform="translate(${margen.left},${margen.top})">
        ${gridlines}
        <line class="baseline" x1="0" y1="${h}" x2="${w}" y2="${h}" />
        ${trazado}
        <circle cx="${x(datos.length - 1)}" cy="${y(ultimo.total)}" r="4" fill="var(--series-1)" stroke="var(--surface)" stroke-width="2" />
        <text class="valor-texto" x="${x(datos.length - 1)}" y="${y(ultimo.total) - 10}" text-anchor="${datos.length > 1 ? 'end' : 'middle'}">${formatoCompacto(ultimo.total)}</text>
        ${etiquetasX}
      </g>
    </svg>
  `;
}

function renderBarChart(datos) {
  const cont = document.getElementById('chart-barras');
  if (!datos.length) {
    cont.innerHTML = '<p class="hint">Cargá sucursales para ver este gráfico.</p>';
    return;
  }

  const ancho = 520, alto = 220;
  const margen = { top: 24, right: 16, bottom: 30, left: 56 };
  const w = ancho - margen.left - margen.right;
  const h = alto - margen.top - margen.bottom;

  const maxValor = Math.max(...datos.map((d) => d.total), 1);
  const niveles = ejeYNiveles(maxValor);
  const maxEje = niveles[niveles.length - 1];
  const y = (v) => h - (v / maxEje) * h;

  const bandas = w / datos.length;
  const anchoBarra = Math.min(24, bandas * 0.6);

  const gridlines = niveles
    .map(
      (n) => `
      <line class="gridline" x1="0" y1="${y(n)}" x2="${w}" y2="${y(n)}" />
      <text class="eje-texto" x="-8" y="${y(n) + 4}" text-anchor="end">${formatoCompacto(n)}</text>`
    )
    .join('');

  const barras = datos
    .map((d, i) => {
      const cx = bandas * i + bandas / 2;
      const barX = cx - anchoBarra / 2;
      const barY = y(d.total);
      const barH = h - barY;
      const nombreCorto = d.nombre.length > 18 ? d.nombre.slice(0, 17) + '…' : d.nombre;
      return `
        <rect x="${barX}" y="${barY}" width="${anchoBarra}" height="${Math.max(barH, 0)}" rx="4" fill="var(--series-1)" />
        <text class="valor-texto" x="${cx}" y="${barY - 6}" text-anchor="middle">${formatoCompacto(d.total)}</text>
        <text class="eje-texto" x="${cx}" y="${h + 18}" text-anchor="middle">${nombreCorto}</text>
      `;
    })
    .join('');

  cont.innerHTML = `
    <svg viewBox="0 0 ${ancho} ${alto}" width="100%" role="img" aria-label="Ventas por sucursal">
      <g transform="translate(${margen.left},${margen.top})">
        ${gridlines}
        <line class="baseline" x1="0" y1="${h}" x2="${w}" y2="${h}" />
        ${barras}
      </g>
    </svg>
  `;
}

function renderRankingVendedores(lista) {
  const tbody = document.getElementById('tabla-ranking-vendedores');
  tbody.innerHTML = lista.length
    ? lista.map((v) => `<tr><td>${v.nombre}</td><td class="num">${formatoMoneda(v.total)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="hint">Sin ventas en este período.</td></tr>';
}

function renderRankingProductos(lista) {
  const tbody = document.getElementById('tabla-ranking-productos');
  tbody.innerHTML = lista.length
    ? lista
        .map((p) => `<tr><td>${p.nombre}</td><td class="num">${p.cantidad}</td><td class="num">${formatoMoneda(p.total)}</td></tr>`)
        .join('')
    : '<tr><td colspan="3" class="hint">Sin ventas en este período.</td></tr>';
}

function renderStockBajo(lista) {
  const tbody = document.getElementById('tabla-stock-bajo');
  const hint = document.getElementById('sin-stock-bajo');
  tbody.innerHTML = lista
    .map((p) => `<tr><td>${p.nombre}</td><td class="num">${p.stock}</td><td class="num">${p.stockMinimo}</td></tr>`)
    .join('');
  hint.style.display = lista.length ? 'none' : 'block';
}

// ---------- inicio ----------

async function iniciar() {
  document.getElementById('venta-fecha').valueAsDate = new Date();
  document.getElementById('objetivo-periodo').value = mesActual();
  await cargarMaestros();
  await cargarDashboard();
}

iniciar();
