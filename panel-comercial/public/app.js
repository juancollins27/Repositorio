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

  document.getElementById('pm-sucursal').innerHTML = sucursales
    .map((s) => `<option value="${s.id}">${s.nombre} (${s.formato || 's/formato'})</option>`)
    .join('');

  document.getElementById('reco-sucursal').innerHTML = opcionesSucursal;
  document.getElementById('oport-sucursal').innerHTML = '<option value="">Todas</option>' + opcionesSucursal;
}

// ---------- sucursales ----------

document.getElementById('form-sucursal').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/sucursales', {
      method: 'POST',
      body: JSON.stringify({
        nombre: document.getElementById('sucursal-nombre').value,
        ciudad: document.getElementById('sucursal-ciudad').value,
        formato: document.getElementById('sucursal-formato').value
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
        <td>${s.formato ? `<span class="formato-badge ${s.formato.toLowerCase()}">${s.formato}</span>` : ''}</td>
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
  renderInsightDashboard(datos);
  renderLineChart(datos.ventasPorDia);
  renderBarChart(datos.ventasPorSucursal);
  renderRankingVendedores(datos.rankingVendedores);
  renderRankingProductos(datos.rankingProductos);
  renderStockBajo(datos.productosStockBajo);
}

function renderInsightDashboard(d) {
  const cont = document.getElementById('dashboard-insight');
  if (!cont) return;
  if (!d.cantidadVentas) {
    cont.innerHTML = `<span class="marca">☞</span><span>Todavía no hay ventas cargadas para este período.</span>`;
    return;
  }

  let frase = `Las ventas del período sumaron <strong>${formatoCompacto(d.totalVentas)}</strong>`;
  if (d.cumplimiento !== null) {
    const diff = Math.abs(d.cumplimiento - 100).toFixed(0);
    frase += d.cumplimiento >= 100
      ? `, un <strong>${diff}% por encima</strong> del objetivo (${formatoCompacto(d.objetivoTotal)}).`
      : `, un <strong>${diff}% por debajo</strong> del objetivo (${formatoCompacto(d.objetivoTotal)}).`;
  } else {
    frase += ` sobre ${d.cantidadVentas} operaciones registradas.`;
  }

  if (d.rankingVendedores.length) {
    const top = d.rankingVendedores[0];
    frase += ` <strong>${top.nombre}</strong> lidera el ranking de vendedores con ${formatoCompacto(top.total)}.`;
  }
  if (d.productosStockBajo.length) {
    frase += ` Hay <strong>${d.productosStockBajo.length} producto${d.productosStockBajo.length === 1 ? '' : 's'}</strong> con stock por debajo del mínimo.`;
  }

  cont.innerHTML = `<span class="marca">☞</span><span>${frase}</span>`;
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

  const ancho = 520, alto = 260;
  const margen = { top: 24, right: 16, bottom: 70, left: 56 };
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
      const nombreCorto = d.nombre.length > 14 ? d.nombre.slice(0, 13) + '…' : d.nombre;
      return `
        <rect x="${barX}" y="${barY}" width="${anchoBarra}" height="${Math.max(barH, 0)}" rx="4" fill="var(--series-1)" />
        <text class="valor-texto" x="${cx}" y="${barY - 6}" text-anchor="middle">${formatoCompacto(d.total)}</text>
        <text class="eje-texto" x="${cx}" y="${h + 16}" text-anchor="end" transform="rotate(-40 ${cx} ${h + 16})">${nombreCorto}</text>
      `;
    })
    .join('');

  cont.innerHTML = `
    <svg viewBox="0 0 ${ancho} ${alto}" width="100%" style="overflow: visible" role="img" aria-label="Ventas por sucursal">
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

// ---------- productividad ----------

const ETIQUETAS_METRICA = {
  art_ticket: 'Artículos por ticket',
  tick_colab: 'Tickets por colaborador',
  art_colab: 'Artículos por colaborador',
  tick_hora: 'Tickets por hora',
  art_hora: 'Artículos por hora'
};

function formatoMetrica(valor, metrica) {
  if (valor === null || valor === undefined) return '—';
  const decimales = metrica === 'art_ticket' || metrica === 'tick_hora' || metrica === 'art_hora' ? 2 : 0;
  return valor.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

function formatoDelta(valor) {
  if (valor === null || valor === undefined) return '—';
  const signo = valor >= 0 ? '+' : '';
  return signo + valor.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

function leerControlesProductividad() {
  return {
    anio: Number(document.getElementById('prod-anio').value),
    mesDesde: Number(document.getElementById('prod-mes-desde').value),
    mesHasta: Number(document.getElementById('prod-mes-hasta').value),
    comparar: document.getElementById('prod-comparar').value
  };
}

async function cargarProductividad() {
  const { anio, mesDesde, mesHasta, comparar } = leerControlesProductividad();
  const resumen = await api(`/api/productividad/resumen?anio=${anio}&mesDesde=${mesDesde}&mesHasta=${mesHasta}`);

  renderKpisEmpresa(resumen.empresa);
  renderFormato('prod-formato-market', resumen.formatos.Market, 'Market');
  renderFormato('prod-formato-express', resumen.formatos.Express, 'Express');
  renderRankingProductividad(resumen.sucursales);
  renderTablaProductividad(resumen.sucursales, comparar);
  renderInsightProductividad(resumen.sucursales, comparar);

  const registros = await api('/api/productividad');
  renderCargasProductividad(registros);
}

function renderInsightProductividad(lista, comparar) {
  const cont = document.getElementById('prod-insight');
  if (!cont) return;
  const conDato = lista.filter((s) => s.tick_colab !== null);
  if (!conDato.length) {
    cont.innerHTML = `<span class="marca">☞</span><span>Todavía no hay meses cargados para este período.</span>`;
    return;
  }

  const ordenado = [...conDato].sort((a, b) => b.tick_colab - a.tick_colab);
  const mejor = ordenado[0];
  const peor = ordenado[ordenado.length - 1];
  const deltaMejor = mejor[comparar].tick_colab;
  const deltaPeor = peor[comparar].tick_colab;
  const contra = comparar === 'deltaFormato' ? 'el promedio de su formato' : 'el promedio de la empresa';

  let frase = `<strong>${mejor.nombre}</strong> lidera tickets por colaborador con ${formatoMetrica(mejor.tick_colab, 'tick_colab')}`;
  frase += deltaMejor !== null ? `, ${formatoDelta(deltaMejor)} sobre ${contra}.` : '.';
  frase += ` <strong>${peor.nombre}</strong> es la más rezagada`;
  frase += deltaPeor !== null ? `, ${formatoDelta(deltaPeor)}.` : '.';

  cont.innerHTML = `<span class="marca">☞</span><span>${frase}</span>`;
}

function renderKpisEmpresa(empresa) {
  document.getElementById('prod-kpis-empresa').innerHTML = Object.keys(ETIQUETAS_METRICA)
    .map(
      (m) => `
      <div class="stat-tile">
        <div class="label">${ETIQUETAS_METRICA[m]}</div>
        <div class="value">${formatoMetrica(empresa[m], m)}</div>
        <div class="delta">Promedio empresa</div>
      </div>`
    )
    .join('');
}

function renderFormato(contenedorId, datos, nombre) {
  const filas = Object.keys(ETIQUETAS_METRICA)
    .map((m) => `<dt>${ETIQUETAS_METRICA[m]}</dt><dd>${formatoMetrica(datos[m], m)}</dd>`)
    .join('');
  document.getElementById(contenedorId).innerHTML = `<dl>${filas}</dl>`;
}

function renderRankingProductividad(lista) {
  const cont = document.getElementById('prod-chart-ranking');
  const ordenado = [...lista].filter((s) => s.tick_colab !== null).sort((a, b) => b.tick_colab - a.tick_colab);
  if (!ordenado.length) {
    cont.innerHTML = '<p class="hint">Sin datos cargados para este período.</p>';
    return;
  }

  const ancho = 760, alto = 260;
  const margen = { top: 24, right: 16, bottom: 60, left: 60 };
  const w = ancho - margen.left - margen.right;
  const h = alto - margen.top - margen.bottom;

  const maxValor = Math.max(...ordenado.map((d) => d.tick_colab), 1);
  const niveles = ejeYNiveles(maxValor);
  const maxEje = niveles[niveles.length - 1];
  const y = (v) => h - (v / maxEje) * h;

  const bandas = w / ordenado.length;
  const anchoBarra = Math.min(24, bandas * 0.6);

  const gridlines = niveles
    .map(
      (n) => `
      <line class="gridline" x1="0" y1="${y(n)}" x2="${w}" y2="${y(n)}" />
      <text class="eje-texto" x="-8" y="${y(n) + 4}" text-anchor="end">${formatoMetrica(n, 'tick_colab')}</text>`
    )
    .join('');

  const barras = ordenado
    .map((d, i) => {
      const cx = bandas * i + bandas / 2;
      const barX = cx - anchoBarra / 2;
      const barY = y(d.tick_colab);
      const barH = h - barY;
      const color = d.formato === 'Express' ? 'var(--series-2)' : 'var(--series-1)';
      const nombreCorto = d.nombre.length > 14 ? d.nombre.slice(0, 13) + '…' : d.nombre;
      return `
        <rect x="${barX}" y="${barY}" width="${anchoBarra}" height="${Math.max(barH, 0)}" rx="4" fill="${color}" />
        <text class="valor-texto" x="${cx}" y="${barY - 6}" text-anchor="middle">${formatoMetrica(d.tick_colab, 'tick_colab')}</text>
        <text class="eje-texto" x="${cx}" y="${h + 16}" text-anchor="end" transform="rotate(-40 ${cx} ${h + 16})">${nombreCorto}</text>
      `;
    })
    .join('');

  cont.innerHTML = `
    <svg viewBox="0 0 ${ancho} ${alto}" width="100%" style="overflow: visible" role="img" aria-label="Tickets por colaborador por sucursal">
      <g transform="translate(${margen.left},${margen.top})">
        ${gridlines}
        <line class="baseline" x1="0" y1="${h}" x2="${w}" y2="${h}" />
        ${barras}
      </g>
    </svg>
    <div class="legend" style="display:flex; gap:1.2rem; margin-top:0.5rem; font-size:0.8rem; color:var(--text-secondary);">
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--series-1);border-radius:2px;margin-right:4px;"></span>Market</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:var(--series-2);border-radius:2px;margin-right:4px;"></span>Express</span>
    </div>
  `;
}

function renderTablaProductividad(lista, comparar) {
  const ordenado = [...lista].sort((a, b) => (a.ranking.art_ticket || 99) - (b.ranking.art_ticket || 99));
  document.getElementById('tabla-productividad').innerHTML = ordenado
    .map((s) => {
      const delta = s[comparar].art_ticket;
      const claseDelta = delta === null ? '' : delta >= 0 ? 'pos' : 'neg';
      return `<tr>
        <td>${s.nombre}</td>
        <td><span class="formato-badge ${s.formato.toLowerCase()}">${s.formato}</span></td>
        <td class="num">${formatoMetrica(s.art_ticket, 'art_ticket')}</td>
        <td class="num">${formatoMetrica(s.tick_colab, 'tick_colab')}</td>
        <td class="num">${formatoMetrica(s.art_colab, 'art_colab')}</td>
        <td class="num">${formatoMetrica(s.tick_hora, 'tick_hora')}</td>
        <td class="num">${formatoMetrica(s.art_hora, 'art_hora')}</td>
        <td class="num delta-cell ${claseDelta}">${formatoDelta(delta)}</td>
      </tr>`;
    })
    .join('');
}

function renderCargasProductividad(registros) {
  const ordenado = [...registros].sort((a, b) => nombreSucursal(a.sucursalId).localeCompare(nombreSucursal(b.sucursalId)) || a.mesNro - b.mesNro);
  document.getElementById('tabla-productividad-cargas').innerHTML = ordenado
    .map(
      (r) => `<tr>
        <td>${nombreSucursal(r.sucursalId)}</td>
        <td>${r.mes} ${r.anio}</td>
        <td class="num">${r.articulos.toLocaleString('es-AR')}</td>
        <td class="num">${r.tickets.toLocaleString('es-AR')}</td>
        <td class="num">${r.colaboradores}</td>
        <td class="num">${r.horas.toLocaleString('es-AR')}</td>
        <td><button class="link" data-borrar-productividad="${r.id}">Eliminar</button></td>
      </tr>`
    )
    .join('');

  document.querySelectorAll('[data-borrar-productividad]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este mes cargado?')) return;
      await api(`/api/productividad/${btn.dataset.borrarProductividad}`, { method: 'DELETE' });
      await cargarProductividad();
    });
  });
}

['prod-anio', 'prod-mes-desde', 'prod-mes-hasta', 'prod-comparar'].forEach((id) => {
  document.getElementById(id).addEventListener('change', cargarProductividad);
});

document.getElementById('form-productividad').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/productividad', {
      method: 'POST',
      body: JSON.stringify({
        sucursalId: document.getElementById('pm-sucursal').value,
        anio: document.getElementById('pm-anio').value,
        mesNro: document.getElementById('pm-mes-nro').value,
        mes: document.getElementById('pm-mes-nombre').value,
        articulos: document.getElementById('pm-articulos').value,
        tickets: document.getElementById('pm-tickets').value,
        colaboradores: document.getElementById('pm-colaboradores').value,
        horas: document.getElementById('pm-horas').value
      })
    });
    e.target.reset();
    await cargarProductividad();
  } catch (err) {
    alert(err.message);
  }
});

// ---------- quiebres de stock ----------

async function cargarHistorialQuiebres() {
  const historial = await api('/api/quiebres');
  const tbody = document.getElementById('tabla-quiebres-historial');
  tbody.innerHTML = historial.length
    ? historial
        .map(
          (a) => `<tr>
            <td>${new Date(a.fechaImportacion).toLocaleString('es-AR')}</td>
            <td>${a.nombreArchivo}</td>
            <td class="num">${a.totalSkusAnalizados}</td>
            <td class="num">${a.totalBrechas}</td>
            <td>
              <button class="link" data-ver-quiebres="${a.id}">Ver</button>
              <button class="link" data-borrar-quiebres="${a.id}">Eliminar</button>
            </td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="5" class="hint">Todavía no importaste ningún análisis.</td></tr>';

  tbody.querySelectorAll('[data-ver-quiebres]').forEach((btn) => {
    btn.addEventListener('click', () => mostrarAnalisisQuiebres(btn.dataset.verQuiebres));
  });
  tbody.querySelectorAll('[data-borrar-quiebres]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este análisis?')) return;
      await api(`/api/quiebres/${btn.dataset.borrarQuiebres}`, { method: 'DELETE' });
      await cargarHistorialQuiebres();
    });
  });

  if (historial.length) mostrarAnalisisQuiebres(historial[0].id);
}

