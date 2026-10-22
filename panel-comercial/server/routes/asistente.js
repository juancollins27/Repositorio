// Consultor: un agente con IA (Claude) que analiza los datos del panel.
//
// Cómo funciona (el "bucle del agente"):
//   1. La pregunta del usuario se manda a Claude junto con una lista de
//      herramientas: cada una es una consulta de sólo lectura a la API del
//      propio panel (productividad, quiebres, plantel, ventas…).
//   2. Claude decide qué herramientas necesita y las pide (`tool_use`).
//   3. El servidor las ejecuta llamando a esos mismos endpoints y le devuelve
//      los datos (`tool_result`).
//   4. Se repite hasta que Claude tiene lo que necesita y responde.
//
// Las herramientas sólo leen: el consultor no puede modificar nada. Tampoco
// ve el listado de personas del plantel (nombres, partes médicos), sólo
// totales por sucursal.
//
// Necesita la variable de entorno ANTHROPIC_API_KEY.

import { Router } from 'express';
import crypto from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { leerDB } from '../db.js';

const router = Router();

const MODELO = 'claude-opus-5-5';
const MAX_VUELTAS = 15;
const MAX_CARACTERES_RESULTADO = 60000;
const BASE_INTERNA = `http://127.0.0.1:${process.env.PORT || 3000}`;

let cliente = null;
function obtenerCliente() {
  if (!cliente) cliente = new Anthropic();
  return cliente;
}

export function asistenteConfigurado() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// ---------- herramientas ----------

function consulta(path, params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  });
  const texto = qs.toString();
  return texto ? `${path}?${texto}` : path;
}

const objeto = (properties = {}, required = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false
});

const HERRAMIENTAS = [
  {
    name: 'ver_sucursales',
    description: 'Lista de sucursales con id, nombre, ciudad y formato (Market o Express). Sirve para traducir ids a nombres.',
    input_schema: objeto(),
    ruta: () => '/api/sucursales'
  },
  {
    name: 'ver_productividad_resumen',
    description:
      'Productividad agregada de un período: por sucursal y para la empresa y cada formato. Métricas: art_ticket (artículos por ticket), ' +
      'tick_colab y art_colab (por colaborador), tick_hora y art_hora (por hora-hombre). Incluye la brecha % de cada sucursal contra el ' +
      'promedio de la empresa (deltaEmpresa) y de su formato (deltaFormato), y su puesto en el ranking de cada métrica.',
    input_schema: objeto({
      anio: { type: 'integer', description: 'Año, por ejemplo 2026' },
      mesDesde: { type: 'integer', description: 'Mes inicial, 1 a 12 (por defecto 1)' },
      mesHasta: { type: 'integer', description: 'Mes final, 1 a 12 (por defecto 12)' }
    }),
    ruta: (e) => consulta('/api/productividad/resumen', e)
  },
  {
    name: 'ver_productividad_mensual',
    description:
      'Registros mensuales crudos de productividad por sucursal (artículos, tickets, colaboradores, horas). Usalo para ver evolución mes a mes, ' +
      'estacionalidad o variaciones contra el mes anterior.',
    input_schema: objeto({
      anio: { type: 'integer', description: 'Filtrar por año (opcional)' },
      sucursalId: { type: 'integer', description: 'Filtrar por sucursal (opcional)' }
    }),
    ruta: () => '/api/productividad',
    filtrar: (datos, e) =>
      datos.filter((r) => (!e.anio || r.anio === e.anio) && (!e.sucursalId || r.sucursalId === e.sucursalId))
  },
  {
    name: 'ver_quiebres_lista',
    description: 'Análisis de quiebres de stock importados: id, fecha, archivo, SKU analizados y total de brechas. Llamalo antes de ver el detalle.',
    input_schema: objeto(),
    ruta: () => '/api/quiebres'
  },
  {
    name: 'ver_quiebres_detalle',
    description:
      'Detalle de un análisis de quiebres: ranking de brechas por departamento y por sucursal, y una muestra de las brechas (SKU core con 0 ' +
      'unidades en 1 o 2 sucursales). Se puede filtrar la muestra por departamento o sucursal.',
    input_schema: objeto(
      {
        id: { type: 'integer', description: 'Id del análisis (de ver_quiebres_lista)' },
        departamento: { type: 'string', description: 'Filtrar brechas por departamento (opcional)' },
        sucursal: { type: 'string', description: 'Filtrar brechas por nombre de sucursal sin venta (opcional)' },
        limite: { type: 'integer', description: 'Cantidad máxima de brechas a devolver (por defecto 60)' }
      },
      ['id']
    ),
    ruta: (e) => `/api/quiebres/${Number(e.id)}`,
    filtrar: (a, e) => {
      const norm = (t) => String(t || '').toLowerCase();
      let brechas = a.brechas || [];
      if (e.departamento) brechas = brechas.filter((b) => norm(b.departamento) === norm(e.departamento));
      if (e.sucursal) brechas = brechas.filter((b) => b.sucursalesSinVenta.some((s) => norm(s) === norm(e.sucursal)));
      const { brechas: _todas, ...resto } = a;
      return { ...resto, brechasFiltradas: brechas.length, muestraBrechas: brechas.slice(0, e.limite || 60) };
    }
  },
  {
    name: 'ver_plantel_resumen',
    description:
      'Plantel por sucursal (sin nombres): personas activas, cajeros vs. cajas declaradas, part time, partes médicos, vacantes, ausencias, ' +
      '% de horarios cortados, horas semanales, pico de cobertura, personas por sector y cantidad de huecos contra los mínimos.',
    input_schema: objeto(),
    ruta: () => '/api/plantel/resumen'
  },
  {
    name: 'ver_huecos_cobertura',
    description: 'Horas en que cada sucursal queda por debajo de los mínimos de cobertura configurados (por día, hora y sector).',
    input_schema: objeto(),
    ruta: () => '/api/plantel/huecos'
  },
  {
    name: 'ver_cobertura_horaria',
    description: 'Cantidad de personas trabajando por hora (7 a 21) en cada sucursal, para un día y sector.',
    input_schema: objeto({
      dia: { type: 'integer', description: '0=lunes … 5=sábado, con francos descontados. Omitir para la semana tipo.' },
      sector: { type: 'string', description: 'Sector, por ejemplo "Cajas". Omitir para todos.' }
    }),
    ruta: (e) => consulta('/api/plantel/cobertura', e)
  },
  {
    name: 'ver_plantel_vs_productividad',
    description:
      'Cruza las horas programadas en la grilla de horarios con las horas-hombre y colaboradores reales de Productividad de un mes, por sucursal, ' +
      'y calcula tickets por hora programada vs. real. Sin año y mes usa el último mes cargado.',
    input_schema: objeto({
      anio: { type: 'integer' },
      mes: { type: 'integer', description: '1 a 12' }
    }),
    ruta: (e) => consulta('/api/plantel/productividad', e)
  },
  {
    name: 'ver_dashboard_ventas',
    description:
      'KPIs de ventas de un mes: total, cantidad, ticket promedio, % de cumplimiento de objetivo, ventas por día y por sucursal, ranking de ' +
      'vendedores y productos, y productos con stock bajo. Puede estar vacío si no se cargan ventas en el panel.',
    input_schema: objeto({ periodo: { type: 'string', description: 'Mes en formato YYYY-MM' } }),
    ruta: (e) => consulta('/api/dashboard', e)
  }
];

