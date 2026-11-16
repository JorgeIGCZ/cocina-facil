// Lógica de "Mi Cocina": platillos, calificaciones, plan semanal, sugerencias,
// refri, lista del súper e historial. La usan la API REST y el conector MCP.
import { randomUUID } from 'node:crypto';

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
const uid = () => randomUUID().slice(0, 8);

export function hoyISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}
const aFecha = (iso) => new Date(`${iso}T12:00:00Z`);
const aISO = (d) => d.toISOString().slice(0, 10);
export function sumarDias(iso, n) { const d = aFecha(iso); d.setUTCDate(d.getUTCDate() + n); return aISO(d); }
export function diasEntre(a, b) { return Math.round((aFecha(b) - aFecha(a)) / 86400000); }
export function inicioSemana(iso = hoyISO()) { const d = aFecha(iso); const dow = d.getUTCDay(); return sumarDias(iso, dow === 0 ? -6 : 1 - dow); }
export const nombreDia = (iso) => DIAS[aFecha(iso).getUTCDay()];
const validarFecha = (f) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(f || '')) throw new ErrorUsuario(`Fecha inválida: "${f}". Usa AAAA-MM-DD.`); return f; };
const validarComida = (c) => { if (!COMIDAS.includes(c)) throw new ErrorUsuario(`Comida inválida: "${c}". Usa desayuno, comida o cena.`); return c; };

export function seccionDe(ingrediente) {
  // Coincidencia al inicio de palabra ("res" no debe coincidir con "fresco")
  const n = ` ${normalizar(ingrediente).replace(/[()]/g, ' ')}`;
  if (CARNICERIA.some((k) => n.includes(` ${k}`))) return 'carniceria';
  if (VERDURA.some((k) => n.includes(` ${k}`))) return 'verdura';
  return 'super';
}

export class ErrorUsuario extends Error { constructor(m, status = 400) { super(m); this.status = status; } }