async function mostrarAnalisisQuiebres(id) {
  const a = await api(`/api/quiebres/${id}`);
  document.getElementById('quiebres-resultado').classList.remove('hidden');

  document.getElementById('quiebres-stat-tiles').innerHTML = `
    <div class="stat-tile">
      <div class="label">SKU analizados</div>
      <div class="value">${a.totalSkusAnalizados.toLocaleString('es-AR')}</div>
    </div>
    <div class="stat-tile">
      <div class="label">Sucursales detectadas</div>
      <div class="value">${a.totalSucursalesDetectadas}</div>
    </div>
    <div class="stat-tile">
      <div class="label">Brechas core detectadas</div>
      <div class="value delta-critical">${a.totalBrechas}</div>
    </div>
    <div class="stat-tile">
      <div class="label">Fecha del análisis</div>
      <div class="value" style="font-size:1.1rem">${new Date(a.fechaImportacion).toLocaleDateString('es-AR')}</div>
    </div>
  `;

  renderBarraSimple('quiebres-chart-departamentos', a.rankingDepartamentos.slice(0, 10), 'departamento', 'cantidad');
  renderBarraSimple('quiebres-chart-sucursales', a.rankingSucursales, 'nombre', 'brechas');
  renderInsightQuiebres(a);

  document.getElementById('tabla-quiebres-detalle').innerHTML = a.brechas
    .slice(0, 100)
    .map(
      (b) => `<tr>
        <td>${b.sku}</td><td>${b.departamento}</td><td>${b.rubro}</td><td>${b.marca}</td>
        <td>${b.descripcion} ${b.tam || ''}</td>
        <td>${b.sucursalesSinVenta.join(', ')}</td>
      </tr>`
    )
    .join('');
}

