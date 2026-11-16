// Lógica de "Mi Cocina": platillos, calificaciones, plan semanal, sugerencias,
// refri, lista del súper e historial. La usan la API REST y el conector MCP.
import { randomBytes } from 'node:crypto';

export const COMIDAS = ['desayuno', 'comida', 'cena'];
export const ESTADOS = {
  cocinar: 'Cocinar',
  comprado: 'Compro hecho',
  fuera: 'Comemos fuera',
  suegros: 'Con los suegros',
  sobras: 'Lo que quedó',
  nada: 'No aplica',
};
export const CATEGORIAS = ['pollo', 'res', 'cerdo', 'pescado', 'sin carne', 'antojito', 'caldo', 'pasta', 'desayuno'];
export const TIEMPOS = { rapido: 'Rápido (−30 min)', medio: 'Medio', largo: 'Largo / fin de semana' };
export const SECCIONES = { carniceria: 'Carnicería', verdura: 'Verdura y fruta', super: 'Súper y otros' };
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const TZ = process.env.TZ_APP || 'America/Mexico_City';

const CARNICERIA = ['pollo', 'pechuga', 'm/p', 'plm', 'pierna', 'muslo', 'res', 'bistec', 'diezmillo', 'filete', 'chuleta',
  'cerdo', 'puerco', 'costilla', 'cecina', 'carne', 'aguja', 'punta', 'tocino', 'pastor', 'barbacoa', 'molida', 'pescado'];
const VERDURA = ['jitomate', 'tomate', 'cebolla', 'chile', 'cilantro', 'aguacate', 'limon', 'lechuga', 'papa', 'calabaza',
  'zanahoria', 'elote', 'pimiento', 'pepino', 'ajo', 'hierbabuena', 'pina', 'verdura', 'fruta', 'platano', 'manzana',
  'fresa', 'mandarina', 'naranja', 'nopal', 'ejote', 'brocoli', 'coliflor', 'espinaca', 'betabel', 'chayote', 'mango'];

// ---------- utilidades ----------
export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
const uid = () => randomBytes(16).toString('hex');
const ALIAS_INGREDIENTES = new Map([
  ['m/p', 'muslo con pierna'], ['m/p (muslo con pierna)', 'muslo con pierna'],
  ['plm', 'pierna con muslo abierta'], ['plm (pierna con muslo abierta)', 'pierna con muslo abierta'],
  ['huevos', 'huevo'], ['chiles', 'chile'], ['pimientos', 'pimiento'],
  ['nopales', 'nopal'], ['spaguetti', 'espagueti'], ['spaghetti', 'espagueti'],
  ['queso rayado', 'queso rallado'],
]);
const idIngrediente = (nombre) => { const id = normalizar(nombre); return ALIAS_INGREDIENTES.get(id) || id; };
const nombreIngrediente = (nombre) => ALIAS_INGREDIENTES.get(normalizar(nombre)) || nombre;
const aliasPorId = new Map();
for (const [alias, id] of ALIAS_INGREDIENTES) {
  if (!aliasPorId.has(id)) aliasPorId.set(id, []);
  aliasPorId.get(id).push(alias);
}

export function hoyISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}
const aFecha = (iso) => new Date(`${iso}T12:00:00Z`);
const aISO = (d) => d.toISOString().slice(0, 10);
export function sumarDias(iso, n) { const d = aFecha(iso); d.setUTCDate(d.getUTCDate() + n); return aISO(d); }
export function diasEntre(a, b) { return Math.round((aFecha(b) - aFecha(a)) / 86400000); }
export function inicioSemana(iso = hoyISO()) { const d = aFecha(iso); const dow = d.getUTCDay(); return sumarDias(iso, dow === 0 ? -6 : 1 - dow); }
export const nombreDia = (iso) => DIAS[aFecha(iso).getUTCDay()];
function validarFecha(f) {
  if (typeof f !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(f)
      || !Number.isFinite(+aFecha(f)) || aISO(aFecha(f)) !== f) {
    throw new ErrorUsuario(`Fecha inválida: "${f}". Usa una fecha real en formato AAAA-MM-DD.`);
  }
  return f;
}
const validarComida = (c) => { if (!COMIDAS.includes(c)) throw new ErrorUsuario(`Comida inválida: "${c}". Usa desayuno, comida o cena.`); return c; };

export function seccionDe(ingrediente) {
  const palabras = idIngrediente(ingrediente).split(/[^a-z0-9/]+/);
  const coincide = (k) => palabras.some((p) => p === k || p === `${k}s` || p === `${k}es`);
  if (CARNICERIA.some(coincide)) return 'carniceria';
  if (VERDURA.some(coincide)) return 'verdura';
  return 'super';
}

export class ErrorUsuario extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

const listaTexto = (v) => (Array.isArray(v) ? v : String(v ?? '').split(','))
  .map((x) => String(x).trim()).filter(Boolean);
const porIngrediente = (nombres) => [...new Map(nombres.map((n) => [idIngrediente(n), nombreIngrediente(n)])).values()];
const estaVacio = (s) => !s || (!s.platos.length && (!s.estado || s.estado === 'cocinar'));
const esEstadoEspecial = (s) => s.estado && s.estado !== 'cocinar';

function resolverNombre(ref, elementos) {
  const n = normalizar(ref);
  if (typeof ref !== 'string' || !n) throw new ErrorUsuario('Indica un nombre o ID.');
  const exacto = elementos.find((p) => p.id === ref);
  if (exacto) return exacto;
  const coincidencias = [
    (p) => normalizar(p.nombre) === n,
    (p) => normalizar(p.nombre).startsWith(n),
    (p) => normalizar(p.nombre).includes(n),
  ];
  for (const coincide of coincidencias) {
    const candidatos = elementos.filter(coincide);
    if (candidatos.length > 1) throw new ErrorUsuario(`«${ref}» coincide con varias opciones. Elige: ${candidatos.map((p) => p.nombre).join(', ')}.`, 409);
    if (candidatos.length) return candidatos[0];
  }
  throw new ErrorUsuario(`No encontré «${ref}».`, 404);
}

