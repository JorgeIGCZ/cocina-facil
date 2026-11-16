import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { crearStore } from './store.js';
import { crearCocina, ErrorUsuario } from './domain.js';
import { sembrar } from './seed.js';
import { crearServidorMcp } from './mcp.js';
import { openapi } from './openapi.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const PRODUCCION = process.env.NODE_ENV === 'production';
const APP_KEY = process.env.APP_KEY || '';
if (!APP_KEY) {
  if (PRODUCCION) { console.error('Falta APP_KEY (clave secreta).'); process.exit(1); }
  console.warn('⚠️  APP_KEY no definida: usando "dev" (solo para pruebas locales).');
}
const CLAVE = APP_KEY || 'dev';
const CLAVE_MCP = process.env.MCP_KEY || (PRODUCCION ? '' : CLAVE);
if (PRODUCCION && CLAVE_MCP && CLAVE_MCP === CLAVE) throw new Error('MCP_KEY debe ser distinta de APP_KEY.');

const store = crearStore();
const cocina = crearCocina(store);

const app = express();
app.disable('x-powered-by');

// --- públicos ---
app.get('/api/salud', (_req, res) => res.json({ ok: true }));
app.get('/openapi.json', (_req, res) => res.json(openapi(process.env.PUBLIC_URL || '/')));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  extensions: ['html'],
  maxAge: '1h',
  setHeaders(res, archivo) {
    if (['.html', '.js', '.css', '.webmanifest'].includes(path.extname(archivo))) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// --- autenticación ---
function claveValida(dada, clave) {
  const a = Buffer.from(String(dada || ''));
  const b = Buffer.from(clave);
  return b.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}
const auth = (clave) => (req, res, next) => {
  const h = req.get('authorization') || '';
  const dada = h.startsWith('Bearer ') ? h.slice(7) : req.get('x-api-key');
  if (claveValida(dada, clave)) {
    res.set('Cache-Control', 'no-store');
    return next();
  }
  res.status(401).json({ error: 'Clave incorrecta o faltante.' });
};

// --- MCP (Muse) ---
const JSON_MCP = '24kb';
app.post('/mcp', auth(CLAVE_MCP), express.json({ limit: JSON_MCP }), async (req, res) => {
  if (Array.isArray(req.body) && req.body.length > 20) {
    return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Demasiadas operaciones en un lote.' }, id: null });
  }
  const server = crearServidorMcp(cocina);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 24 * 1024,
  });
  res.on('close', () => { void server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error('MCP', e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Error interno' }, id: null });
  }
});
const metodoNoPermitido = (_req, res) => res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Método no permitido.' }, id: null });
app.get('/mcp', metodoNoPermitido);
app.delete('/mcp', metodoNoPermitido);

// --- API REST ---
const api = express.Router();
api.use(auth(CLAVE), express.json({ limit: '32kb' }));
api.use((req, res, next) => {
  if (req.body !== undefined && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) {
    return res.status(400).json({ error: 'Envía un objeto JSON.' });
  }
  req.body ??= {};
  next();
});
const h = (fn) => async (req, res) => {
  try { res.json(await fn(req)); }
  catch (e) {
    if (e instanceof ErrorUsuario) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
};
const bool = (v) => v === true || v === 'true' || v === '1';

api.get('/config', h(() => cocina.obtenerConfig()));
api.put('/config', h((r) => cocina.guardarConfig(r.body)));

api.get('/personas', h((r) => cocina.listarPersonas({ incluirInactivas: bool(r.query.todas) })));
api.post('/personas', h((r) => cocina.guardarPersona({ ...r.body, id: undefined })));
api.patch('/personas/:id', h((r) => cocina.guardarPersona({ ...r.body, id: r.params.id })));

api.get('/platillos', h((r) => cocina.listarPlatillos({ ...r.query, incluirArchivados: bool(r.query.archivados) })));
api.post('/platillos', h((r) => cocina.crearPlatillo(r.body)));
api.get('/platillos/:ref', h((r) => cocina.obtenerPlatillo(r.params.ref)));
api.patch('/platillos/:ref', h((r) => cocina.editarPlatillo(r.params.ref, r.body)));
api.get('/platillos/:ref/usos-futuros', h((r) => cocina.usosFuturos(r.params.ref)));
api.delete('/platillos/:ref', h((r) => cocina.archivarPlatillo(r.params.ref)));
api.post('/platillos/:ref/restaurar', h((r) => cocina.archivarPlatillo(r.params.ref, false)));
api.post('/platillos/:ref/calificar', h((r) => cocina.calificar(r.params.ref, r.body.estrellas)));

api.get('/semana', h((r) => cocina.obtenerSemana(r.query.fecha)));
api.post('/semana/armar', h((r) => cocina.armarSemana(r.body)));
api.put('/plan/:fecha/:comida', h((r) => cocina.asignar({ ...r.body, fecha: r.params.fecha, comida: r.params.comida })));
api.post('/plan/:fecha/:comida/hecho', h((r) => cocina.marcarHecho({ ...r.body, fecha: r.params.fecha, comida: r.params.comida })));
api.delete('/plan/:fecha/:comida/hecho', h((r) => cocina.desmarcarHecho({ fecha: r.params.fecha, comida: r.params.comida })));
api.get('/sugerencias', h((r) => cocina.sugerir({ ...r.query, rapido: bool(r.query.rapido), para: r.query.para ? String(r.query.para).split(',') : undefined })));
api.get('/historial', h((r) => cocina.listarHistorial(r.query)));

api.get('/refri', h(() => cocina.listarRefri()));
api.post('/refri', h((r) => cocina.actualizarRefri(r.body)));
api.get('/refri/que-hago', h((r) => cocina.queHagoConLoQueTengo(r.query)));

api.get('/compras', h((r) => cocina.listaCompras({ fecha: r.query.fecha, incluirLoQueTengo: bool(r.query.incluirLoQueTengo) })));
api.post('/compras', h((r) => cocina.agregarCompra(r.body)));
api.post('/compras/marcar', h((r) => cocina.marcarCompra(r.body)));
api.post('/compras/al-refri', h((r) => cocina.pasarComprasAlRefri(r.body)));
api.delete('/compras/:nombre', h((r) => cocina.quitarCompra({ fecha: r.query.fecha, nombre: r.params.nombre })));

app.use('/api', api);
app.use('/api', (_req, res) => res.status(404).json({ error: 'No existe.' }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const grande = err.type === 'entity.too.large';
  const invalido = err.type === 'entity.parse.failed';
  if (!grande && !invalido) console.error(err);
  const status = grande ? 413 : invalido ? 400 : 500;
  const message = grande ? 'La solicitud es demasiado grande.' : invalido ? 'El JSON no es válido.' : 'Error interno.';
  return req.path === '/mcp'
    ? res.status(status).json({ jsonrpc: '2.0', error: { code: invalido ? -32700 : -32000, message }, id: null })
    : res.status(status).json({ error: message });
});

const HOST = process.env.HOST || (PRODUCCION ? '0.0.0.0' : '127.0.0.1');
// Hostinger carga este módulo con require(), que no admite await en el nivel superior.
async function arrancar() {
  await store.init();
  if (await store.atomic((tx) => sembrar(tx, crearCocina(tx)))) console.log('Datos iniciales cargados.');
  const server = app.listen(PORT, HOST, (err) => {
    if (err) { fallarArranque(err); return; }
    console.log(`🍳 Mi Cocina en http://${HOST}:${server.address().port}`);
  });
}

function fallarArranque(err) {
  console.error('No se pudo iniciar Mi Cocina:', err.message);
  process.exit(1);
}

void arrancar().catch(fallarArranque);