function renderInsightQuiebres(a) {
  const cont = document.getElementById('quiebres-insight');
  if (!cont) return;
  if (!a.rankingDepartamentos.length) {
    cont.innerHTML = `<span class="marca">☞</span><span>No se detectaron brechas de surtido en este análisis.</span>`;
    return;
  }

  const topDepto = a.rankingDepartamentos[0];
  const pctDepto = ((topDepto.cantidad / a.totalBrechas) * 100).toFixed(0);
  const topSuc = a.rankingSucursales[0];

  const frase = `<strong>${topDepto.departamento}</strong> concentra el <strong>${pctDepto}%</strong> de las ${a.totalBrechas} brechas detectadas (${topDepto.cantidad} SKU). ` +
    `<strong>${topSuc.nombre}</strong> es la sucursal con más faltantes puntuales (${topSuc.brechas} de sus ${topSuc.skusVendidos.toLocaleString('es-AR')} SKU vendidos).`;

  cont.innerHTML = `<span class="marca">☞</span><span>${frase}</span>`;
}

function renderBarraSimple(contenedorId, datos, campoNombre, campoValor) {
  const cont = document.getElementById(contenedorId);
  if (!datos.length) {
    cont.innerHTML = '<p class="hint">Sin datos.</p>';
    return;
  }

  const ancho = 520, alto = 260;
  const margen = { top: 24, right: 16, bottom: 70, left: 46 };
  const w = ancho - margen.left - margen.right;
  const h = alto - margen.top - margen.bottom;

  const maxValor = Math.max(...datos.map((d) => d[campoValor]), 1);
  const niveles = ejeYNiveles(maxValor);
  const maxEje = niveles[niveles.length - 1];
  const y = (v) => h - (v / maxEje) * h;

  const bandas = w / datos.length;
  const anchoBarra = Math.min(24, bandas * 0.6);

  const gridlines = niveles
    .map(
      (n) => `
      <line class="gridline" x1="0" y1="${y(n)}" x2="${w}" y2="${y(n)}" />
      <text class="eje-texto" x="-8" y="${y(n) + 4}" text-anchor="end">${Math.round(n)}</text>`
    )
    .join('');

  const barras = datos
    .map((d, i) => {
      const cx = bandas * i + bandas / 2;
      const barX = cx - anchoBarra / 2;
      const barY = y(d[campoValor]);
      const barH = h - barY;
      const nombreCorto = d[campoNombre].length > 14 ? d[campoNombre].slice(0, 13) + '…' : d[campoNombre];
      return `
        <rect x="${barX}" y="${barY}" width="${anchoBarra}" height="${Math.max(barH, 0)}" rx="4" fill="var(--series-1)" />
        <text class="valor-texto" x="${cx}" y="${barY - 6}" text-anchor="middle">${d[campoValor]}</text>
        <text class="eje-texto" x="${cx}" y="${h + 16}" text-anchor="end" transform="rotate(-40 ${cx} ${h + 16})">${nombreCorto}</text>
      `;
    })
    .join('');

  cont.innerHTML = `
    <svg viewBox="0 0 ${ancho} ${alto}" width="100%" style="overflow: visible" role="img" aria-label="Ranking">
      <g transform="translate(${margen.left},${margen.top})">
        ${gridlines}
        <line class="baseline" x1="0" y1="${h}" x2="${w}" y2="${h}" />
        ${barras}
      </g>
    </svg>
  `;
}