const listaTexto = (v) => (Array.isArray(v) ? v : String(v ?? '').split(','))
  .map((x) => String(x).trim()).filter(Boolean);

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
    if (patch.diasCocina) nuevo.diasCocina = patch.diasCocina.map(Number).filter((d) => d >= 0 && d <= 6);
    if (patch.comidasActivas) nuevo.comidasActivas = patch.comidasActivas.filter((c) => COMIDAS.includes(c));
    await store.put('config', 'general', nuevo);
    return nuevo;
  }

  // ---- personas ----
  async function listarPersonas({ incluirInactivas = false } = {}) {
    const ps = (await store.all('personas')).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
    return incluirInactivas ? ps : ps.filter((p) => p.activo !== false);
  }
  async function resolverPersona(ref) {
    const ps = await listarPersonas({ incluirInactivas: true });
    const n = normalizar(ref);
    const p = ps.find((x) => x.id === ref) || ps.find((x) => normalizar(x.nombre) === n) || ps.find((x) => normalizar(x.nombre).startsWith(n));
    if (!p) throw new ErrorUsuario(`No encontré a la persona "${ref}". Personas: ${ps.map((x) => x.nombre).join(', ')}`);
    return p;
  }
  async function guardarPersona(datos) {
    const existente = datos.id ? await store.get('personas', datos.id) : null;
    if (!existente && !datos.nombre) throw new ErrorUsuario('La persona necesita un nombre.');
    const todas = await listarPersonas({ incluirInactivas: true });
    const p = {
      id: existente?.id || uid(),
      nombre: datos.nombre ?? existente?.nombre,
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
    const tengo = new Set(refri.filter((r) => r.tengo).map((r) => r.id));
    return { platillos, historial, personas, tengo };
  }

  function estadisticas(p, { historial, personas, tengo }, hoy = hoyISO()) {
    const hechos = historial.filter((h) => h.platilloId === p.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const ultimaVez = hechos[0]?.fecha || null;
    const califs = personas
      .map((per) => ({ persona: per, estrellas: p.calificaciones?.[per.id] }))
      .filter((c) => c.estrellas);
    const puntaje = califs.length ? califs.reduce((s, c) => s + c.estrellas, 0) / califs.length : null;
    const ninos = califs.filter((c) => c.persona.rol === 'nino');
    const puntajeNinos = ninos.length ? ninos.reduce((s, c) => s + c.estrellas, 0) / ninos.length : null;
    const ingr = p.ingredientes || [];
    const tieneIngr = ingr.filter((i) => tengo.has(normalizar(i)));
    return {
      veces: (p.vecesPrevias || 0) + hechos.length,
      vecesUltimos30: hechos.filter((h) => diasEntre(h.fecha, hoy) <= 30).length,
      ultimaVez,
      diasDesde: ultimaVez ? diasEntre(ultimaVez, hoy) : null,
      puntaje: puntaje == null ? null : Math.round(puntaje * 10) / 10,
      puntajeNinos: puntajeNinos == null ? null : Math.round(puntajeNinos * 10) / 10,
      tienes: tieneIngr.length,
      faltan: ingr.filter((i) => !tengo.has(normalizar(i))),
    };
  }

  function conStats(p, ctx) {
    const nombres = Object.fromEntries(ctx.personas.map((x) => [x.id, x.nombre]));
    const calificacionesPorNombre = Object.fromEntries(
      Object.entries(p.calificaciones || {}).filter(([id]) => nombres[id]).map(([id, v]) => [nombres[id], v]),
    );
    return { ...p, calificacionesPorNombre, stats: estadisticas(p, ctx) };
  }

  async function listarPlatillos({ texto, tipo, categoria } = {}) {
    const ctx = await contexto();
    const t = normalizar(texto);
    return ctx.platillos
      .filter((p) => !tipo || (p.tipos || []).includes(tipo))
      .filter((p) => !categoria || normalizar(p.categoria) === normalizar(categoria))
      .filter((p) => !t || normalizar(p.nombre).includes(t) || (p.ingredientes || []).some((i) => normalizar(i).includes(t)))
      .map((p) => conStats(p, ctx))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  async function resolverPlatillo(ref) {
    if (!ref) throw new ErrorUsuario('Falta indicar el platillo.');
    const directo = await store.get('platillos', ref);
    if (directo) return directo;
    const todos = await store.all('platillos');
    const n = normalizar(ref);
    const p = todos.find((x) => normalizar(x.nombre) === n)
      || todos.find((x) => normalizar(x.nombre).startsWith(n))
      || todos.find((x) => normalizar(x.nombre).includes(n));
    if (!p) throw new ErrorUsuario(`No encontré el platillo "${ref}".`, 404);
    return p;
  }

  async function obtenerPlatillo(ref) {
    const p = await resolverPlatillo(ref);
    return conStats(p, await contexto());
  }

  function limpiarPlatillo(datos, base = {}) {
    const p = { ...base };
    if (datos.nombre !== undefined) p.nombre = String(datos.nombre).trim();
    if (datos.tipos !== undefined) p.tipos = listaTexto(datos.tipos).filter((t) => COMIDAS.includes(t));
    if (datos.categoria !== undefined) p.categoria = normalizar(datos.categoria) || 'sin carne';
    if (datos.tiempo !== undefined) p.tiempo = TIEMPOS[datos.tiempo] ? datos.tiempo : 'medio';
    if (datos.ingredientes !== undefined) p.ingredientes = [...new Set(listaTexto(datos.ingredientes).map((i) => i.toLowerCase()))];
    if (datos.guarniciones !== undefined) p.guarniciones = listaTexto(datos.guarniciones);
    if (datos.etiquetas !== undefined) p.etiquetas = listaTexto(datos.etiquetas).map(normalizar);
    if (datos.notas !== undefined) p.notas = String(datos.notas);
    return p;
  }

  async function crearPlatillo(datos) {
    if (!datos?.nombre) throw new ErrorUsuario('El platillo necesita un nombre.');
    const todos = await store.all('platillos');
    if (todos.some((x) => normalizar(x.nombre) === normalizar(datos.nombre))) {
      throw new ErrorUsuario(`Ya existe un platillo llamado "${datos.nombre}".`, 409);
    }
    const p = limpiarPlatillo(
      { tipos: ['comida', 'cena'], categoria: 'sin carne', tiempo: 'medio', ingredientes: [], guarniciones: [], etiquetas: [], notas: '', ...datos },
      { id: uid(), calificaciones: {}, vecesPrevias: Number(datos.vecesPrevias) || 0, creado: hoyISO() },
    );
    await store.put('platillos', p.id, p);
    return obtenerPlatillo(p.id);
  }

  async function editarPlatillo(ref, cambios) {
    const actual = await resolverPlatillo(ref);
    const p = limpiarPlatillo(cambios, actual);
    if (!p.nombre) throw new ErrorUsuario('El nombre no puede quedar vacío.');
    await store.put('platillos', p.id, p);
    return obtenerPlatillo(p.id);
  }

  async function eliminarPlatillo(ref) {
    const p = await resolverPlatillo(ref);
    await store.del('platillos', p.id);
    return { eliminado: p.nombre };
  }

  async function calificar(ref, estrellasPorPersona) {
    const p = await resolverPlatillo(ref);
    p.calificaciones ||= {};
    for (const [quien, valor] of Object.entries(estrellasPorPersona || {})) {
      const per = await resolverPersona(quien);
      const n = Math.round(Number(valor));
      if (!n) delete p.calificaciones[per.id];
      else if (n < 1 || n > 5) throw new ErrorUsuario('Las estrellas van de 1 a 5.');
      else p.calificaciones[per.id] = n;
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

  async function obtenerSemana(fecha = hoyISO()) {
    validarFecha(fecha);
    const inicio = inicioSemana(fecha);
    const config = await obtenerConfig();
    const ctx = await contexto();
    const porId = Object.fromEntries(ctx.platillos.map((p) => [p.id, p]));
    const personasPorId = Object.fromEntries(ctx.personas.map((p) => [p.id, p]));
    const plan = (await store.all('plan')).filter((s) => s.fecha >= inicio && s.fecha <= sumarDias(inicio, 6));
    const dias = [];
    for (let i = 0; i < 7; i++) {
      const f = sumarDias(inicio, i);
      const dow = aFecha(f).getUTCDay();
      const comidas = {};
      for (const c of config.comidasActivas) {
        const s = plan.find((x) => x.fecha === f && x.comida === c);
        comidas[c] = s ? {
          ...s,
          etiqueta: s.estado ? ESTADOS[s.estado] : null,
          platos: s.platos.map((pl) => ({
            ...pl,
            nombre: porId[pl.platilloId]?.nombre || '(platillo eliminado)',
            paraNombres: pl.para?.length ? pl.para.map((id) => personasPorId[id]?.nombre).filter(Boolean) : ['Todos'],
          })),
        } : null;
      }
      dias.push({ fecha: f, dia: nombreDia(f), cocina: config.diasCocina.includes(dow), esHoy: f === hoyISO(), comidas });
    }
    return { inicio, fin: sumarDias(inicio, 6), comidasActivas: config.comidasActivas, dias };
  }

  async function resolverPara(para) {
    if (!para || (Array.isArray(para) && !para.length)) return null;
    const lista = listaTexto(para);
    if (lista.some((x) => ['todos', 'todas', 'familia'].includes(normalizar(x)))) return null;
    const personas = await listarPersonas();
    const ids = new Set();
    for (const ref of lista) {
      const n = normalizar(ref);
      if (['ninos', 'niños', 'los ninos', 'hijos', 'kids'].includes(n)) personas.filter((p) => p.rol === 'nino').forEach((p) => ids.add(p.id));
      else if (['adultos', 'papas', 'nosotros'].includes(n)) personas.filter((p) => p.rol !== 'nino').forEach((p) => ids.add(p.id));
      else ids.add((await resolverPersona(ref)).id);
    }
    return ids.size === personas.length ? null : [...ids];
  }

  /**
   * Cambia un espacio del plan.
   * - estado: cocinar | comprado | fuera | suegros | sobras | nada | null (vaciar)
   * - platillo + para + guarniciones + modo ("reemplazar" | "agregar")
   * - invitados, nota
   */
  async function asignar({ fecha, comida, estado, platillo, para, guarniciones, modo = 'reemplazar', invitados, nota, quitarPlato }) {
    validarFecha(fecha); validarComida(comida);
    const s = await obtenerSlot(fecha, comida);
    if (estado !== undefined) {
      if (estado !== null && !ESTADOS[estado]) throw new ErrorUsuario(`Estado inválido. Opciones: ${Object.keys(ESTADOS).join(', ')}`);
      s.estado = estado;
      if (estado === null) { s.platos = []; s.hecho = false; }
      else if (estado !== 'cocinar') s.platos = [];
    }
    if (quitarPlato !== undefined) s.platos.splice(Number(quitarPlato), 1);
    if (platillo) {
      const p = await resolverPlatillo(platillo);
      const plato = { platilloId: p.id, para: await resolverPara(para), guarniciones: guarniciones !== undefined ? listaTexto(guarniciones) : (p.guarniciones || []).slice(0, 2) };
      if (modo === 'agregar') {
        // Si el nuevo es para algunos, lo que ya estaba queda para los demás
        if (plato.para) {
          const resto = (await listarPersonas()).map((x) => x.id).filter((id) => !plato.para.includes(id));
          for (const otro of s.platos) if (!otro.para && resto.length) otro.para = resto;
        }
        s.platos.push(plato);
      }
      else s.platos = [plato];
      s.estado = 'cocinar';
    }
    if (invitados !== undefined) s.invitados = Math.max(0, Number(invitados) || 0);
    if (nota !== undefined) s.nota = String(nota);
    if (!s.estado && !s.platos.length && !s.invitados && !s.nota) await store.del('plan', s.id);
    else await store.put('plan', s.id, s);
    return (await obtenerSemana(fecha)).dias.find((d) => d.fecha === fecha);
  }

  // ---- sugerencias ----
  async function sugerir({ fecha = hoyISO(), comida = 'comida', cantidad = 3, rapido = false, categoria, excluir = [], para, usarRefri = true, aleatorio = true } = {}) {
    validarFecha(fecha); validarComida(comida);
    const ctx = await contexto();
    const ids = await resolverPara(para);
    const comensales = ids ? ctx.personas.filter((p) => ids.includes(p.id)) : ctx.personas;
    const slot = await obtenerSlot(fecha, comida);
    const invitados = slot.invitados || 0;

    // Lo planeado esta semana y los días vecinos (para variar)
    const ini = inicioSemana(fecha);
    const plan = (await store.all('plan')).filter((s) => s.fecha >= sumarDias(ini, -1) && s.fecha <= sumarDias(ini, 7));
    const enSemana = new Set(plan.filter((s) => !(s.fecha === fecha && s.comida === comida)).flatMap((s) => s.platos.map((p) => p.platilloId)));
    const catVecinas = new Set(plan
      .filter((s) => Math.abs(diasEntre(s.fecha, fecha)) === 1 && s.comida === comida)
      .flatMap((s) => s.platos.map((p) => ctx.platillos.find((x) => x.id === p.platilloId)?.categoria)).filter(Boolean));
    const excl = new Set(listaTexto(excluir).map(normalizar));

    const candidatos = ctx.platillos
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
      if (usarRefri && (p.ingredientes || []).length) {
        const frac = st.tienes / p.ingredientes.length;
        puntos += frac * 20;
        if (st.tienes) razones.push(`tienes ${st.tienes} de ${p.ingredientes.length} ingredientes`);
      }
      // Invitados
      if (invitados > 0 && (p.etiquetas || []).includes('invitados')) { puntos += 15; razones.push('bueno para invitados'); }
      // Niños
      const hayNinos = comensales.some((c) => c.rol === 'nino');
      if (hayNinos && (p.etiquetas || []).includes('adultos')) { puntos -= 20; razones.push('es más de adultos'); }
      if (aleatorio) puntos += Math.random() * 10;
      return { platillo: { id: p.id, nombre: p.nombre, categoria: p.categoria, tiempo: p.tiempo, guarniciones: p.guarniciones || [] }, puntos: Math.round(puntos), razones, faltan: st.faltan, puntajeNinos: st.puntajeNinos };
    }).sort((a, b) => b.puntos - a.puntos);

    return resultado.slice(0, Math.max(1, Math.min(Number(cantidad) || 3, 20)));
  }

  async function armarSemana({ fecha = hoyISO(), reemplazar = false } = {}) {
    validarFecha(fecha);
    const config = await obtenerConfig();
    const ini = inicioSemana(fecha);
    const hoy = hoyISO();
    const llenados = [];
    for (let i = 0; i < 7; i++) {
      const f = sumarDias(ini, i);
      if (f < hoy) continue; // no cambiar días pasados
      if (!config.diasCocina.includes(aFecha(f).getUTCDay())) continue;
      for (const c of config.comidasActivas) {
        const s = await obtenerSlot(f, c);
        if (s.hecho) continue;
        if (!reemplazar && (s.estado || s.platos.length)) continue;
        const [mejor] = await sugerir({ fecha: f, comida: c, cantidad: 1 });
        if (!mejor) continue;
        await asignar({ fecha: f, comida: c, platillo: mejor.platillo.id });
        llenados.push({ fecha: f, dia: nombreDia(f), comida: c, platillo: mejor.platillo.nombre });
      }
    }
    return { llenados, semana: await obtenerSemana(fecha) };
  }

  // ---- marcar hecho + historial ----
  async function marcarHecho({ fecha, comida, calificaciones, seAcabo }) {
    validarFecha(fecha); validarComida(comida);
    const s = await obtenerSlot(fecha, comida);
    if (!s.platos.length) throw new ErrorUsuario('Ese espacio no tiene platillos para marcar como hecho.');
    const existentes = (await store.all('historial')).filter((h) => h.fecha === fecha && h.comida === comida);
    for (const h of existentes) await store.del('historial', h.id);
    for (const pl of s.platos) {
      const h = { id: uid(), fecha, comida, platilloId: pl.platilloId, para: pl.para, invitados: s.invitados || 0 };
      await store.put('historial', h.id, h);
    }
    s.hecho = true;
    s.estado = 'cocinar';
    await store.put('plan', s.id, s);
    for (const [ref, porPersona] of Object.entries(calificaciones || {})) await calificar(ref, porPersona);
    if (seAcabo?.length) await actualizarRefri({ seAcabo });
    return (await obtenerSemana(fecha)).dias.find((d) => d.fecha === fecha);
  }

  async function desmarcarHecho({ fecha, comida }) {
    const s = await obtenerSlot(fecha, comida);
    for (const h of (await store.all('historial')).filter((x) => x.fecha === fecha && x.comida === comida)) await store.del('historial', h.id);
    s.hecho = false;
    await store.put('plan', s.id, s);
    return (await obtenerSemana(fecha)).dias.find((d) => d.fecha === fecha);
  }

  async function listarHistorial({ desde, hasta, platillo } = {}) {
    const ctx = await contexto();
    const pid = platillo ? (await resolverPlatillo(platillo)).id : null;
    const porId = Object.fromEntries(ctx.platillos.map((p) => [p.id, p.nombre]));
    return ctx.historial
      .filter((h) => (!desde || h.fecha >= desde) && (!hasta || h.fecha <= hasta) && (!pid || h.platilloId === pid))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || COMIDAS.indexOf(a.comida) - COMIDAS.indexOf(b.comida))
      .map((h) => ({ ...h, dia: nombreDia(h.fecha), platillo: porId[h.platilloId] || '(eliminado)' }));
  }

  // ---- refri ----
  async function listarRefri() {
    const [platillos, refri] = await Promise.all([store.all('platillos'), store.all('refri')]);
    const items = new Map();
    for (const p of platillos) for (const i of p.ingredientes || []) {
      const id = normalizar(i);
      if (!items.has(id)) items.set(id, { id, nombre: i, seccion: seccionDe(i), tengo: false, usos: 0 });
      items.get(id).usos++;
    }
    for (const r of refri) {
      if (!items.has(r.id)) items.set(r.id, { id: r.id, nombre: r.nombre, seccion: seccionDe(r.nombre), tengo: false, usos: 0 });
      items.get(r.id).tengo = !!r.tengo;
    }
    return [...items.values()].sort((a, b) => b.usos - a.usos || a.nombre.localeCompare(b.nombre, 'es'));
  }

  async function actualizarRefri({ tengo = [], seAcabo = [] } = {}) {
    for (const n of listaTexto(tengo)) await store.put('refri', normalizar(n), { id: normalizar(n), nombre: n.toLowerCase(), tengo: true });
    for (const n of listaTexto(seAcabo)) {
      const id = normalizar(n);
      const r = await store.get('refri', id);
      await store.put('refri', id, { id, nombre: r?.nombre || n.toLowerCase(), tengo: false });
    }
    return (await listarRefri()).filter((r) => r.tengo).map((r) => r.nombre);
  }

  async function queHagoConLoQueTengo({ comida = 'comida', cantidad = 5 } = {}) {
    const ctx = await contexto();
    return ctx.platillos
      .filter((p) => (p.tipos || []).includes(comida) && (p.ingredientes || []).length)
      .map((p) => {
        const st = estadisticas(p, ctx);
        return { platillo: p.nombre, id: p.id, tienes: st.tienes, total: p.ingredientes.length, faltan: st.faltan, puntaje: st.puntaje };
      })
      .filter((x) => x.tienes > 0)
      .sort((a, b) => (b.tienes / b.total) - (a.tienes / a.total) || (b.puntaje || 0) - (a.puntaje || 0))
      .slice(0, cantidad);
  }

  // ---- lista del súper ----
  async function listaCompras({ fecha = hoyISO(), incluirLoQueTengo = false } = {}) {
    const ini = inicioSemana(fecha);
    const semana = await obtenerSemana(fecha);
    const ctx = await contexto();
    const porId = Object.fromEntries(ctx.platillos.map((p) => [p.id, p]));
    const doc = (await store.get('compras', ini)) || { id: ini, marcados: [], extras: [] };
    const marcados = new Set(doc.marcados);
    const hoy = hoyISO();
    const items = new Map();
    for (const d of semana.dias) {
      if (d.fecha < hoy) continue;
      for (const s of Object.values(d.comidas)) {
        if (!s || s.estado !== 'cocinar' || s.hecho) continue;
        for (const pl of s.platos) {
          const p = porId[pl.platilloId];
          if (!p) continue;
          for (const ing of p.ingredientes || []) {
            const id = normalizar(ing);
            if (!incluirLoQueTengo && ctx.tengo.has(id)) continue;
            if (!items.has(id)) items.set(id, { id, nombre: ing, seccion: seccionDe(ing), para: [], marcado: marcados.has(id) });
            const it = items.get(id);
            if (!it.para.includes(p.nombre)) it.para.push(p.nombre);
          }
        }
      }
    }
    const secciones = Object.fromEntries(Object.keys(SECCIONES).map((k) => [k, []]));
    for (const it of items.values()) secciones[it.seccion].push(it);
    for (const ex of doc.extras) secciones[ex.seccion in secciones ? ex.seccion : 'super'].push({ ...ex, extra: true });
    for (const k of Object.keys(secciones)) secciones[k].sort((a, b) => a.marcado - b.marcado || a.nombre.localeCompare(b.nombre, 'es'));
    return { semana: ini, secciones, nombresSecciones: SECCIONES };
  }

  async function marcarCompra({ fecha = hoyISO(), nombre, marcado = true }) {
    const ini = inicioSemana(fecha);
    const doc = (await store.get('compras', ini)) || { id: ini, marcados: [], extras: [] };
    const id = normalizar(nombre);
    const extra = doc.extras.find((e) => e.id === id);
    if (extra) extra.marcado = !!marcado;
    else {
      doc.marcados = doc.marcados.filter((x) => x !== id);
      if (marcado) doc.marcados.push(id);
    }
    await store.put('compras', ini, doc);
    return listaCompras({ fecha });
  }

  async function agregarCompra({ fecha = hoyISO(), nombre, seccion }) {
    if (!nombre) throw new ErrorUsuario('¿Qué quieres agregar a la lista?');
    const ini = inicioSemana(fecha);
    const doc = (await store.get('compras', ini)) || { id: ini, marcados: [], extras: [] };
    for (const n of listaTexto(nombre)) {
      const id = normalizar(n);
      if (!doc.extras.some((e) => e.id === id)) doc.extras.push({ id, nombre: n, seccion: SECCIONES[seccion] ? seccion : seccionDe(n), marcado: false });
    }
    await store.put('compras', ini, doc);
    return listaCompras({ fecha });
  }

  async function quitarCompra({ fecha = hoyISO(), nombre }) {
    const ini = inicioSemana(fecha);
    const doc = (await store.get('compras', ini)) || { id: ini, marcados: [], extras: [] };
    doc.extras = doc.extras.filter((e) => e.id !== normalizar(nombre));
    await store.put('compras', ini, doc);
    return listaCompras({ fecha });
  }

  return {
    obtenerConfig, guardarConfig,
    listarPersonas, guardarPersona,
    listarPlatillos, obtenerPlatillo, crearPlatillo, editarPlatillo, eliminarPlatillo, calificar,
    obtenerSemana, asignar, sugerir, armarSemana, marcarHecho, desmarcarHecho, listarHistorial,
    listarRefri, actualizarRefri, queHagoConLoQueTengo,
    listaCompras, marcarCompra, agregarCompra, quitarCompra,
  };
}
