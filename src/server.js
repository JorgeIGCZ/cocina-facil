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
const APP_KEY = process.env.APP_KEY || '';
if (!APP_KEY) {
  if (process.env.NODE_ENV === 'production') { console.error('Falta APP_KEY (clave secreta).'); process.exit(1); }
  console.warn('⚠️  APP_KEY no definida: usando "dev" (solo para pruebas locales).');
}
const CLAVE = APP_KEY || 'dev';

const store = crearStore();
await store.init();
const cocina = crearCocina(store);
if (await sembrar(store, cocina)) console.log('Datos iniciales cargados.');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '200kb' }));

// --- públicos ---
app.get('/api/salud', (_req, res) => res.json({ ok: true }));
app.get('/openapi.json', (req, res) => res.json(openapi(`${req.protocol}://${req.get('host')}`)));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'], maxAge: '1h' }));

// --- autenticación ---
function claveValida(dada) {
  const a = Buffer.from(String(dada || ''));
  const b = Buffer.from(CLAVE);
  return a.length === b.length && timingSafeEqual(a, b);
}
function auth(req, res, next) {
  const h = req.get('authorization') || '';
  const dada = h.startsWith('Bearer ') ? h.slice(7) : req.get('x-api-key');
  if (claveValida(dada)) return next();
  res.status(401).json({ error: 'Clave incorrecta o faltante.' });
}

// --- MCP (Muse) ---
app.post('/mcp', auth, async (req, res) => {
  const server = crearServidorMcp(cocina);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
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
api.use(auth);
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

api.get('/platillos', h((r) => cocina.listarPlatillos(r.query)));
api.post('/platillos', h((r) => cocina.crearPlatillo(r.body)));
api.get('/platillos/:ref', h((r) => cocina.obtenerPlatillo(r.params.ref)));
api.patch('/platillos/:ref', h((r) => cocina.editarPlatillo(r.params.ref, r.body)));
api.delete('/platillos/:ref', h((r) => cocina.eliminarPlatillo(r.params.ref)));
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

api.get('/compras', h((r) => cocina.listaCompras(r.query)));
api.post('/compras', h((r) => cocina.agregarCompra(r.body)));
api.post('/compras/marcar', h((r) => cocina.marcarCompra(r.body)));
api.delete('/compras/:nombre', h((r) => cocina.quitarCompra({ fecha: r.query.fecha, nombre: r.params.nombre })));

app.use('/api', api);
app.use('/api', (_req, res) => res.status(404).json({ error: 'No existe.' }));

app.listen(PORT, () => console.log(`🍳 Mi Cocina en http://localhost:${PORT}`));