document.getElementById('form-quiebres-importar').addEventListener('submit', async (e) => {
  e.preventDefault();
  const archivoInput = document.getElementById('quiebres-archivo');
  const estado = document.getElementById('quiebres-import-estado');
  if (!archivoInput.files.length) return;

  const formData = new FormData();
  formData.append('archivo', archivoInput.files[0]);

  estado.textContent = 'Analizando archivo…';
  try {
    const res = await fetch('/api/quiebres/importar', { method: 'POST', body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'error al analizar el archivo');
    }
    estado.textContent = '';
    archivoInput.value = '';
    await cargarHistorialQuiebres();
  } catch (err) {
    estado.textContent = err.message;
  }
});

// ---------- reconocimiento de producto ----------

document.getElementById('reco-periodo').value = mesActual();
document.getElementById('oport-periodo').value = mesActual();

let recoDetectado = null;
let recoActual = null; // { productoId, sucursalId, periodo }

const ETIQUETAS_DIAGNOSTICO_CORTO = {
  sub_espaciado: { texto: 'Sub-espaciado', clase: 'delta-warning' },
  sobre_espaciado: { texto: 'Sobre-espaciado', clase: 'delta-critical' },
  equilibrado: { texto: 'Equilibrado', clase: 'delta-good' },
  sin_datos_venta: { texto: 'Sin datos de venta', clase: '' }
};

