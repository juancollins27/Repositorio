import { Router } from 'express';
import multer from 'multer';
import { leerDB } from '../db.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const MODELO_VISION = process.env.RECONOCIMIENTO_MODELO || 'claude-haiku-4-5-20251001';

function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function tokenizar(texto) {
  return normalizarTexto(texto)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

// Compara lo que la IA leyó en la foto contra cada producto del catálogo y
// arma un puntaje de 0 a 1 por superposición de palabras (nombre + marca vs.
// nombre + categoría). Sin librerías externas: alcanza para un ranking de
// candidatos, no busca una coincidencia exacta.
function puntajeSimilitud(detectado, producto) {
  const tokensDetectado = new Set([...tokenizar(detectado.nombre), ...tokenizar(detectado.marca)]);
  const tokensProducto = new Set([...tokenizar(producto.nombre), ...tokenizar(producto.categoria)]);
  if (!tokensDetectado.size || !tokensProducto.size) return 0;

  let comunes = 0;
  tokensDetectado.forEach((t) => {
    if (tokensProducto.has(t)) comunes += 1;
  });
  const union = new Set([...tokensDetectado, ...tokensProducto]).size;
  return comunes / union;
}

async function identificarConIA(buffer, mimeType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error(
      'falta configurar la variable de entorno ANTHROPIC_API_KEY en el servidor para poder identificar productos por foto'
    );
    err.status = 503;
    throw err;
  }

  const prompt = `Sos un asistente que identifica productos de supermercado a partir de una foto de góndola o de un envase.
Devolvé ÚNICAMENTE un JSON, sin texto adicional ni bloques de código, con este formato exacto:
{"nombre": "", "marca": "", "categoria": "", "variante": "", "textoDetectado": ""}
- "nombre": nombre genérico del producto (ej: "Yerba mate", "Aceite de girasol").
- "marca": marca visible en el envase, si se distingue.
- "categoria": categoría o rubro (ej: "Almacén", "Bebidas", "Limpieza").
- "variante": tamaño/presentación si se ve (ej: "500g", "1L").
- "textoDetectado": todo el texto legible del envase, tal cual aparece.
Si no podés determinar un campo, dejalo como cadena vacía.`;

  const respuesta = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODELO_VISION,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') } },
            { type: 'text', text: prompt }
          ]
        }
      ]
    })
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    const err = new Error(`el servicio de reconocimiento de imágenes respondió con error (${respuesta.status})`);
    err.status = 502;
    err.detalle = detalle;
    throw err;
  }

  const datos = await respuesta.json();
  const texto = (datos.content || []).map((b) => b.text || '').join('').trim();
  const textoJson = texto.replace(/^```(json)?/i, '').replace(/```$/, '').trim();

  try {
    const parseado = JSON.parse(textoJson);
    return {
      nombre: parseado.nombre || '',
      marca: parseado.marca || '',
      categoria: parseado.categoria || '',
      variante: parseado.variante || '',
      textoDetectado: parseado.textoDetectado || ''
    };
  } catch {
    const err = new Error('no se pudo interpretar la respuesta del servicio de reconocimiento de imágenes');
    err.status = 502;
    throw err;
  }
}