function mapaRefri(refri) {
  const porId = new Map();
  for (const item of refri) {
    const id = idIngrediente(item.nombre || item.id);
    const previo = porId.get(id);
    if (previo?.canonico && item.id !== id) continue;
    const canonico = item.id === id;
    const estado = item.estado || (item.tengo ? 'tengo' : 'falta');
    const estadoUnido = !canonico && previo?.estado === 'tengo' ? previo.estado : estado;
    porId.set(id, { id, nombre: nombreIngrediente(item.nombre || item.id), canonico, estado: estadoUnido });
  }
  return porId;
}

// ---------- servicio ----------
export function crearCocina(store) {
  // ---- config ----
  async function obtenerConfig() {
    return {
      diasCocina: [1, 2, 3, 4, 5, 6], // 0 = domingo
      comidasActivas: ['desayuno', 'comida'],
      ...(await store.get('config', 'general')),
    };
  }
  async function guardarConfig(patch) {
    const actual = await obtenerConfig();
    const nuevo = { ...actual };
    if (patch.diasCocina !== undefined) {
      if (!Array.isArray(patch.diasCocina) || patch.diasCocina.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw new ErrorUsuario('Los días van de 0 a 6.');
      nuevo.diasCocina = [...new Set(patch.diasCocina)];
    }
    if (patch.comidasActivas !== undefined) {
      if (!Array.isArray(patch.comidasActivas) || !patch.comidasActivas.length || patch.comidasActivas.some((c) => !COMIDAS.includes(c))) throw new ErrorUsuario('Elige al menos desayuno, comida o cena.');
      nuevo.comidasActivas = COMIDAS.filter((c) => patch.comidasActivas.includes(c));
    }
    await store.put('config', 'general', nuevo);
    return nuevo;
  }

  // ---- personas ----
  async function listarPersonas({ incluirInactivas = false } = {}) {
    const ps = (await store.all('personas')).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    return incluirInactivas ? ps : ps.filter((p) => p.activo !== false);
  }
  async function resolverPersona(ref) {
    return resolverNombre(ref, await listarPersonas({ incluirInactivas: true }));
  }
  async function guardarPersona(datos) {
    const existente = datos.id ? await store.get('personas', datos.id) : null;
    if (datos.id && !existente) throw new ErrorUsuario('No encontré a esa persona.', 404);
    const nombre = datos.nombre ?? existente?.nombre;
    if (typeof nombre !== 'string' || !nombre.trim()) throw new ErrorUsuario('La persona necesita un nombre.');
    if (datos.rol !== undefined && !['adulto', 'nino'].includes(datos.rol)) throw new ErrorUsuario('Elige adulto o niño.');
    const todas = await listarPersonas({ incluirInactivas: true });
    const p = {
      id: existente?.id || uid(),
      nombre: nombre.trim(),
      emoji: datos.emoji ?? existente?.emoji ?? '🙂',
      rol: datos.rol ?? existente?.rol ?? 'adulto',
      activo: datos.activo ?? existente?.activo ?? true,
      orden: existente?.orden ?? todas.length,
    };
    await store.put('personas', p.id, p);
    return p;
  }

  // ---- platillos ----
  async function contexto() {
    const [platillos, historial, personas, refri] = await Promise.all([
      store.all('platillos'), store.all('historial'), listarPersonas(), store.all('refri'),
    ]);
    return { platillos, historial, personas, inventario: mapaRefri(refri) };
  }

  function estadisticas(p, { historial, personas, inventario }, hoy = hoyISO()) {
    const fechas = new Map();
    for (const h of historial) if (h.platilloId === p.id && h.fecha <= hoy) fechas.set(`${h.fecha}_${h.comida}`, h.fecha);
    const hechos = [...fechas.values()].sort((a, b) => b.localeCompare(a));
    const ultimaVez = hechos[0] || null;
    const califs = personas
      .map((per) => ({ persona: per, estrellas: p.calificaciones?.[per.id] }))
      .filter((c) => c.estrellas);
    const puntaje = califs.length ? califs.reduce((s, c) => s + c.estrellas, 0) / califs.length : null;
    const ninos = califs.filter((c) => c.persona.rol === 'nino');
    const puntajeNinos = ninos.length ? ninos.reduce((s, c) => s + c.estrellas, 0) / ninos.length : null;
    const ingredientes = porIngrediente(p.ingredientes || []).map((nombre) => {
      const id = idIngrediente(nombre);
      return { id, nombre, estado: inventario.get(id)?.estado || 'revisar' };
    });
    return {
      veces: (p.vecesPrevias || 0) + hechos.length,
      vecesUltimos30: hechos.filter((f) => diasEntre(f, hoy) <= 30).length,
      ultimaVez,
      diasDesde: ultimaVez ? diasEntre(ultimaVez, hoy) : null,
      puntaje: puntaje == null ? null : Math.round(puntaje * 10) / 10,
      puntajeNinos: puntajeNinos == null ? null : Math.round(puntajeNinos * 10) / 10,
      ingredientes,
      tienes: ingredientes.filter((i) => i.estado === 'tengo').length,
      faltan: ingredientes.filter((i) => i.estado === 'falta').map((i) => i.nombre),
      porRevisar: ingredientes.filter((i) => i.estado === 'revisar').map((i) => i.nombre),
    };
  }

  function conStats(p, ctx) {
    const nombres = Object.fromEntries(ctx.personas.map((x) => [x.id, x.nombre]));
    const calificacionesPorNombre = Object.fromEntries(
      Object.entries(p.calificaciones || {}).filter(([id]) => nombres[id]).map(([id, v]) => [nombres[id], v]),
    );
    return { ...p, calificacionesPorNombre, stats: estadisticas(p, ctx) };
  }

  async function listarPlatillos({ texto, tipo, categoria, incluirArchivados = false } = {}) {
    const ctx = await contexto();
    const t = normalizar(texto);
    return ctx.platillos
      .filter((p) => incluirArchivados || !p.archivado)
      .filter((p) => !tipo || (p.tipos || []).includes(tipo))
      .filter((p) => !categoria || normalizar(p.categoria) === normalizar(categoria))
      .filter((p) => !t || normalizar(p.nombre).includes(t) || (p.ingredientes || []).some((i) => normalizar(i).includes(t)))
      .map((p) => conStats(p, ctx))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  async function resolverPlatillo(ref) {
    if (typeof ref !== 'string' || !ref.trim()) throw new ErrorUsuario('Falta indicar el platillo.');
    const directo = await store.get('platillos', ref);
    if (directo) return directo;
    return resolverNombre(ref, await store.all('platillos'));
  }

  async function obtenerPlatillo(ref) {
    const p = await resolverPlatillo(ref);
    return conStats(p, await contexto());
  }

  function limpiarPlatillo(datos, base = {}) {
    const p = { ...base };
    if (datos.nombre !== undefined) {
      if (typeof datos.nombre !== 'string' || !datos.nombre.trim()) throw new ErrorUsuario('El platillo necesita un nombre.');
      p.nombre = datos.nombre.trim();
    }
    if (datos.tipos !== undefined) p.tipos = listaTexto(datos.tipos).filter((t) => COMIDAS.includes(t));
    if (datos.categoria !== undefined) p.categoria = normalizar(datos.categoria) || 'sin carne';
    if (datos.tiempo !== undefined) p.tiempo = Object.hasOwn(TIEMPOS, datos.tiempo) ? datos.tiempo : 'medio';
    if (datos.ingredientes !== undefined) p.ingredientes = porIngrediente(listaTexto(datos.ingredientes).map((i) => i.toLowerCase()));
    if (datos.guarniciones !== undefined) p.guarniciones = listaTexto(datos.guarniciones);
    if (datos.etiquetas !== undefined) p.etiquetas = listaTexto(datos.etiquetas).map(normalizar);
    if (datos.notas !== undefined) p.notas = String(datos.notas);
    if (datos.vecesPrevias !== undefined) {
      if (!Number.isSafeInteger(datos.vecesPrevias) || datos.vecesPrevias < 0) throw new ErrorUsuario('Las veces de la libreta deben ser un número entero desde 0.');
      p.vecesPrevias = datos.vecesPrevias;
    }
    if (!p.tipos?.length) throw new ErrorUsuario('Elige al menos desayuno, comida o cena.');
    return p;
  }

  async function crearPlatillo(datos) {
    if (typeof datos?.nombre !== 'string' || !datos.nombre.trim()) throw new ErrorUsuario('El platillo necesita un nombre.');
    const todos = await store.all('platillos');
    if (todos.some((x) => normalizar(x.nombre) === normalizar(datos.nombre))) {
      throw new ErrorUsuario(`Ya existe un platillo llamado "${datos.nombre}".`, 409);
    }
    const p = limpiarPlatillo(
      { tipos: ['comida', 'cena'], categoria: 'sin carne', tiempo: 'medio', ingredientes: [], guarniciones: [], etiquetas: [], notas: '', ...datos },
      { id: uid(), calificaciones: {}, vecesPrevias: 0, creado: hoyISO() },
    );
    await store.put('platillos', p.id, p);
    if (datos.calificaciones !== undefined) return calificar(p.id, datos.calificaciones);
    return obtenerPlatillo(p.id);
  }

  async function editarPlatillo(ref, cambios) {
    const actual = await resolverPlatillo(ref);
    const p = limpiarPlatillo(cambios, actual);
    if (!p.nombre) throw new ErrorUsuario('El nombre no puede quedar vacío.');
    if (normalizar(p.nombre) !== normalizar(actual.nombre) && (await store.all('platillos')).some((x) => x.id !== p.id && normalizar(x.nombre) === normalizar(p.nombre))) {
      throw new ErrorUsuario(`Ya existe un platillo llamado "${p.nombre}".`, 409);
    }
    await store.put('platillos', p.id, p);
    if (cambios.calificaciones !== undefined) return calificar(p.id, cambios.calificaciones);
    return obtenerPlatillo(p.id);
  }

  async function usosFuturos(ref) {
    const p = await resolverPlatillo(ref);
    const hoy = hoyISO();
    return (await store.all('plan')).filter((s) => s.fecha >= hoy && !s.hecho && s.platos.some((pl) => pl.platilloId === p.id))
      .map(({ fecha, comida }) => ({ fecha, comida })).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  async function archivarPlatillo(ref, archivado = true) {
    const p = await resolverPlatillo(ref);
    p.archivado = archivado;
    await store.put('platillos', p.id, p);
    return { nombre: p.nombre, archivado, usosFuturos: await usosFuturos(p.id) };
  }

  async function calificar(ref, estrellasPorPersona) {
    const p = await resolverPlatillo(ref);
    p.calificaciones ||= {};
    if (!estrellasPorPersona || typeof estrellasPorPersona !== 'object' || Array.isArray(estrellasPorPersona)) throw new ErrorUsuario('Indica las estrellas por persona.');
    for (const [quien, valor] of Object.entries(estrellasPorPersona)) {
      const per = await resolverPersona(quien);
      if (!Number.isInteger(valor) || valor < 0 || valor > 5) throw new ErrorUsuario('Las estrellas van de 1 a 5. Usa 0 para quitar una calificación.');
      if (valor === 0) delete p.calificaciones[per.id];
      else p.calificaciones[per.id] = valor;
    }
    await store.put('platillos', p.id, p);
    return obtenerPlatillo(p.id);
  }

  // ---- plan ----
  const slotId = (fecha, comida) => `${fecha}_${comida}`;

  async function obtenerSlot(fecha, comida) {
    return (await store.get('plan', slotId(fecha, comida)))
      || { id: slotId(fecha, comida), fecha, comida, estado: null, platos: [], invitados: 0, hecho: false, nota: '' };
  }

  async function obtenerSemana(fecha = hoyISO(), base) {
    validarFecha(fecha);
    const inicio = inicioSemana(fecha);
    const [config, platillos, personas, plan] = base
      ? [base.config, base.ctx.platillos, base.ctx.personas, [...base.plan.values()]]
      : await Promise.all([obtenerConfig(), store.all('platillos'), listarPersonas(), store.all('plan')]);
    const porId = new Map(platillos.map((p) => [p.id, p]));
    const personasPorId = new Map(personas.map((p) => [p.id, p]));
    const porSlot = new Map(plan.map((s) => [s.id, s]));
    const hoy = hoyISO();
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const f = sumarDias(inicio, i);
      const dow = aFecha(f).getUTCDay();
      const comidas = {};
      for (const c of config.comidasActivas) {
        const s = porSlot.get(slotId(f, c));
        const estado = s && !estaVacio(s) ? s.estado : null;
        comidas[c] = s ? {
          ...s,
          estado,
          etiqueta: estado ? ESTADOS[estado] : null,
          platos: s.platos.map((pl) => ({
            ...pl,
            nombre: porId.get(pl.platilloId)?.nombre || pl.nombre || '(platillo eliminado)',
            disponible: porId.has(pl.platilloId),
            paraNombres: pl.para?.length ? pl.para.map((id) => personasPorId.get(id)?.nombre).filter(Boolean) : ['Todos'],
          })),
        } : null;
      }
      dias.push({ fecha: f, dia: nombreDia(f), cocina: config.diasCocina.includes(dow), esHoy: f === hoy, comidas });
    }
    return { inicio, fin: sumarDias(inicio, 6), hoy, comidasActivas: config.comidasActivas, dias };
  }

  async function resolverPara(para, activas) {
    if (!para || (Array.isArray(para) && !para.length)) return null;
    const lista = listaTexto(para);
    if (lista.some((x) => ['todos', 'todas', 'familia'].includes(normalizar(x)))) return null;
    const personas = activas || await listarPersonas();
    const ids = new Set();
    for (const ref of lista) {
      const n = normalizar(ref);
      if (['ninos', 'niños', 'los ninos', 'hijos', 'kids'].includes(n)) personas.filter((p) => p.rol === 'nino').forEach((p) => ids.add(p.id));
      else if (['adultos', 'papas', 'nosotros'].includes(n)) personas.filter((p) => p.rol !== 'nino').forEach((p) => ids.add(p.id));
      else ids.add(resolverNombre(ref, personas).id);
    }
    if (!ids.size) throw new ErrorUsuario('No hay personas activas en ese grupo.');
    return ids.size === personas.length ? null : [...ids];
  }

  /**
   * Cambia un espacio del plan.
   * - estado: cocinar | comprado | fuera | suegros | sobras | nada | null (vaciar)
   * - platillo + para + guarniciones + modo ("reemplazar" | "agregar")
   * - invitados, nota
   */
  async function guardarAsignacion({ fecha, comida, estado, platillo, para, guarniciones, modo = 'reemplazar', invitados, nota, quitarPlato, reemplazarPlato, soloSiVacio = false, platilloEsperado }, base) {
    validarFecha(fecha); validarComida(comida);
    const s = base ? base.slot : await obtenerSlot(fecha, comida);
    if (s.hecho) throw new ErrorUsuario('Desmarca «Hecho» antes de cambiar esta comida.', 409);
    if (soloSiVacio && !estaVacio(s)) throw new ErrorUsuario('Ya hay algo en este espacio. Abre la comida para revisarla.', 409);
    if (!['reemplazar', 'agregar'].includes(modo)) throw new ErrorUsuario('Modo inválido.');
    const validarIndice = (i) => {
      if (!Number.isInteger(i) || i < 0 || i >= s.platos.length || (platilloEsperado && s.platos[i].platilloId !== platilloEsperado)) {
        throw new ErrorUsuario('Ese platillo cambió. Vuelve a abrir la comida para revisarla.', 409);
      }
    };
    if (reemplazarPlato !== undefined) validarIndice(reemplazarPlato);
    if (quitarPlato !== undefined) {
      validarIndice(quitarPlato);
      if (reemplazarPlato !== undefined) throw new ErrorUsuario('Edita o quita un platillo en cada acción.');
      s.platos.splice(quitarPlato, 1);
    }
    if (estado !== undefined) {
      if (estado !== null && !Object.hasOwn(ESTADOS, estado)) throw new ErrorUsuario(`Estado inválido. Opciones: ${Object.keys(ESTADOS).join(', ')}`);
      if (estado !== 'cocinar' && (platillo || reemplazarPlato !== undefined)) throw new ErrorUsuario('Elige un platillo o un estado especial.');
      s.estado = estado;
      if (estado !== 'cocinar') s.platos = [];
    }
    const anterior = reemplazarPlato === undefined ? null : s.platos[reemplazarPlato];
    if (platillo) {
      const p = base?.platillo || await resolverPlatillo(platillo);
      if (p.archivado) throw new ErrorUsuario(`«${p.nombre}» está archivado.`, 409);
      const plato = {
        platilloId: p.id,
        nombre: p.nombre,
        para: anterior ? anterior.para : await resolverPara(para),
        guarniciones: guarniciones !== undefined ? listaTexto(guarniciones) : (p.guarniciones || []).slice(0, 2),
      };
      if (anterior) s.platos[reemplazarPlato] = plato;
      else if (modo === 'agregar') {
        if (plato.para) {
          const todos = (await listarPersonas()).map((x) => x.id);
          s.platos = s.platos.flatMap((otro) => {
            const resto = (otro.para?.length ? otro.para : todos).filter((id) => !plato.para.includes(id));
            return resto.length ? [{ ...otro, para: resto }] : [];
          });
        }
        s.platos.push(plato);
      }
      else s.platos = [plato];
      s.estado = 'cocinar';
    } else if (anterior && guarniciones !== undefined) {
      anterior.guarniciones = listaTexto(guarniciones);
    }
    if (invitados !== undefined) {
      if (!Number.isSafeInteger(invitados) || invitados < 0) throw new ErrorUsuario('Indica el número de invitados.');
      s.invitados = invitados;
    }
    if (nota !== undefined) s.nota = String(nota);
    if (estaVacio(s)) s.estado = null;
    if (!s.estado && !s.platos.length && !s.invitados && !s.nota) await store.del('plan', s.id);
    else await store.put('plan', s.id, s);
    return s;
  }

  async function asignar(args) {
    await guardarAsignacion(args);
    return (await obtenerSemana(args.fecha)).dias.find((d) => d.fecha === args.fecha);
  }

  // ---- sugerencias ----
  async function sugerir({ fecha = hoyISO(), comida = 'comida', cantidad = 3, rapido = false, categoria, excluir = [], para, usarRefri = true, aleatorio = true } = {}, base) {
    validarFecha(fecha); validarComida(comida);
    const ctx = base?.ctx || await contexto();
    const ids = await resolverPara(para, ctx.personas);
    const comensales = ids ? ctx.personas.filter((p) => ids.includes(p.id)) : ctx.personas;
    const slot = base?.slot || await obtenerSlot(fecha, comida);
    const invitados = slot.invitados || 0;

    // Lo planeado esta semana y los días vecinos (para variar)
    const ini = inicioSemana(fecha);
    const plan = (base ? [...base.plan.values()] : await store.all('plan')).filter((s) => s.fecha >= sumarDias(ini, -1) && s.fecha <= sumarDias(ini, 7));
    const enSemana = new Set(plan.filter((s) => !(s.fecha === fecha && s.comida === comida)).flatMap((s) => s.platos.map((p) => p.platilloId)));
    const catVecinas = new Set(plan
      .filter((s) => Math.abs(diasEntre(s.fecha, fecha)) === 1 && s.comida === comida)
      .flatMap((s) => s.platos.map((p) => ctx.platillos.find((x) => x.id === p.platilloId)?.categoria)).filter(Boolean));
    const excl = new Set(listaTexto(excluir).map(normalizar));

    const candidatos = ctx.platillos
      .filter((p) => !p.archivado)
      .filter((p) => (p.tipos || []).includes(comida))
      .filter((p) => !excl.has(p.id) && !excl.has(normalizar(p.nombre)))
      .filter((p) => !rapido || p.tiempo === 'rapido')
      .filter((p) => !categoria || normalizar(p.categoria) === normalizar(categoria));

    const resultado = candidatos.map((p) => {
      const st = estadisticas(p, ctx, fecha);
      const razones = [];
      let puntos = 0;
      // Gusto: estrellas de quienes van a comer
      const cal = comensales.map((c) => p.calificaciones?.[c.id]).filter(Boolean);
      const gusto = cal.length ? cal.reduce((a, b) => a + b, 0) / cal.length : 3.5;
      puntos += ((gusto - 1) / 4) * 40;
      if (cal.length && gusto >= 4.5) razones.push(`⭐ ${gusto.toFixed(1)} les encanta`);
      else if (cal.length) razones.push(`⭐ ${gusto.toFixed(1)}`);
      // Hace cuánto no se hace
      const dias = st.diasDesde ?? 14;
      puntos += (Math.min(dias, 30) / 30) * 30;
      // Costumbre: lo que más aparece en sus libretas es lo que suele hacer
      puntos += Math.min(p.vecesPrevias || 0, 5) * 3;
      // Platillos largos, mejor en fin de semana
      const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay();
      if (p.tiempo === 'largo' && dow >= 1 && dow <= 5) puntos -= 8;
      if (st.diasDesde == null) razones.push(st.veces ? `lo has hecho ${st.veces} ${st.veces === 1 ? 'vez' : 'veces'}` : 'nuevo en tu lista');
      else if (st.diasDesde >= 14) razones.push(`hace ${st.diasDesde} días que no lo haces`);
      else razones.push(`hace ${st.diasDesde} días`);
      puntos -= st.vecesUltimos30 * 6;
      // Variedad
      if (enSemana.has(p.id)) { puntos -= 45; razones.push('ya está esta semana'); }
      if (catVecinas.has(p.categoria)) { puntos -= 15; razones.push(`ayer o mañana también hay ${p.categoria}`); }
      // Refri
      const totalIngredientes = st.ingredientes.length;
      if (usarRefri && totalIngredientes) {
        const frac = st.tienes / totalIngredientes;
        puntos += frac * 20;
        if (st.tienes) razones.push(`tienes ${st.tienes} de ${totalIngredientes} ingredientes`);
      }
      // Invitados
      if (invitados > 0 && (p.etiquetas || []).includes('invitados')) { puntos += 15; razones.push('bueno para invitados'); }
      // Niños
      const hayNinos = comensales.some((c) => c.rol === 'nino');
      if (hayNinos && (p.etiquetas || []).includes('adultos')) { puntos -= 20; razones.push('es más de adultos'); }
      if (hayNinos && (p.etiquetas || []).includes('ninos')) { puntos += 10; razones.push('favorito de los niños'); }
      if (aleatorio) puntos += Math.random() * 10;
      return {
        platillo: { id: p.id, nombre: p.nombre, categoria: p.categoria, tiempo: p.tiempo, guarniciones: p.guarniciones || [] },
        puntos: Math.round(puntos), razones, faltan: st.faltan, porRevisar: st.porRevisar, totalIngredientes, puntajeNinos: st.puntajeNinos,
      };
    }).sort((a, b) => b.puntos - a.puntos);

    return resultado.slice(0, Math.max(1, Math.min(Number(cantidad) || 3, 20)));
  }

  async function armarSemana({ fecha = hoyISO(), reemplazar = false } = {}) {
    validarFecha(fecha);
    const [config, ctx, slots] = await Promise.all([obtenerConfig(), contexto(), store.all('plan')]);
    const plan = new Map(slots.map((s) => [s.id, s]));
    const platillos = new Map(ctx.platillos.map((p) => [p.id, p]));
    const ini = inicioSemana(fecha);
    const hoy = hoyISO();
    const llenados = [];
    for (let i = 0; i < 7; i++) {
      const f = sumarDias(ini, i);
      if (f < hoy) continue; // no cambiar días pasados
      if (!config.diasCocina.includes(aFecha(f).getUTCDay())) continue;
      for (const c of config.comidasActivas) {
        const id = slotId(f, c);
        const s = plan.get(id) || { id, fecha: f, comida: c, estado: null, platos: [], invitados: 0, hecho: false, nota: '' };
        if (s.hecho || esEstadoEspecial(s) || s.platos.length > 1 || s.platos.some((p) => p.para?.length)) continue;
        if (!reemplazar && !estaVacio(s)) continue;
        const [mejor] = await sugerir({ fecha: f, comida: c, cantidad: 1 }, { ctx, plan, slot: s });
        if (!mejor) continue;
        const nuevo = await guardarAsignacion({ fecha: f, comida: c, platillo: mejor.platillo.id }, { slot: s, platillo: platillos.get(mejor.platillo.id) });
        plan.set(id, nuevo);
        llenados.push({ fecha: f, dia: nombreDia(f), comida: c, platillo: mejor.platillo.nombre });
      }
    }
    return { llenados, semana: await obtenerSemana(fecha, { config, ctx, plan }) };
  }

  // ---- marcar hecho + historial ----
  async function marcarHecho({ fecha, comida, calificaciones, seAcabo }) {
    validarFecha(fecha); validarComida(comida);
    if (fecha > hoyISO()) throw new ErrorUsuario('Todavía no puedes registrar una comida futura.');
    const s = await obtenerSlot(fecha, comida);
    if (!s.platos.length) throw new ErrorUsuario('Ese espacio no tiene platillos para marcar como hecho.');
    const verDia = async () => (await obtenerSemana(fecha)).dias.find((d) => d.fecha === fecha);
    if (s.hecho) return verDia();
    if (calificaciones !== undefined && (!calificaciones || typeof calificaciones !== 'object' || Array.isArray(calificaciones))) throw new ErrorUsuario('Indica las calificaciones por platillo.');
    for (const [ref, porPersona] of Object.entries(calificaciones || {})) {
      const p = await resolverPlatillo(ref);
      if (!s.platos.some((pl) => pl.platilloId === p.id)) throw new ErrorUsuario(`«${p.nombre}» no está en esta comida.`);
      await calificar(p.id, porPersona);
    }
    if (seAcabo?.length) await guardarRefri({ seAcabo });
    const platillos = new Map((await store.all('platillos')).map((p) => [p.id, p]));
    const existentes = (await store.all('historial')).filter((h) => h.fecha === fecha && h.comida === comida);
    for (const h of existentes) await store.del('historial', h.id);
    for (const pl of s.platos) {
      const h = { id: uid(), fecha, comida, platilloId: pl.platilloId, nombre: platillos.get(pl.platilloId)?.nombre || pl.nombre, para: pl.para, invitados: s.invitados || 0 };
      await store.put('historial', h.id, h);
    }
    s.hecho = true;
    s.estado = 'cocinar';
    await store.put('plan', s.id, s);
    return verDia();
  }

  async function desmarcarHecho({ fecha, comida }) {
    validarFecha(fecha); validarComida(comida);
    const s = await obtenerSlot(fecha, comida);
    for (const h of (await store.all('historial')).filter((x) => x.fecha === fecha && x.comida === comida)) await store.del('historial', h.id);
    s.hecho = false;
    if (!estaVacio(s) || s.invitados || s.nota) await store.put('plan', s.id, s);
    else await store.del('plan', s.id);
    return (await obtenerSemana(fecha)).dias.find((d) => d.fecha === fecha);
  }

  async function listarHistorial({ desde, hasta = hoyISO(), platillo } = {}) {
    if (desde !== undefined) validarFecha(desde);
    validarFecha(hasta);
    const [historial, platillos] = await Promise.all([store.all('historial'), store.all('platillos')]);
    const pid = platillo ? (await resolverPlatillo(platillo)).id : null;
    const porId = new Map(platillos.map((p) => [p.id, p.nombre]));
    return historial
      .filter((h) => (!desde || h.fecha >= desde) && h.fecha <= hasta && (!pid || h.platilloId === pid))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || COMIDAS.indexOf(a.comida) - COMIDAS.indexOf(b.comida))
      .map((h) => ({ ...h, dia: nombreDia(h.fecha), platillo: h.nombre || porId.get(h.platilloId) || '(eliminado)' }));
  }

  // ---- refri ----
  async function listarRefri() {
    const [platillos, refri] = await Promise.all([store.all('platillos'), store.all('refri')]);
    const inventario = mapaRefri(refri);
    const items = new Map();
    for (const p of platillos.filter((p) => !p.archivado)) for (const i of porIngrediente([...(p.ingredientes || []), ...(p.guarniciones || [])])) {
      const id = idIngrediente(i);
      const anterior = items.get(id);
      items.set(id, { nombre: anterior?.nombre || i, usos: (anterior?.usos || 0) + 1 });
    }
    for (const r of inventario.values()) {
      if (!items.has(r.id)) items.set(r.id, { nombre: r.nombre, usos: 0 });
    }
    return [...items].map(([id, item]) => {
      const estado = inventario.get(id)?.estado || 'revisar';
      return { ...item, id, seccion: seccionDe(item.nombre), estado, tengo: estado === 'tengo', alias: aliasPorId.get(id) || [] };
    }).sort((a, b) => b.usos - a.usos || a.nombre.localeCompare(b.nombre, 'es'));
  }

  async function actualizarRefri(cambios = {}) {
    await guardarRefri(cambios);
    return (await listarRefri()).filter((r) => r.tengo).map((r) => r.nombre);
  }

  async function guardarRefri({ tengo = [], seAcabo = [], porRevisar = [] }) {
    const cambios = new Map();
    for (const [nombres, estado] of [[tengo, 'tengo'], [seAcabo, 'falta'], [porRevisar, 'revisar']]) {
      for (const n of listaTexto(nombres)) {
        const id = idIngrediente(n);
        if (id.length > 120) throw new ErrorUsuario('El nombre del ingrediente es demasiado largo.');
        cambios.set(id, { id, nombre: nombreIngrediente(n.toLowerCase()), estado, tengo: estado === 'tengo' });
      }
    }
    for (const [id, item] of cambios) await store.put('refri', id, item);
  }

  async function queHagoConLoQueTengo({ comida = 'comida', cantidad = 5 } = {}) {
    validarComida(comida);
    const ctx = await contexto();
    return ctx.platillos
      .filter((p) => !p.archivado && (p.tipos || []).includes(comida) && (p.ingredientes || []).length)
      .map((p) => {
        const st = estadisticas(p, ctx);
        return { platillo: p.nombre, id: p.id, tienes: st.tienes, total: st.ingredientes.length, faltan: st.faltan, porRevisar: st.porRevisar, puntaje: st.puntaje };
      })
      .filter((x) => x.tienes > 0)
      .sort((a, b) => (b.tienes / b.total) - (a.tienes / a.total) || (b.puntaje || 0) - (a.puntaje || 0))
      .slice(0, Math.max(1, Math.min(Number(cantidad) || 5, 20)));
  }

  // ---- lista del súper ----
  async function obtenerCompras(fecha) {
    validarFecha(fecha);
    const id = inicioSemana(fecha);
    const doc = (await store.get('compras', id)) || { id, marcados: [], extras: [] };
    const extras = new Map();
    for (const ex of doc.extras) {
      const clave = idIngrediente(ex.nombre || ex.id);
      extras.set(clave, {
        ...ex, id: clave, nombre: nombreIngrediente(ex.nombre || ex.id),
        seccion: Object.hasOwn(SECCIONES, ex.seccion) ? ex.seccion : 'super',
        marcado: Boolean(ex.marcado || extras.get(clave)?.marcado),
        alimento: Boolean(ex.alimento || extras.get(clave)?.alimento),
      });
    }
    return { id, marcados: [...new Set(doc.marcados.map(idIngrediente))], extras: [...extras.values()], alimentosMarcados: doc.alimentosMarcados || [] };
  }

  async function listaCompras({ fecha = hoyISO(), incluirLoQueTengo = false } = {}) {
    validarFecha(fecha);
    const [semana, platillos, refri, doc] = await Promise.all([obtenerSemana(fecha), store.all('platillos'), store.all('refri'), obtenerCompras(fecha)]);
    const porId = new Map(platillos.map((p) => [p.id, p]));
    const inventario = mapaRefri(refri);
    const alimentos = new Set([...inventario.keys(), ...platillos.flatMap((p) => [...(p.ingredientes || []), ...(p.guarniciones || [])]).map(idIngrediente)]);
    const marcados = new Set(doc.marcados);
    const items = new Map();
    for (const d of semana.dias) {
      if (d.fecha < semana.hoy) continue;
      for (const s of Object.values(d.comidas)) {
        if (!s || s.estado !== 'cocinar' || s.hecho) continue;
        for (const pl of s.platos) {
          const p = porId.get(pl.platilloId);
          for (const ing of porIngrediente([...(p?.ingredientes || []), ...(pl.guarniciones || [])])) {
            const id = idIngrediente(ing);
            const estadoCasa = inventario.get(id)?.estado || 'revisar';
            if (!incluirLoQueTengo && estadoCasa === 'tengo') continue;
            if (!items.has(id)) items.set(id, { id, nombre: ing, seccion: seccionDe(ing), para: [], marcado: marcados.has(id), alimento: true, estadoCasa });
            const it = items.get(id);
            if (!it.para.includes(pl.nombre)) it.para.push(pl.nombre);
          }
        }
      }
    }
    // Una compra ya realizada sigue disponible aunque cambie el plan.
    for (const item of doc.alimentosMarcados) {
      if (items.has(item.id) || (!incluirLoQueTengo && inventario.get(item.id)?.estado === 'tengo')) continue;
      items.set(item.id, { ...item, marcado: true, alimento: true });
    }
    for (const ex of doc.extras) {
      const it = items.get(ex.id);
      items.set(ex.id, {
        ...it,
        ...ex,
        extra: true,
        marcado: Boolean(it?.marcado || ex.marcado || marcados.has(ex.id)),
        alimento: Boolean(it?.alimento || ex.alimento || alimentos.has(ex.id)),
      });
    }
    const secciones = Object.fromEntries(Object.keys(SECCIONES).map((k) => [k, []]));
    for (const it of items.values()) secciones[it.seccion].push(it);
    for (const k of Object.keys(secciones)) secciones[k].sort((a, b) => a.marcado - b.marcado
      || Number(!a.extra && a.estadoCasa === 'revisar') - Number(!b.extra && b.estadoCasa === 'revisar')
      || a.nombre.localeCompare(b.nombre, 'es'));
    return { semana: semana.inicio, secciones, nombresSecciones: SECCIONES };
  }

  async function marcarCompra({ fecha = hoyISO(), nombre, marcado = true }) {
    const doc = await obtenerCompras(fecha);
    const id = idIngrediente(nombre);
    if (!id) throw new ErrorUsuario('Indica qué compraste.');
    if (typeof marcado !== 'boolean') throw new ErrorUsuario('Indica si el artículo está comprado.');
    const extra = doc.extras.find((e) => e.id === id);
    if (extra) extra.marcado = marcado;
    const anteriores = doc.alimentosMarcados;
    doc.alimentosMarcados = anteriores.filter((x) => x.id !== id);
    if (marcado && !extra) {
      const { secciones } = await listaCompras({ fecha, incluirLoQueTengo: true });
      const item = Object.values(secciones).flat().find((i) => i.id === id && i.alimento);
      if (item) doc.alimentosMarcados.push({ id, nombre: item.nombre, seccion: item.seccion });
    }
    doc.marcados = doc.marcados.filter((x) => x !== id);
    if (marcado) doc.marcados.push(id);
    await store.put('compras', doc.id, doc);
    return listaCompras({ fecha });
  }

  async function agregarCompra({ fecha = hoyISO(), nombre, seccion, alimento = false }) {
    const nombres = listaTexto(nombre);
    if (!nombres.length) throw new ErrorUsuario('¿Qué quieres agregar a la lista?');
    const doc = await obtenerCompras(fecha);
    for (const n of nombres) {
      const id = idIngrediente(n);
      if (id.length > 120) throw new ErrorUsuario('El nombre del artículo es demasiado largo.');
      const existente = doc.extras.find((e) => e.id === id);
      if (existente) {
        if (alimento === true) existente.alimento = true;
      } else {
        doc.extras.push({ id, nombre: nombreIngrediente(n), seccion: Object.hasOwn(SECCIONES, seccion) ? seccion : seccionDe(n), marcado: false, alimento: alimento === true });
      }
    }
    await store.put('compras', doc.id, doc);
    return listaCompras({ fecha });
  }

  async function quitarCompra({ fecha = hoyISO(), nombre }) {
    const doc = await obtenerCompras(fecha);
    const id = idIngrediente(nombre);
    doc.extras = doc.extras.filter((e) => e.id !== id);
    await store.put('compras', doc.id, doc);
    return listaCompras({ fecha });
  }

  async function pasarComprasAlRefri({ fecha = hoyISO() } = {}) {
    const { secciones } = await listaCompras({ fecha, incluirLoQueTengo: true });
    const alimentos = Object.values(secciones).flat().filter((i) => i.alimento && i.marcado);
    if (alimentos.length) {
      const doc = await obtenerCompras(fecha);
      const ids = new Set(alimentos.map((i) => i.id));
      await guardarRefri({ tengo: alimentos.map((i) => i.nombre) });
      doc.marcados = doc.marcados.filter((id) => !ids.has(id));
      doc.extras = doc.extras.filter((ex) => !ids.has(ex.id));
      doc.alimentosMarcados = doc.alimentosMarcados.filter((i) => !ids.has(i.id));
      await store.put('compras', doc.id, doc);
    }
    return { agregados: alimentos.map((i) => i.nombre), compras: await listaCompras({ fecha }) };
  }

  const mutar = (fn) => store.atomic
    ? (...args) => store.atomic((tx) => crearCocina(tx)[fn.name](...args))
    : fn;

  return {
    obtenerConfig, guardarConfig: mutar(guardarConfig),
    listarPersonas, guardarPersona: mutar(guardarPersona),
    listarPlatillos, obtenerPlatillo, usosFuturos,
    crearPlatillo: mutar(crearPlatillo), editarPlatillo: mutar(editarPlatillo), archivarPlatillo: mutar(archivarPlatillo), calificar: mutar(calificar),
    obtenerSemana, sugerir, listarHistorial,
    asignar: mutar(asignar), armarSemana: mutar(armarSemana), marcarHecho: mutar(marcarHecho), desmarcarHecho: mutar(desmarcarHecho),
    listarRefri, actualizarRefri: mutar(actualizarRefri), queHagoConLoQueTengo,
    listaCompras, agregarCompra: mutar(agregarCompra), marcarCompra: mutar(marcarCompra), quitarCompra: mutar(quitarCompra), pasarComprasAlRefri: mutar(pasarComprasAlRefri),
  };
}