async function cargarOportunidades() {
  const sucursalId = document.getElementById('oport-sucursal').value;
  const periodo = document.getElementById('oport-periodo').value || mesActual();

  const params = new URLSearchParams({ periodo });
  if (sucursalId) params.set('sucursalId', sucursalId);

  const datos = await api(`/api/reconocimiento/oportunidades?${params.toString()}`);

  document.getElementById('oport-stat-tiles').innerHTML = `
    <div class="stat-tile">
      <div class="label">Productos relevados</div>
      <div class="value">${datos.total}</div>
    </div>
    <div class="stat-tile">
      <div class="label">Sub-espaciados</div>
      <div class="value delta-warning">${datos.subEspaciados}</div>
      <div class="delta">venden más de lo que ocupan</div>
    </div>
    <div class="stat-tile">
      <div class="label">Sobre-espaciados</div>
      <div class="value delta-critical">${datos.sobreEspaciados}</div>
      <div class="delta">ocupan más de lo que venden</div>
    </div>
    <div class="stat-tile">
      <div class="label">Equilibrados</div>
      <div class="value delta-good">${datos.equilibrados}</div>
    </div>
  `;

  const tbody = document.getElementById('tabla-oportunidades');
  const sinDatos = document.getElementById('oport-sin-datos');
  if (!datos.oportunidades.length) {
    tbody.innerHTML = '';
    sinDatos.style.display = 'block';
    return;
  }
  sinDatos.style.display = 'none';

  tbody.innerHTML = datos.oportunidades
    .map((o) => {
      const diag = ETIQUETAS_DIAGNOSTICO_CORTO[o.diagnostico] || ETIQUETAS_DIAGNOSTICO_CORTO.sin_datos_venta;
      const sugerencia = o.delta === null ? '—' : o.delta === 0 ? 'sin cambios' : `${o.delta > 0 ? '+' : ''}${o.delta} frentes`;
      return `<tr>
        <td>${o.productoNombre}</td>
        <td>${o.sucursalNombre}</td>
        <td>${o.categoria || 's/categoría'}</td>
        <td class="num">${o.participacionEspacio.toFixed(1)}%</td>
        <td class="num">${o.participacionVentasCategoria === null ? '—' : o.participacionVentasCategoria.toFixed(1) + '%'}</td>
        <td><span class="${diag.clase}">${diag.texto}</span></td>
        <td>${sugerencia}</td>
      </tr>`;
    })
    .join('');
}

['oport-sucursal', 'oport-periodo'].forEach((id) => {
  document.getElementById(id).addEventListener('change', cargarOportunidades);
});

document.getElementById('form-reconocimiento').addEventListener('submit', async (e) => {
  e.preventDefault();
  const archivoInput = document.getElementById('reco-foto');
  const estado = document.getElementById('reco-estado');
  if (!archivoInput.files.length) return;

  document.getElementById('reco-ficha').classList.add('hidden');
  document.getElementById('reco-candidatos').innerHTML = '';
  document.getElementById('reco-detectado').textContent = '';

  const formData = new FormData();
  formData.append('foto', archivoInput.files[0]);

  estado.textContent = 'Analizando la foto…';
  try {
    const res = await fetch('/api/reconocimiento/identificar', { method: 'POST', body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'error al identificar la foto');
    }
    const { detectado, candidatos } = await res.json();
    estado.textContent = '';
    recoDetectado = detectado;
    renderDetectado(detectado);
    renderCandidatos(candidatos);
  } catch (err) {
    estado.textContent = err.message;
  }
});

function renderDetectado(d) {
  const cont = document.getElementById('reco-detectado');
  const partes = [d.nombre, d.marca, d.variante].filter(Boolean).join(' · ');
  cont.textContent = partes
    ? `La IA leyó: ${partes}${d.categoria ? ` (${d.categoria})` : ''}`
    : 'La IA no pudo leer con claridad el producto de la foto. Buscalo manualmente abajo.';
}