router.post('/identificar', upload.single('foto'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no se recibió ninguna foto' });

  try {
    const detectado = await identificarConIA(req.file.buffer, req.file.mimetype);

    const db = leerDB();
    const candidatos = db.productos
      .map((p) => ({ ...p, score: puntajeSimilitud(detectado, p) }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    res.json({ detectado, candidatos });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

function periodoActual() {
  return new Date().toISOString().slice(0, 7);
}

router.get('/ficha', (req, res) => {
  const productoId = Number(req.query.productoId);
  const sucursalId = Number(req.query.sucursalId);
  const periodo = req.query.periodo || periodoActual();

  const db = leerDB();
  const producto = db.productos.find((p) => p.id === productoId);
  if (!producto) return res.status(404).json({ error: 'producto no encontrado' });
  const sucursal = db.sucursales.find((s) => s.id === sucursalId);
  if (!sucursal) return res.status(404).json({ error: 'sucursal no encontrada' });

  const ventasPeriodo = db.ventas.filter((v) => v.fecha.startsWith(periodo));
  const ventasSucursal = ventasPeriodo.filter((v) => v.sucursalId === sucursalId);
  const ventasProductoEnSucursal = ventasSucursal.filter((v) => v.productoId === productoId);

  const totalVentasSucursal = ventasSucursal.reduce((s, v) => s + v.total, 0);
  const totalVentasProducto = ventasProductoEnSucursal.reduce((s, v) => s + v.total, 0);
  const unidadesVendidas = ventasProductoEnSucursal.reduce((s, v) => s + v.cantidad, 0);

  const porProductoEnSucursal = {};
  ventasSucursal.forEach((v) => {
    porProductoEnSucursal[v.productoId] = (porProductoEnSucursal[v.productoId] || 0) + v.total;
  });
  const ordenRanking = Object.entries(porProductoEnSucursal).sort((a, b) => b[1] - a[1]);
  const posicion = ordenRanking.findIndex(([id]) => Number(id) === productoId);

  let participacionCategoria = null;
  if (producto.categoria) {
    const idsCategoria = new Set(db.productos.filter((p) => p.categoria === producto.categoria).map((p) => p.id));
    const totalCategoriaEnSucursal = ventasSucursal
      .filter((v) => idsCategoria.has(v.productoId))
      .reduce((s, v) => s + v.total, 0);
    participacionCategoria = totalCategoriaEnSucursal > 0 ? (totalVentasProducto / totalCategoriaEnSucursal) * 100 : null;
  }

  const participacion = {
    totalVentasProducto,
    totalVentasSucursal,
    unidadesVendidas,
    porcentajeSucursal: totalVentasSucursal > 0 ? (totalVentasProducto / totalVentasSucursal) * 100 : null,
    porcentajeCategoria: participacionCategoria,
    ranking: posicion >= 0 ? posicion + 1 : null,
    totalProductosConVenta: ordenRanking.length
  };

  const ventasProductoTodasSucursales = ventasPeriodo.filter((v) => v.productoId === productoId);
  const promedioPonderado = (lista) => {
    const unidades = lista.reduce((s, v) => s + v.cantidad, 0);
    if (!unidades) return null;
    return lista.reduce((s, v) => s + v.cantidad * v.precioUnitario, 0) / unidades;
  };

  const precioPromedioEnSucursal = promedioPonderado(ventasProductoEnSucursal);
  const ventasOtrasSucursales = ventasProductoTodasSucursales.filter((v) => v.sucursalId !== sucursalId);
  const precioPromedioOtrasSucursales = promedioPonderado(ventasOtrasSucursales);

  const precioPorSucursal = db.sucursales
    .map((s) => {
      const ventasDeEstaSucursal = ventasProductoTodasSucursales.filter((v) => v.sucursalId === s.id);
      return {
        sucursalId: s.id,
        nombre: s.nombre,
        precioPromedio: promedioPonderado(ventasDeEstaSucursal),
        unidades: ventasDeEstaSucursal.reduce((s2, v) => s2 + v.cantidad, 0)
      };
    })
    .filter((r) => r.precioPromedio !== null);

  const precio = {
    precioLista: producto.precio,
    precioPromedioEnSucursal,
    precioPromedioOtrasSucursales,
    diferenciaPct:
      precioPromedioEnSucursal !== null && precioPromedioOtrasSucursales
        ? (precioPromedioEnSucursal / precioPromedioOtrasSucursales - 1) * 100
        : null,
    porSucursal: precioPorSucursal
  };

  const porDia = {};
  ventasProductoEnSucursal.forEach((v) => {
    if (!porDia[v.fecha]) porDia[v.fecha] = { cantidad: 0, total: 0 };
    porDia[v.fecha].cantidad += v.cantidad;
    porDia[v.fecha].total += v.total;
  });
  const tendencia = Object.entries(porDia)
    .map(([fecha, datos]) => ({ fecha, ...datos }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  res.json({
    periodo,
    producto,
    sucursal,
    participacion,
    precio,
    tendencia
  });
});

export default router;
