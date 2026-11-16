// Conector MCP (streamable HTTP, sin sesión) para Meta Muse u otros asistentes.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { COMIDAS, ESTADOS, SECCIONES, CATEGORIAS, TIEMPOS, ErrorUsuario, hoyISO } from './domain.js';

const comida = z.enum(COMIDAS).describe('desayuno, comida o cena');
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Fecha AAAA-MM-DD (zona horaria de México)');
const estrellas = z.record(z.string(), z.number().int().min(0).max(5))
  .describe('Estrellas por persona, ej. {"Mamá": 5, "Niño 1": 3}. 0 borra la calificación.');

export function crearServidorMcp(cocina) {
  const server = new McpServer(
    { name: 'mi-cocina', version: '1.0.0' },
    {
      maxToolInputElements: 350,
      instructions: `Planeador de comidas de una familia mexicana. Habla en español.
- Hoy es ${hoyISO()} (usa ver_semana para ver fechas exactas). La semana va de lunes a domingo.
- Cada día tiene espacios: desayuno, comida y cena. Un espacio puede tener varios platillos con "para" distintos (ej. uno para los niños y otro para los adultos), o un estado especial: ${Object.entries(ESTADOS).map(([k, v]) => `${k} (${v})`).join(', ')}.
- Las calificaciones son estrellas 1–5 por persona. Usa listar_personas para los nombres.
- Abreviaturas de la usuaria: "m/p" = muslo con pierna; "plm" = pierna con muslo abierta; "diezmillo" es un corte de carne.
- Antes de crear un platillo, busca si ya existe. Antes de archivarlo, usa ver_platillo para informar si tiene comidas futuras y confirma con la usuaria.
- Para corregir una comida hecha, confirma con la usuaria y usa desmarcar_hecho antes de editarla.`,
    },
  );

  const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] });
  const herramienta = (nombre, descripcion, schema, fn, anotaciones = {}) =>
    server.registerTool(nombre, { description: descripcion, inputSchema: schema, annotations: anotaciones }, async (args) => {
      try { return ok(await fn(args)); }
      catch (e) {
        if (!(e instanceof ErrorUsuario)) console.error('Herramienta MCP:', nombre, e);
        return { isError: true, content: [{ type: 'text', text: e instanceof ErrorUsuario ? e.message : 'No pude completar la operación.' }] };
      }
    });
  const lectura = { readOnlyHint: true };

  // --- platillos ---
  herramienta('listar_platillos', 'Lista o busca platillos (por nombre o ingrediente) con su puntaje familiar, veces hechas y última vez.',
    { texto: z.string().optional(), tipo: comida.optional(), categoria: z.string().optional().describe(CATEGORIAS.join(', ')), incluirArchivados: z.boolean().optional() },
    async (a) => (await cocina.listarPlatillos(a)).map((p) => ({
      id: p.id, nombre: p.nombre, categoria: p.categoria, tiempo: p.tiempo, tipos: p.tipos,
      puntaje: p.stats.puntaje, puntajeNinos: p.stats.puntajeNinos, veces: p.stats.veces, ultimaVez: p.stats.ultimaVez, etiquetas: p.etiquetas, archivado: Boolean(p.archivado),
    })), lectura);

  herramienta('ver_platillo', 'Detalle del platillo, sus estrellas, ingredientes faltantes y comidas futuras que lo incluyen.',
    { platillo: z.string().describe('Nombre o id') }, async (a) => {
      const p = await cocina.obtenerPlatillo(a.platillo);
      return { ...p, usosFuturos: await cocina.usosFuturos(p.id) };
    }, lectura);

  herramienta('agregar_platillo', 'Agrega un platillo nuevo a su lista.', {
    nombre: z.string(),
    tipos: z.array(comida).optional().describe('En qué comidas va. Default: comida y cena'),
    categoria: z.string().optional().describe(CATEGORIAS.join(', ')),
    tiempo: z.enum(Object.keys(TIEMPOS)).optional(),
    ingredientes: z.array(z.string()).optional().describe('Solo los principales (no sal, aceite, etc.)'),
    guarniciones: z.array(z.string()).optional().describe('Acompañamientos típicos: arroz, frijoles, sopa, ensalada…'),
    etiquetas: z.array(z.string()).optional().describe('"invitados" (bueno para invitados), "adultos" (a los niños no les gusta), "ninos" (favorito de los niños)'),
    notas: z.string().optional(),
    vecesPrevias: z.number().int().min(0).optional(),
  }, (a) => cocina.crearPlatillo(a));

  herramienta('editar_platillo', 'Cambia datos de un platillo existente. Solo manda los campos a cambiar (las listas se reemplazan completas).', {
    platillo: z.string().describe('Nombre o id actual'),
    nombre: z.string().optional(), tipos: z.array(comida).optional(), categoria: z.string().optional(),
    tiempo: z.enum(Object.keys(TIEMPOS)).optional(), ingredientes: z.array(z.string()).optional(),
    guarniciones: z.array(z.string()).optional(), etiquetas: z.array(z.string()).optional(), notas: z.string().optional(),
    vecesPrevias: z.number().int().min(0).optional(),
  }, ({ platillo, ...cambios }) => cocina.editarPlatillo(platillo, cambios));

  herramienta('eliminar_platillo', 'Archiva un platillo conservando su plan e historial. Consulta usos futuros con ver_platillo y confirma antes.', { platillo: z.string() },
    (a) => cocina.archivarPlatillo(a.platillo), { destructiveHint: true, idempotentHint: true });
  herramienta('restaurar_platillo', 'Devuelve un platillo archivado a la lista y a las sugerencias.', { platillo: z.string() },
    (a) => cocina.archivarPlatillo(a.platillo, false), { destructiveHint: false, idempotentHint: true });

  herramienta('calificar_platillo', 'Pone estrellas (1–5) a un platillo por persona.', { platillo: z.string(), estrellas },
    async (a) => { const p = await cocina.calificar(a.platillo, a.estrellas); return { nombre: p.nombre, estrellas: p.calificacionesPorNombre, puntaje: p.stats.puntaje }; });

  // --- personas ---
  herramienta('listar_personas', 'Lista la familia (nombres, rol adulto/nino).', {}, () => cocina.listarPersonas(), lectura);
  herramienta('guardar_persona', 'Agrega o edita una persona de la familia. Para desactivar a alguien usa activo=false.', {
    id: z.string().optional().describe('Id de la persona a editar; omitir para agregar'),
    nombre: z.string().optional(), emoji: z.string().optional(), rol: z.enum(['adulto', 'nino']).optional(), activo: z.boolean().optional(),
  }, (a) => cocina.guardarPersona(a));

  // --- plan ---
  herramienta('ver_semana', 'Muestra el plan de la semana que contiene la fecha (default: esta semana).', { fecha: fecha.optional() },
    (a) => cocina.obtenerSemana(a.fecha), lectura);

  herramienta('sugerir', 'Sugiere platillos para un día y comida, según estrellas, hace cuánto no se hace, variedad, refri e invitados.', {
    fecha: fecha.optional(), comida: comida.optional(), cantidad: z.number().int().min(1).max(10).optional(),
    rapido: z.boolean().optional().describe('Solo platillos rápidos'), categoria: z.string().optional(),
    para: z.array(z.string()).optional().describe('Quiénes comerán: nombres, "niños" o "adultos". Default: todos'),
    excluir: z.array(z.string()).optional(),
  }, (a) => cocina.sugerir(a), lectura);

  herramienta('armar_semana', 'Llena automáticamente los espacios vacíos de la semana (días que cocina) con las mejores sugerencias.', {
    fecha: fecha.optional(), reemplazar: z.boolean().optional().describe('true = cambia comidas de un solo platillo para todos. Conserva comidas hechas, estados especiales y platos para grupos.'),
  }, async (a) => (await cocina.armarSemana(a)).llenados);

  herramienta('asignar_comida', `Pone un platillo o un estado en un espacio del plan.
- Para cocinar: platillo (+ para, guarniciones). modo "agregar" suma un segundo platillo (ej. uno para niños y otro para adultos).
- Usa reemplazarPlato (índice desde 0) para mantener el resto de los platillos. Con el índice y guarniciones puedes editar solo los acompañamientos.
- Estados especiales: ${Object.keys(ESTADOS).filter((e) => e !== 'cocinar').join(', ')}. estado null vacía el espacio.`, {
    fecha, comida,
    platillo: z.string().optional(),
    para: z.array(z.string()).optional().describe('Nombres, "niños", "adultos" o "todos"'),
    guarniciones: z.array(z.string()).optional(),
    modo: z.enum(['reemplazar', 'agregar']).optional(),
    estado: z.enum(Object.keys(ESTADOS)).nullable().optional(),
    invitados: z.number().int().min(0).optional(),
    nota: z.string().optional(),
    quitarPlato: z.number().int().min(0).optional(),
    reemplazarPlato: z.number().int().min(0).optional(),
    platilloEsperado: z.string().optional().describe('ID anterior en el índice al quitar o reemplazar; evita editar un platillo que cambió.'),
    soloSiVacio: z.boolean().optional(),
  }, (a) => cocina.asignar(a));

  herramienta('marcar_hecho', 'Marca que ya se cocinó lo planeado (queda en el historial). Opcional: estrellas y qué ingredientes se acabaron.', {
    fecha, comida,
    calificaciones: z.record(z.string(), estrellas).optional().describe('{"Tinga": {"Mamá": 5, "Niño 1": 4}}'),
    seAcabo: z.array(z.string()).optional(),
  }, (a) => cocina.marcarHecho(a));
  herramienta('desmarcar_hecho', 'Retira el registro del historial de esta comida y permite corregir el plan. Las estrellas y el refri se pueden corregir por separado.', { fecha, comida },
    (a) => cocina.desmarcarHecho(a), { destructiveHint: true, idempotentHint: true });

  herramienta('historial', 'Qué se ha cocinado (filtrable por fechas o platillo). Útil para "¿cuántas veces hice X?".', {
    desde: fecha.optional(), hasta: fecha.optional(), platillo: z.string().optional(),
  }, (a) => cocina.listarHistorial(a), lectura);

  // --- refri ---
  herramienta('ver_refri', 'Ingredientes que hay en casa ahora.', {},
    async () => (await cocina.listarRefri()).filter((r) => r.tengo).map((r) => r.nombre), lectura);
  herramienta('actualizar_refri', 'Marca ingredientes que sí hay (tengo) o que se acabaron (seAcabo).', {
    tengo: z.array(z.string()).optional(), seAcabo: z.array(z.string()).optional(),
  }, (a) => cocina.actualizarRefri(a));
  herramienta('que_hago_con_lo_que_tengo', 'Platillos que se pueden hacer con lo que hay en el refri.', {
    comida: comida.optional(), cantidad: z.number().int().min(1).max(15).optional(),
  }, (a) => cocina.queHagoConLoQueTengo(a), lectura);

  // --- súper ---
  herramienta('lista_super', 'Lista del súper de la semana: ingredientes de lo planeado que no hay en el refri, más extras. Agrupada por carnicería, verdura y súper.', {
    fecha: fecha.optional(),
  }, async (a) => {
    const l = await cocina.listaCompras(a);
    return Object.fromEntries(Object.entries(l.secciones).map(([k, items]) => [SECCIONES[k], items.map((i) => `${i.marcado ? '✔ ' : ''}${i.nombre}`)]));
  }, lectura);
  herramienta('agregar_al_super', 'Agrega cosas extra a la lista del súper (también no comestibles: papel de baño, etc.).', {
    nombres: z.array(z.string()), seccion: z.enum(Object.keys(SECCIONES)).optional(), fecha: fecha.optional(),
    alimento: z.boolean().optional().describe('Marca true si todos los extras de esta llamada son alimentos.'),
  }, async ({ nombres, ...a }) => { await cocina.agregarCompra({ ...a, nombre: nombres }); return { agregados: nombres }; });
  herramienta('marcar_comprado', 'Tacha (o destacha) algo de la lista del súper.', {
    nombre: z.string(), comprado: z.boolean().optional(), fecha: fecha.optional(),
  }, async (a) => { await cocina.marcarCompra({ fecha: a.fecha, nombre: a.nombre, marcado: a.comprado ?? true }); return { ok: true }; });
  herramienta('pasar_compras_al_refri', 'Marca como disponibles los alimentos comprados y los retira de la lista del súper.', { fecha: fecha.optional() },
    async (a) => ({ agregados: (await cocina.pasarComprasAlRefri(a)).agregados }));

  // --- config ---
  herramienta('configuracion', 'Ver o cambiar qué días cocina (0=domingo…6=sábado) y qué comidas planea.', {
    diasCocina: z.array(z.number().int().min(0).max(6)).optional(), comidasActivas: z.array(comida).optional(),
  }, (a) => (a.diasCocina || a.comidasActivas ? cocina.guardarConfig(a) : cocina.obtenerConfig()));

  return server;
}