function renderCandidatos(lista) {
  const cont = document.getElementById('reco-candidatos');
  if (!lista.length) {
    cont.innerHTML = '<li class="hint">Sin coincidencias en el catálogo. Buscá manualmente abajo.</li>';
    return;
  }
  cont.innerHTML = lista
    .map(
      (p) => `<li>
        <span class="candidato-info">
          <span>${p.nombre}</span>
          <span class="candidato-score">${p.categoria || 's/categoría'} · coincidencia ${(p.score * 100).toFixed(0)}%</span>
        </span>
        <button type="button" data-elegir-producto="${p.id}">Elegir</button>
      </li>`
    )
    .join('');

  cont.querySelectorAll('[data-elegir-producto]').forEach((btn) => {
    btn.addEventListener('click', () => cargarFichaReconocimiento(Number(btn.dataset.elegirProducto)));
  });
}

document.getElementById('reco-buscar').addEventListener('input', (e) => {
  const termino = normalizarBusqueda(e.target.value);
  const cont = document.getElementById('reco-busqueda-resultados');
  if (!termino) {
    cont.innerHTML = '';
    return;
  }
  const resultados = productos.filter((p) => normalizarBusqueda(p.nombre).includes(termino)).slice(0, 8);
  cont.innerHTML = resultados
    .map(
      (p) => `<li>
        <span class="candidato-info">
          <span>${p.nombre}</span>
          <span class="candidato-score">${p.categoria || 's/categoría'}</span>
        </span>
        <button type="button" data-elegir-producto-manual="${p.id}">Elegir</button>
      </li>`
    )
    .join('');

  cont.querySelectorAll('[data-elegir-producto-manual]').forEach((btn) => {
    btn.addEventListener('click', () => cargarFichaReconocimiento(Number(btn.dataset.elegirProductoManual)));
  });
});

function normalizarBusqueda(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

async function cargarFichaReconocimiento(productoId) {
  const sucursalId = document.getElementById('reco-sucursal').value;
  const periodo = document.getElementById('reco-periodo').value || mesActual();
  if (!sucursalId) {
    alert('Elegí una sucursal para contrastar el producto.');
    return;
  }

  let ficha;
  try {
    ficha = await api(`/api/reconocimiento/ficha?productoId=${productoId}&sucursalId=${sucursalId}&periodo=${periodo}`);
  } catch (err) {
    alert(err.message);
    return;
  }

  recoActual = { productoId: Number(productoId), sucursalId: Number(sucursalId), periodo };

  document.getElementById('reco-ficha').classList.remove('hidden');
  document.getElementById('reco-ficha-sucursal').textContent = `${ficha.sucursal.nombre} · ${ficha.periodo}`;
  document.getElementById('reco-ficha-producto').textContent = ficha.producto.nombre;

  renderStatTilesReconocimiento(ficha);
  renderInsightReconocimiento(ficha);
  renderLineChart2(document.getElementById('reco-chart-tendencia'), ficha.tendencia, 'Ventas del producto');
  renderPreciosPorSucursal(ficha.precio.porSucursal, ficha.sucursal.id);

  const inputFrentesProducto = document.getElementById('espacio-frentes-producto');
  const inputFrentesSector = document.getElementById('espacio-frentes-sector');
  if (ficha.espacio.registrado) {
    inputFrentesProducto.value = ficha.espacio.frentesProducto;
    inputFrentesSector.value = ficha.espacio.frentesTotalesSector;
  } else {
    inputFrentesProducto.value = recoDetectado && recoDetectado.frentesVisibles ? recoDetectado.frentesVisibles : '';
    inputFrentesSector.value = '';
  }
  renderEspacioVenta(ficha.espacio);
}

document.getElementById('form-espacio').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!recoActual) return;

  try {
    await api('/api/reconocimiento/espacio', {
      method: 'POST',
      body: JSON.stringify({
        productoId: recoActual.productoId,
        sucursalId: recoActual.sucursalId,
        frentesProducto: document.getElementById('espacio-frentes-producto').value,
        frentesTotalesSector: document.getElementById('espacio-frentes-sector').value
      })
    });
    await cargarFichaReconocimiento(recoActual.productoId);
    await cargarOportunidades();
  } catch (err) {
    alert(err.message);
  }
});

const ETIQUETAS_DIAGNOSTICO = {
  sub_espaciado: { texto: 'Sub-espaciado', clase: 'delta-warning' },
  sobre_espaciado: { texto: 'Sobre-espaciado', clase: 'delta-critical' },
  equilibrado: { texto: 'Equilibrado', clase: 'delta-good' },
  sin_datos_venta: { texto: 'Sin ventas en la categoría', clase: '' }
};

