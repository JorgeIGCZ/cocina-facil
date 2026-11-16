// Especificación OpenAPI pública (sin datos) para que un asistente (Muse) entienda la API.
import { COMIDAS, ESTADOS, SECCIONES, TIEMPOS } from './domain.js';

const q = (name, description, schema = { type: 'string' }, required = false) => ({ name, in: 'query', required, description, schema });
const p = (name, description) => ({ name, in: 'path', required: true, description, schema: { type: 'string' } });
const body = (properties, required = []) => ({ required: true, content: { 'application/json': { schema: { type: 'object', properties, required } } } });
const ok = { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object' } } } } };
const op = (summary, extra = {}) => ({ summary, responses: ok, ...extra });

const fecha = { type: 'string', format: 'date', description: 'AAAA-MM-DD' };
const comida = { type: 'string', enum: COMIDAS };
const lista = { type: 'array', items: { type: 'string' } };
const estrellas = { type: 'object', additionalProperties: { type: 'integer', minimum: 0, maximum: 5 }, description: '{"Mamá": 5, "Niño 1": 3}' };

export function openapi(servidor) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Mi Cocina',
      version: '1.0.0',
      description: 'Planeador de comidas familiar: platillos con estrellas por persona, plan semanal (desayuno/comida/cena), sugerencias, refri, lista del súper e historial. También hay un servidor MCP en POST /mcp (streamable HTTP). Autenticación: header "Authorization: Bearer <clave>".',
    },
    servers: [{ url: servidor }],
    security: [{ bearer: [] }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } } },
    paths: {
      '/api/personas': {
        get: op('Listar personas de la familia'),
        post: op('Agregar persona', { requestBody: body({ nombre: { type: 'string' }, emoji: { type: 'string' }, rol: { type: 'string', enum: ['adulto', 'nino'] } }, ['nombre']) }),
      },
      '/api/personas/{id}': { patch: op('Editar persona (activo=false para quitarla)', { parameters: [p('id', 'Id')], requestBody: body({ nombre: { type: 'string' }, emoji: { type: 'string' }, rol: { type: 'string' }, activo: { type: 'boolean' } }) }) },
      '/api/platillos': {
        get: op('Listar/buscar platillos con puntaje y frecuencia', { parameters: [q('texto', 'Nombre o ingrediente'), q('tipo', 'desayuno|comida|cena'), q('categoria', 'pollo, res, cerdo…')] }),
        post: op('Agregar platillo', { requestBody: body({ nombre: { type: 'string' }, tipos: { type: 'array', items: comida }, categoria: { type: 'string' }, tiempo: { type: 'string', enum: Object.keys(TIEMPOS) }, ingredientes: lista, guarniciones: lista, etiquetas: lista, notas: { type: 'string' } }, ['nombre']) }),
      },
      '/api/platillos/{ref}': {
        get: op('Ver platillo', { parameters: [p('ref', 'Id o nombre')] }),
        patch: op('Editar platillo', { parameters: [p('ref', 'Id o nombre')], requestBody: body({ nombre: { type: 'string' }, tipos: lista, categoria: { type: 'string' }, tiempo: { type: 'string' }, ingredientes: lista, guarniciones: lista, etiquetas: lista, notas: { type: 'string' } }) }),
        delete: op('Borrar platillo', { parameters: [p('ref', 'Id o nombre')] }),
      },
      '/api/platillos/{ref}/calificar': { post: op('Calificar con estrellas por persona', { parameters: [p('ref', 'Id o nombre')], requestBody: body({ estrellas }, ['estrellas']) }) },
      '/api/semana': { get: op('Plan de la semana', { parameters: [q('fecha', 'Cualquier día de la semana', fecha)] }) },
      '/api/semana/armar': { post: op('Llenar la semana con sugerencias', { requestBody: body({ fecha, reemplazar: { type: 'boolean' } }) }) },
      '/api/plan/{fecha}/{comida}': {
        put: op('Asignar platillo o estado a un espacio', {
          parameters: [p('fecha', 'AAAA-MM-DD'), p('comida', COMIDAS.join('|'))],
          requestBody: body({ platillo: { type: 'string' }, para: lista, guarniciones: lista, modo: { type: 'string', enum: ['reemplazar', 'agregar'] }, estado: { type: ['string', 'null'], enum: [...Object.keys(ESTADOS), null] }, invitados: { type: 'integer' }, nota: { type: 'string' }, quitarPlato: { type: 'integer' } }),
        }),
      },
      '/api/plan/{fecha}/{comida}/hecho': {
        post: op('Marcar como cocinado', { parameters: [p('fecha', 'AAAA-MM-DD'), p('comida', '')], requestBody: body({ calificaciones: { type: 'object', additionalProperties: estrellas }, seAcabo: lista }) }),
        delete: op('Desmarcar cocinado', { parameters: [p('fecha', 'AAAA-MM-DD'), p('comida', '')] }),
      },
      '/api/sugerencias': { get: op('Sugerencias', { parameters: [q('fecha', '', fecha), q('comida', ''), q('cantidad', '', { type: 'integer' }), q('rapido', '', { type: 'boolean' }), q('categoria', ''), q('para', 'Nombres separados por coma, "niños" o "adultos"')] }) },
      '/api/historial': { get: op('Historial', { parameters: [q('desde', '', fecha), q('hasta', '', fecha), q('platillo', '')] }) },
      '/api/refri': { get: op('Ingredientes y si los hay'), post: op('Actualizar refri', { requestBody: body({ tengo: lista, seAcabo: lista }) }) },
      '/api/refri/que-hago': { get: op('Qué hacer con lo que hay', { parameters: [q('comida', '')] }) },
      '/api/compras': {
        get: op('Lista del súper de la semana', { parameters: [q('fecha', '', fecha)] }),
        post: op('Agregar extra a la lista', { requestBody: body({ nombre: { type: 'string' }, seccion: { type: 'string', enum: Object.keys(SECCIONES) }, fecha }, ['nombre']) }),
      },
      '/api/compras/marcar': { post: op('Tachar/destachar', { requestBody: body({ nombre: { type: 'string' }, marcado: { type: 'boolean' }, fecha }, ['nombre']) }) },
    },
  };
}