const TOOLS = HERRAMIENTAS.map(({ name, description, input_schema }) => ({ name, description, input_schema, strict: true }));

async function ejecutarHerramienta(nombre, entrada, authorization) {
  const h = HERRAMIENTAS.find((x) => x.name === nombre);
  if (!h) throw new Error(`herramienta desconocida: ${nombre}`);
  const resp = await fetch(BASE_INTERNA + h.ruta(entrada), {
    headers: authorization ? { authorization } : {}
  });
  const cuerpo = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error((cuerpo && cuerpo.error) || `la API respondió ${resp.status}`);
  const datos = h.filtrar ? h.filtrar(cuerpo, entrada) : cuerpo;
  let texto = JSON.stringify(datos);
  if (texto.length > MAX_CARACTERES_RESULTADO) {
    texto = texto.slice(0, MAX_CARACTERES_RESULTADO) + ' …[resultado recortado: pedí un filtro más específico]';
  }
  return texto;
}

// ---------- instrucciones del consultor ----------

function instrucciones() {
  const db = leerDB();
  const sucursales = db.sucursales.map((s) => `${s.id}: ${s.nombre} (${s.formato})`).join('; ');
  const hoy = new Date().toISOString().slice(0, 10);
  return `Sos un consultor senior de gestión comercial y operaciones de retail que trabaja con la Gerencia Comercial de Kilbel, una cadena de supermercados de Santa Fe (Argentina).

Tenés herramientas de sólo lectura sobre los datos del panel comercial: productividad mensual por sucursal, análisis de quiebres de stock, plantel y grilla de horarios, y ventas/objetivos. Sucursales: ${sucursales}. Fecha de hoy: ${hoy}.

Cómo trabajás:
- Antes de opinar, consultá los datos que hagan falta. Nunca inventes cifras: si un dato no está cargado, decilo y explicá qué habría que cargar.
- Compará siempre contra una referencia (promedio de la empresa, del formato Market/Express, mes anterior) y cuantificá las brechas.
- Estructurá la respuesta como consultoría: primero la conclusión principal en una o dos líneas, después el diagnóstico con los números que la sostienen, y al final recomendaciones concretas, priorizadas por impacto y facilidad, con quién debería ejecutarlas.
- Distinguí lo que muestran los datos de lo que es hipótesis o causa probable.
- Escribí en español rioplatense, profesional y directo. Usá tablas en Markdown cuando compares sucursales o métricas. Sé conciso: nada de relleno.`;
}