function renderEspacioVenta(espacio) {
  const cont = document.getElementById('reco-espacio-resultado');
  if (!espacio.registrado) {
    cont.innerHTML = '<p class="hint">Todavía no cargaste un relevamiento de espacio para este producto en esta sucursal.</p>';
    return;
  }

  const diag = ETIQUETAS_DIAGNOSTICO[espacio.diagnostico] || ETIQUETAS_DIAGNOSTICO.sin_datos_venta;

  let recomendacion;
  if (espacio.diagnostico === 'sin_datos_venta') {
    recomendacion = 'No hay ventas registradas en la categoría de este producto en el período, así que no se puede comparar el espacio contra la venta.';
  } else if (espacio.diagnostico === 'equilibrado') {
    recomendacion = `El espacio (${espacio.participacionEspacio.toFixed(1)}%) está acorde a lo que vende dentro de su categoría (${espacio.participacionVentasCategoria.toFixed(1)}%). No hace falta mover frentes.`;
  } else if (espacio.diagnostico === 'sub_espaciado') {
    recomendacion = `Vende <strong>${espacio.participacionVentasCategoria.toFixed(1)}%</strong> de su categoría pero solo ocupa <strong>${espacio.participacionEspacio.toFixed(1)}%</strong> del espacio. Convendría subir de ${espacio.frentesProducto} a <strong>${espacio.frentesSugeridos} frentes</strong> (+${espacio.delta}).`;
  } else {
    recomendacion = `Ocupa <strong>${espacio.participacionEspacio.toFixed(1)}%</strong> del espacio pero vende solo <strong>${espacio.participacionVentasCategoria.toFixed(1)}%</strong> de su categoría. Convendría bajar de ${espacio.frentesProducto} a <strong>${espacio.frentesSugeridos} frentes</strong> (${espacio.delta}) y liberar lugar para otro producto.`;
  }

  cont.innerHTML = `
    <div class="stat-grid">
      <div class="stat-tile">
        <div class="label">Participación en el espacio</div>
        <div class="value">${espacio.participacionEspacio.toFixed(1)}%</div>
        <div class="delta">${espacio.frentesProducto} de ${espacio.frentesTotalesSector} frentes</div>
      </div>
      <div class="stat-tile">
        <div class="label">Participación en ventas de la categoría</div>
        <div class="value">${espacio.participacionVentasCategoria === null ? '—' : espacio.participacionVentasCategoria.toFixed(1) + '%'}</div>
      </div>
      <div class="stat-tile">
        <div class="label">Diagnóstico</div>
        <div class="value ${diag.clase}" style="font-size:1.1rem">${diag.texto}</div>
        <div class="delta">Relevado el ${espacio.fecha}</div>
      </div>
    </div>
    <div class="insight"><span class="marca">☞</span><span>${recomendacion}</span></div>
  `;
}