// ---------- conversaciones ----------

// Se guardan en memoria del servidor (se pierden al reiniciar). Se envía el
// historial completo, tal cual lo devolvió la API, en cada vuelta.
const conversaciones = new Map();
const VIDA_CONVERSACION_MS = 2 * 60 * 60 * 1000;

function limpiarViejas() {
  const limite = Date.now() - VIDA_CONVERSACION_MS;
  for (const [id, c] of conversaciones) if (c.actualizada < limite) conversaciones.delete(id);
}

function textoDe(contenido) {
  return contenido.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n').trim();
}

router.get('/estado', (req, res) => {
  res.json({ configurado: asistenteConfigurado(), modelo: MODELO });
});

router.post('/', async (req, res) => {
  if (!asistenteConfigurado()) {
    return res.status(503).json({ error: 'Falta configurar ANTHROPIC_API_KEY en el servidor para usar el consultor.' });
  }
  const pregunta = String((req.body && req.body.mensaje) || '').trim();
  if (!pregunta) return res.status(400).json({ error: 'escribí una consulta' });

  limpiarViejas();
  let id = req.body.conversacionId;
  if (!id || !conversaciones.has(id)) {
    id = crypto.randomUUID();
    conversaciones.set(id, { mensajes: [], actualizada: Date.now() });
  }
  const conv = conversaciones.get(id);
  if (conv.ocupada) return res.status(409).json({ error: 'el consultor todavía está respondiendo la consulta anterior' });
  conv.ocupada = true;

  // Se trabaja sobre una copia: si algo falla a mitad de camino, la
  // conversación guardada queda como estaba.
  const mensajes = [...conv.mensajes, { role: 'user', content: pregunta }];
  const consultadas = [];

  try {
    const client = obtenerCliente();
    const system = instrucciones();
    let respuesta = null;

    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      respuesta = await client.beta.messages.create({
        model: MODELO,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'high' },
        cache_control: { type: 'ephemeral' },
        system,
        tools: TOOLS,
        messages: mensajes
      });
      mensajes.push({ role: 'assistant', content: respuesta.content });

      if (respuesta.stop_reason === 'refusal') {
        return res.status(422).json({ error: 'El modelo no pudo responder esta consulta. Probá reformularla.' });
      }
      if (respuesta.stop_reason === 'pause_turn') continue;
      if (respuesta.stop_reason !== 'tool_use') break;

      const pedidos = respuesta.content.filter((b) => b.type === 'tool_use');
      const resultados = await Promise.all(
        pedidos.map(async (b) => {
          consultadas.push(b.name);
          try {
            const contenido = await ejecutarHerramienta(b.name, b.input || {}, req.headers.authorization);
            return { type: 'tool_result', tool_use_id: b.id, content: contenido };
          } catch (err) {
            return { type: 'tool_result', tool_use_id: b.id, content: `Error: ${err.message}`, is_error: true };
          }
        })
      );
      mensajes.push({ role: 'user', content: resultados });
    }

    let texto = textoDe(respuesta.content);
    if (respuesta.stop_reason === 'tool_use') texto ||= 'La consulta requirió demasiados pasos. Probá acotarla (una sucursal, un período).';
    if (respuesta.stop_reason === 'max_tokens') texto += '\n\n_(Respuesta cortada por longitud: pedí una versión más breve o por partes.)_';
    if (respuesta.stop_reason === 'tool_use') mensajes.push({ role: 'user', content: 'Seguimos en la próxima consulta.' });

    conv.mensajes = mensajes;
    conv.actualizada = Date.now();
    res.json({ conversacionId: id, respuesta: texto, herramientas: consultadas });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      res.status(502).json({ error: 'La clave ANTHROPIC_API_KEY no es válida.' });
    } else if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: 'Se alcanzó el límite de uso de la API. Probá de nuevo en un rato.' });
    } else if (err instanceof Anthropic.APIError) {
      res.status(502).json({ error: `Error de la API de Claude (${err.status ?? 'sin conexión'}): ${err.message}` });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Error interno del consultor' });
    }
  } finally {
    conv.ocupada = false;
  }
});

export default router;