function renderStatTilesReconocimiento(f) {
  const p = f.participacion;
  const pr = f.precio;

  const claseParticipacion = p.porcentajeSucursal === null ? '' : p.porcentajeSucursal >= 5 ? 'delta-good' : '';
  const claseDiferenciaPrecio =
    pr.diferenciaPct === null ? '' : pr.diferenciaPct > 3 ? 'delta-warning' : pr.diferenciaPct < -3 ? 'delta-critical' : '';

  document.getElementById('reco-stat-tiles').innerHTML = `
    <div class="stat-tile">
      <div class="label">Participación en ventas de la sucursal</div>
      <div class="value ${claseParticipacion}">${p.porcentajeSucursal === null ? 'sin ventas' : p.porcentajeSucursal.toFixed(1) + '%'}</div>
      <div class="delta">${formatoCompacto(p.totalVentasProducto)} de ${formatoCompacto(p.totalVentasSucursal)}</div>
    </div>
    <div class="stat-tile">
      <div class="label">Ranking en la sucursal</div>
      <div class="value">${p.ranking ? `#${p.ranking}` : '—'}</div>
      <div class="delta">${p.ranking ? `de ${p.totalProductosConVenta} productos con venta` : 'sin ventas en el período'}</div>
    </div>
    <div class="stat-tile">
      <div class="label">Participación en su categoría</div>
      <div class="value">${p.porcentajeCategoria === null ? '—' : p.porcentajeCategoria.toFixed(1) + '%'}</div>
    </div>
    <div class="stat-tile">
      <div class="label">Precio promedio en esta sucursal</div>
      <div class="value">${pr.precioPromedioEnSucursal === null ? '—' : formatoMoneda(pr.precioPromedioEnSucursal)}</div>
      <div class="delta">Precio de lista: ${formatoMoneda(pr.precioLista)}</div>
    </div>
    <div class="stat-tile">
      <div class="label">Vs. precio promedio en otras sucursales</div>
      <div class="value ${claseDiferenciaPrecio}">${pr.diferenciaPct === null ? '—' : formatoDelta(pr.diferenciaPct)}</div>
      <div class="delta">${pr.precioPromedioOtrasSucursales === null ? 'sin datos de otras sucursales' : formatoMoneda(pr.precioPromedioOtrasSucursales)}</div>
    </div>
  `;
}

function renderInsightReconocimiento(f) {
  const cont = document.getElementById('reco-insight');
  const p = f.participacion;
  const pr = f.precio;

  if (!p.totalVentasProducto) {
    cont.innerHTML = `<span class="marca">☞</span><span><strong>${f.producto.nombre}</strong> no registra ventas en <strong>${f.sucursal.nombre}</strong> durante ${f.periodo}.</span>`;
    return;
  }

  let frase = `<strong>${f.producto.nombre}</strong> representa el <strong>${p.porcentajeSucursal.toFixed(1)}%</strong> de las ventas de <strong>${f.sucursal.nombre}</strong> en ${f.periodo}`;
  frase += p.ranking ? ` (puesto #${p.ranking} de ${p.totalProductosConVenta}).` : '.';

  if (pr.diferenciaPct !== null) {
    const abs = Math.abs(pr.diferenciaPct).toFixed(1);
    frase += pr.diferenciaPct >= 0
      ? ` Se vende <strong>${abs}% más caro</strong> acá que en el resto de las sucursales.`
      : ` Se vende <strong>${abs}% más barato</strong> acá que en el resto de las sucursales.`;
  }

  cont.innerHTML = `<span class="marca">☞</span><span>${frase}</span>`;
}

function renderLineChart2(cont, datos, etiqueta) {
  if (!datos.length) {
    cont.innerHTML = '<p class="hint">Sin ventas de este producto en esta sucursal durante el período.</p>';
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
    .map((n) => `
      <line class="gridline" x1="0" y1="${y(n)}" x2="${w}" y2="${y(n)}" />
      <text class="eje-texto" x="-8" y="${y(n) + 4}" text-anchor="end">${formatoCompacto(n)}</text>`)
    .join('');

  const paso = Math.max(1, Math.ceil(datos.length / 8));
  const etiquetasX = datos
    .map((d, i) => (i % paso === 0 || i === datos.length - 1 ? `<text class="eje-texto" x="${x(i)}" y="${h + 18}" text-anchor="middle">${d.fecha.slice(8)}</text>` : ''))
    .join('');

  const ultimo = datos[datos.length - 1];
  let trazado = '';
  if (datos.length > 1) {
    const puntos = datos.map((d, i) => `${x(i)},${y(d.total)}`).join(' ');
    const areaPuntos = `0,${h} ${puntos} ${w},${h}`;
    trazado = `
      <polygon points="${areaPuntos}" fill="var(--series-1-wash)" />
      <polyline points="${puntos}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
  }

  cont.innerHTML = `
    <svg viewBox="0 0 ${ancho} ${alto}" width="100%" role="img" aria-label="${etiqueta}">
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

function renderPreciosPorSucursal(lista, sucursalActualId) {
  const cont = document.getElementById('reco-chart-precios');
  if (!lista.length) {
    cont.innerHTML = '<p class="hint">Sin ventas de este producto en ninguna sucursal durante el período.</p>';
    return;
  }

  const ancho = 520, alto = 260;
  const margen = { top: 24, right: 16, bottom: 70, left: 56 };
  const w = ancho - margen.left - margen.right;
  const h = alto - margen.top - margen.bottom;

  const maxValor = Math.max(...lista.map((d) => d.precioPromedio), 1);
  const niveles = ejeYNiveles(maxValor);
  const maxEje = niveles[niveles.length - 1];
  const y = (v) => h - (v / maxEje) * h;

  const bandas = w / lista.length;
  const anchoBarra = Math.min(24, bandas * 0.6);

  const gridlines = niveles
    .map((n) => `
      <line class="gridline" x1="0" y1="${y(n)}" x2="${w}" y2="${y(n)}" />
      <text class="eje-texto" x="-8" y="${y(n) + 4}" text-anchor="end">${formatoCompacto(n)}</text>`)
    .join('');

  const barras = lista
    .map((d, i) => {
      const cx = bandas * i + bandas / 2;
      const barX = cx - anchoBarra / 2;
      const barY = y(d.precioPromedio);
      const barH = h - barY;
      const nombreCorto = d.nombre.length > 14 ? d.nombre.slice(0, 13) + '…' : d.nombre;
      const color = d.sucursalId === sucursalActualId ? 'var(--series-2)' : 'var(--series-1)';
      return `
        <rect x="${barX}" y="${barY}" width="${anchoBarra}" height="${Math.max(barH, 0)}" rx="4" fill="${color}" />
        <text class="valor-texto" x="${cx}" y="${barY - 6}" text-anchor="middle">${formatoMoneda(d.precioPromedio)}</text>
        <text class="eje-texto" x="${cx}" y="${h + 16}" text-anchor="end" transform="rotate(-40 ${cx} ${h + 16})">${nombreCorto}</text>
      `;
    })
    .join('');

  cont.innerHTML = `
    <svg viewBox="0 0 ${ancho} ${alto}" width="100%" style="overflow: visible" role="img" aria-label="Precio promedio por sucursal">
      <g transform="translate(${margen.left},${margen.top})">
        ${gridlines}
        <line class="baseline" x1="0" y1="${h}" x2="${w}" y2="${h}" />
        ${barras}
      </g>
    </svg>
  `;
}

// ---------- inicio ----------

async function iniciar() {
  document.getElementById('venta-fecha').valueAsDate = new Date();
  document.getElementById('objetivo-periodo').value = mesActual();
  await cargarMaestros();
  await cargarDashboard();
  await cargarProductividad();
  await cargarHistorialQuiebres();
  await cargarOportunidades();
}

iniciar();
