// Mi Cocina — webapp móvil (sin dependencias)
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

const COMIDA_ICONO = { desayuno: '☀️', comida: '🍲', cena: '🌙' };
const COMIDA_NOMBRE = { desayuno: 'Desayuno', comida: 'Comida', cena: 'Cena' };
const ESTADOS = [
  ['comprado', '🛍️', 'Compro hecho'],
  ['fuera', '🍽️', 'Comemos fuera'],
  ['suegros', '👵', 'Con los suegros'],
  ['sobras', '♻️', 'Lo que quedó'],
  ['nada', '❌', 'No aplica'],
];
const ESTADO_INFO = Object.fromEntries(ESTADOS.map(([k, e, t]) => [k, `${e} ${t}`]));
const CAT_ICONO = { pollo: '🍗', res: '🥩', cerdo: '🐖', pescado: '🐟', 'sin carne': '🥗', antojito: '🌮', caldo: '🍲', pasta: '🍝', desayuno: '🥞' };
const CATEGORIAS = Object.keys(CAT_ICONO);
const TIEMPOS = { rapido: '⚡ Rápido', medio: '⏱️ Medio', largo: '🕰️ Largo' };
const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const estado = {
  clave: lsGet('clave'),
  tab: 'semana',
  fecha: null, // un día de la semana visible
  hoy: null,
  personas: [],
};

// ---------- utilidades ----------
const hoyISO = () => estado.hoy;
const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const diaNum = (iso) => Number(iso.slice(8, 10));
const mesCorto = (iso) => MESES[Number(iso.slice(5, 7)) - 1];
const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function api(metodo, ruta, cuerpo) {
  let r;
  try {
    r = await fetch(`/api${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${estado.clave}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch {
    throw new Error('No pude conectar. Comprueba tu conexión y vuelve a intentarlo.');
  }
  if (r.status === 401) { lsSet('clave', null); estado.clave = null; pintarLogin('La clave no es correcta.'); throw new Error('401'); }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || 'Algo salió mal. Vuelve a intentarlo.');
  return datos;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.textContent = ''; }, 3000);
}

function mostrarError(error) {
  if (!estado.clave) return;
  const feedback = $('#sheet[open] #sheet-feedback');
  if (feedback) {
    feedback.textContent = error.message;
    feedback.scrollIntoView({ block: 'nearest' });
  }
  else toast(error.message);
}

function accion(fn) {
  return async (e) => {
    if (e.type === 'submit') e.preventDefault();
    const control = e.currentTarget;
    if (control.dataset.guardando) return;
    control.dataset.guardando = '1';
    const boton = control instanceof HTMLFormElement ? control.querySelector('button[type="submit"], button:not([type])') : control;
    if (boton) boton.disabled = true;
    const feedback = $('#sheet-feedback');
    if (feedback) feedback.textContent = '';
    try { await fn(e, control); } catch (error) { mostrarError(error); }
    finally {
      delete control.dataset.guardando;
      if (boton) boton.disabled = false;
    }
  };
}

function mostrarReintento(contenedor, fn, error) {
  if (!estado.clave) return;
  contenedor.innerHTML = `<div class="vacio-grande"><p>${esc(error.message)}</p><button class="btn sec">Reintentar</button></div>`;
  contenedor.querySelector('button').addEventListener('click', fn);
}

function abrirSheet(html) {
  const s = $('#sheet');
  s.innerHTML = `${html}<p id="sheet-feedback" role="alert"></p>`;
  s.querySelector('h2').id = 'sheet-titulo';
  const cerrar = s.querySelector('[data-cerrar]');
  cerrar.setAttribute('aria-label', 'Cerrar');
  cerrar.addEventListener('click', cerrarSheet);
  if (!s.open) s.showModal();
  else cerrar.focus();
  s.scrollTop = 0;
  return s;
}
function cerrarSheet() {
  $('#sheet').close();
}

function estrellasHtml(valor, attrs = '') {
  return `<span class="estrellas" ${attrs}>${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-estrella="${n}" class="${n <= (valor || 0) ? 'on' : ''}" aria-label="${n === 1 ? '1 estrella' : `${n} estrellas`}" aria-pressed="${n === valor}">★</button>`).join('')}</span>`;
}
// Delegación: tocar una estrella marca el valor en el contenedor (data-valor)
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-estrella]');
  if (!b) return;
  const cont = b.parentElement;
  const n = Number(b.dataset.estrella);
  const nuevo = Number(cont.dataset.valor) === n ? 0 : n;
  cont.dataset.valor = nuevo;
  cont.querySelectorAll('button').forEach((x) => {
    const estrella = Number(x.dataset.estrella);
    x.classList.toggle('on', estrella <= nuevo);
    x.setAttribute('aria-pressed', String(estrella === nuevo));
  });
});

// ---------- login ----------
function pintarLogin(error) {
  cerrarSheet();
  $('#tabs').hidden = true;
  $('#app').innerHTML = `
    <div class="login"><div class="tarjeta">
      <div style="font-size:3rem">🍳</div>
      <h1>Mi Cocina <span style="color:var(--rosa)">✦</span></h1>
      <p class="sub">Escribe tu clave para entrar</p>
      <form id="f-login">
        <input class="entrada" type="password" name="clave" autocomplete="current-password" placeholder="Clave" aria-label="Clave" required>
        ${error ? `<p style="color:var(--rosa);font-weight:700">${esc(error)}</p>` : ''}
        <button class="btn ancho" style="margin-top:12px">Entrar</button>
      </form>
    </div></div>`;
  $('#f-login').addEventListener('submit', accion(async (e) => {
    estado.clave = new FormData(e.target).get('clave').trim();
    await iniciar();
  }));
}

// ---------- navegación ----------
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) irA(b.dataset.tab);
});
async function irA(tab, semanaInicial) {
  estado.tab = tab;
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.classList.toggle('activo', b.dataset.tab === tab);
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
  try { await ({ semana: vistaSemana, platillos: vistaPlatillos, refri: vistaRefri, super: vistaSuper, mas: vistaMas })[tab](semanaInicial); }
  catch (error) { if (estado.tab === tab) mostrarReintento($('#app'), () => irA(tab), error); }
}

async function iniciar() {
  if (!estado.clave) return pintarLogin();
  let semana;
  try {
    [estado.personas, semana] = await Promise.all([api('GET', '/personas'), api('GET', '/semana')]);
    estado.hoy = semana.hoy;
  } catch (error) { mostrarReintento($('#app'), iniciar, error); return; }
  lsSet('clave', estado.clave);
  $('#tabs').hidden = false;
  return irA(estado.tab, estado.fecha ? undefined : semana);
}

const nombrePersona = (id) => estado.personas.find((p) => p.id === id);

// =====================================================================
// SEMANA
// =====================================================================
let solicitudSemana = 0;
async function vistaSemana(semanaInicial) {
  const solicitud = ++solicitudSemana;
  const app = $('#app');
  if (!app.querySelector('.dia')) app.innerHTML = '<div class="cargando">Cargando…</div>';
  const sem = semanaInicial || await api('GET', estado.fecha ? `/semana?fecha=${estado.fecha}` : '/semana');
  if (estado.tab !== 'semana' || solicitud !== solicitudSemana) return;
  estado.hoy = sem.hoy;
  const hoy = sem.dias.find((d) => d.esHoy);
  const sugerirHoy = hoy?.cocina && sem.comidasActivas.includes('comida') && espacioVacio(hoy.comidas.comida);
  const rango = `${diaNum(sem.inicio)} ${mesCorto(sem.inicio)} – ${diaNum(sem.fin)} ${mesCorto(sem.fin)}`;
  const editables = sem.dias.filter((d) => d.cocina && d.fecha >= sem.hoy).flatMap((d) => Object.values(d.comidas));
  const vacios = editables.some(espacioVacio);
  const puedeRehacer = editables.some((s) => s?.estado === 'cocinar' && s.platos.length === 1 && !s.platos[0].para?.length && !s.hecho);
  app.innerHTML = `
    <div class="cabecera">
      <h1>Mi Cocina <span class="chispa" aria-hidden="true">✦</span></h1>
    </div>
    ${hoy ? `<section aria-labelledby="titulo-hoy">
      <h2 id="titulo-hoy">${hoy.cocina ? '¿Qué cocino hoy?' : 'Hoy es día libre'}</h2>
      ${diaHtml(hoy, sem.comidasActivas, sugerirHoy)}
    </section>` : ''}
    <div class="cabecera">
      <div><h2 style="margin-top:0">Mi semana</h2><p class="sub" style="margin:0">${rango}</p></div>
      <div class="semana-nav">
        <button class="icono" data-sem="-7" aria-label="Semana anterior">‹</button>
        <button class="icono" data-sem="hoy" aria-label="Esta semana" title="Esta semana">•</button>
        <button class="icono" data-sem="7" aria-label="Semana siguiente">›</button>
      </div>
    </div>
    <div class="armar">
      ${vacios ? '<button class="btn rosa" data-accion="armar">✨ Armar mi semana</button>' : puedeRehacer ? '<button class="btn sec" data-accion="rearmar">🔄 Rehacer semana</button>' : ''}
    </div>
    ${sem.dias.filter((d) => !d.esHoy).map((d) => diaHtml(d, sem.comidasActivas)).join('')}`;

  app.querySelectorAll('[data-sem]').forEach((b) => b.addEventListener('click', () => {
    estado.fecha = b.dataset.sem === 'hoy' ? null : sumarDias(estado.fecha || sem.hoy, Number(b.dataset.sem));
    irA('semana');
  }));
  app.querySelector('[data-accion="armar"]')?.addEventListener('click', accion(() => armar(false)));
  app.querySelector('[data-accion="rearmar"]')?.addEventListener('click', accion(async () => {
    if (confirm('¿Rehacer las comidas planeadas de un platillo para todos? Se conservan las comidas hechas, los estados especiales y los platillos para grupos.')) await armar(true);
  }));
  app.querySelectorAll('.slot').forEach((b) => b.addEventListener('click', accion(() => hojaSlot(b.dataset.fecha, b.dataset.comida))));
  if (sugerirHoy) {
    const cont = $('#sugs-hoy');
    const cargar = async () => {
      try {
        const opciones = await api('GET', `/sugerencias?fecha=${hoy.fecha}&comida=comida`);
        if (!cont.isConnected) return;
        cont.innerHTML = opciones.length ? opciones.map((x) => sugerenciaHtml(x)).join('') : '<p class="ayuda">Agrega un platillo de comida para recibir sugerencias.</p>';
        cont.querySelectorAll('[data-elegir]').forEach((b) => b.addEventListener('click', accion(() =>
          confirmarPlatillo(opciones.find((x) => x.platillo.id === b.dataset.elegir).platillo, async (guarniciones) => {
            await api('PUT', `/plan/${hoy.fecha}/comida`, { platillo: b.dataset.elegir, guarniciones, soloSiVacio: true });
            cerrarSheet(); toast('Listo para la comida de hoy'); await refrescarSemana(hoy.fecha, 'comida');
          })
        )));
      } catch (error) { if (cont.isConnected) mostrarReintento(cont, cargar, error); }
    };
    void cargar();
  }
}

const espacioVacio = (s) => !s || !s.estado && !s.platos.length;
async function refrescarSemana(fecha, comida) {
  if (estado.tab !== 'semana') return;
  await vistaSemana();
  if (fecha && comida) {
    const slot = [...document.querySelectorAll('.slot')].find((b) => b.dataset.fecha === fecha && b.dataset.comida === comida);
    slot?.focus({ preventScroll: true });
  }
}

async function armar(reemplazar) {
  const r = await api('POST', '/semana/armar', { fecha: estado.fecha || undefined, reemplazar });
  toast(r.llenados.length ? `✨ Listo: ${r.llenados.length} comidas planeadas` : 'No había espacios vacíos');
  await refrescarSemana();
}

function diaHtml(d, comidas, sugerirHoy = false) {
  const tit = `${d.dia} ${diaNum(d.fecha)}`;
  return `<div class="dia ${d.esHoy ? 'hoy' : ''} ${d.cocina ? '' : 'libre'}">
    <div class="dia-titulo"><span class="mano">${esc(tit)}</span>
      ${d.esHoy ? '<span class="etiqueta">Hoy</span>' : ''}
      ${d.cocina ? '' : '<span class="etiqueta gris">Día libre</span>'}
    </div>
    ${comidas.map((c) => slotHtml(d.fecha, c, d.comidas[c])).join('')}
    ${sugerirHoy ? '<div class="sugs-hoy" aria-label="Sugerencias para la comida de hoy"><div id="sugs-hoy"><div class="ayuda">Buscando ideas para hoy…</div></div></div>' : ''}
  </div>`;
}

function slotHtml(fecha, comida, s) {
  let cuerpo;
  if (!s || (!s.estado && !s.platos.length)) cuerpo = '<span class="vacio">+ Elegir</span>';
  else if (s.estado && s.estado !== 'cocinar') cuerpo = `<span class="estado-pill">${ESTADO_INFO[s.estado] || esc(s.etiqueta)}</span>`;
  else {
    cuerpo = s.platos.map((p) => `<span class="plato">
      <span class="nombre">${esc(p.nombre)}</span> ${p.para?.length ? `<span class="para">${esc(p.paraNombres.join(', '))}</span>` : ''}
      ${p.guarniciones?.length ? `<span class="det">con ${esc(p.guarniciones.join(' · '))}</span>` : ''}
    </span>`).join('');
  }
  const extras = `${s?.invitados ? `<span class="invit">👥 +${s.invitados}</span>` : ''}${s?.hecho ? ' <span class="hecho">✓ Hecho</span>' : ''}`;
  return `<button class="slot" data-fecha="${fecha}" data-comida="${comida}">
    <span class="que"><span aria-hidden="true">${COMIDA_ICONO[comida]}</span> ${COMIDA_NOMBRE[comida]}</span>
    <span class="cuerpo">${cuerpo}${extras ? `<span class="slot-extras">${extras}</span>` : ''}</span>
  </button>`;
}

// ---------- hoja de un espacio (día + comida) ----------
function sugerenciaHtml(x) {
  return `<button class="sug" data-elegir="${x.platillo.id}">
    <span class="nombre">${esc(CAT_ICONO[x.platillo.categoria] || '🍽️')} ${esc(x.platillo.nombre)}</span>
    <span class="razones">${esc(x.razones.join(' · '))}</span>
    ${x.totalIngredientes ? `<span class="razones">${x.faltan.length ? `Falta: ${esc(x.faltan.join(', '))}` : 'Tienes los ingredientes principales'}</span>` : ''}
  </button>`;
}

function confirmarPlatillo(p, guardar, { actuales = [], volver, editar = false, resumen } = {}) {
  const opciones = [...new Set([...(p.guarniciones || []), ...actuales])];
  const sheet = abrirSheet(`
    <div class="sheet-tit"><h2>${esc(p.nombre)}</h2><button class="icono" data-cerrar>✕</button></div>
    ${resumen ? `<p class="sub">${esc(resumen)}</p>` : ''}
    <form id="f-guarniciones">
      <fieldset class="guarniciones">
        <legend>Acompañamientos</legend>
        ${opciones.map((n) => `<label class="extra-alimento"><input type="checkbox" name="guarnicion" value="${esc(n)}" ${actuales.includes(n) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}
        <label class="campo">Otro acompañamiento<input name="otros" placeholder="Ej. ensalada, arroz"></label>
      </fieldset>
      <button type="submit" class="btn ancho">${editar ? 'Guardar acompañamientos' : 'Poner en el plan'}</button>
    </form>
    ${volver ? '<button type="button" class="btn sec ancho" data-volver style="margin-top:8px">Volver</button>' : ''}
  `);
  sheet.querySelector('#f-guarniciones').addEventListener('submit', accion(async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await guardar([...new Set([...f.getAll('guarnicion'), ...f.get('otros').split(',').map((n) => n.trim()).filter(Boolean)])]);
  }));
  sheet.querySelector('[data-volver]')?.addEventListener('click', accion(() => volver()));
}

async function hojaSlot(fecha, comida, opciones = {}) {
  const sem = await api('GET', `/semana?fecha=${fecha}`);
  const dia = sem.dias.find((d) => d.fecha === fecha);
  const s = dia.comidas[comida] || { platos: [], estado: null, invitados: 0, hecho: false };
  const modo = opciones.modo || 'cambiar';
  const paraNuevo = opciones.para || [];
  const excluir = opciones.excluir || [];
  const indice = opciones.indice ?? (s.platos.length === 1 ? 0 : null);
  const puedeSugerir = modo === 'agregar' || !s.platos.length || indice !== null;

  const sheet = abrirSheet(`
    <div class="sheet-tit"><h2>${esc(dia.dia)} ${diaNum(fecha)} · ${COMIDA_NOMBRE[comida]}</h2><button class="icono" data-cerrar>✕</button></div>
    ${s.platos.length ? `<h3>Planeado</h3>${s.platos.map((p, i) => `
      <div class="tarjeta" style="padding:10px">
        <div class="fila"><div class="flex"><b>${esc(p.nombre)}</b> ${p.para?.length ? `<span class="para">${esc(p.paraNombres.join(', '))}</span>` : ''}
          ${p.guarniciones?.length ? `<div class="ayuda">con ${esc(p.guarniciones.join(' · '))}</div>` : ''}</div>
        </div>
        ${s.hecho ? '' : `<div class="fila acciones-plato">
          <button class="btn sec chico" data-cambiar-plato="${i}" aria-pressed="${modo === 'cambiar' && indice === i}">Cambiar</button>
          <button class="btn sec chico" data-acompanar="${i}">Acompañamientos</button>
          <button class="quitar" data-quitar="${i}" aria-label="Quitar ${esc(p.nombre)}">✕</button>
        </div>`}
      </div>`).join('')}` : ''}
    ${s.platos.length && !s.hecho && fecha <= hoyISO() ? '<button class="btn ancho" data-hecho style="margin:4px 0 8px">✅ Ya lo cociné</button>' : ''}
    ${s.hecho ? '<button class="btn sec ancho" data-deshacer style="margin:4px 0 8px">↩️ Desmarcar "hecho"</button>' : ''}

    ${s.hecho ? '' : `
    <h3>Sugerencias</h3>
    ${s.platos.length ? `<button class="btn sec chico" data-modo="agregar" aria-pressed="${modo === 'agregar'}">+ Otro para…</button>` : ''}
    ${modo === 'cambiar' && s.platos.length > 1 && indice !== null ? `<p class="ayuda">Opciones para cambiar ${esc(s.platos[indice]?.nombre)}</p>` : ''}
    ${modo === 'agregar' ? `<div class="ayuda" style="margin-bottom:6px">¿Para quién es el otro platillo?</div>
      <div class="chips" id="para-nuevo">
        <button class="chip" data-grupo="ninos">👧 Niños</button>
        <button class="chip" data-grupo="adultos">🧑 Adultos</button>
        ${estado.personas.map((p) => `<button class="chip ${paraNuevo.includes(p.id) ? 'on' : ''}" data-persona="${esc(p.id)}" aria-pressed="${paraNuevo.includes(p.id)}">${esc(p.emoji)} ${esc(p.nombre)}</button>`).join('')}
      </div>` : ''}
    ${puedeSugerir ? `
    <div id="sugs"><div class="cargando">Pensando…</div></div>
    <div class="fila" style="gap:8px;margin-bottom:6px">
      <button class="btn sec chico" data-otras>🔄 Otras opciones</button>
    <button class="btn sec chico" data-rapido aria-pressed="false">⚡ Solo rápidas</button>
    </div>
    <input class="buscar" id="buscar-plat" placeholder="🔍 Buscar en mi lista…" aria-label="Buscar en mi lista" style="margin-top:8px">
    <div id="res-busqueda"></div>
    ` : '<p class="ayuda">Elige cuál platillo quieres cambiar o agrega otro.</p>'}

    <h3>O este día…</h3>
    <div class="estados">${ESTADOS.map(([k, e, t]) => `<button data-estado="${k}" class="${s.estado === k ? 'on' : ''}"><span>${e}</span>${t}</button>`).join('')}
      <button data-estado=""><span>🗑️</span>Vaciar</button></div>
    `}
    <h3>Invitados</h3>
    ${s.hecho ? `<p class="ayuda">${s.invitados || 0} personas extra</p>` : `<div class="stepper"><button data-inv="-1" aria-label="Quitar invitado">−</button><b id="inv">${s.invitados || 0}</b><button data-inv="1" aria-label="Añadir invitado">+</button><span class="ayuda">personas extra</span></div>`}
  `);

  const recargar = (o = {}) => hojaSlot(fecha, comida, { modo, para: paraNuevo, excluir, indice, ...o });
  const guardar = (cuerpo) => api('PUT', `/plan/${fecha}/${comida}`, cuerpo);
  const paraSeleccion = () => [...sheet.querySelectorAll('#para-nuevo [data-persona].on')].map((b) => b.dataset.persona);

  sheet.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', accion(async () => {
    await guardar({ quitarPlato: Number(b.dataset.quitar), platilloEsperado: s.platos[b.dataset.quitar].platilloId });
    await refrescarSemana(); await recargar({ modo: 'cambiar', indice: null });
  })));
  sheet.querySelectorAll('[data-cambiar-plato]').forEach((b) => b.addEventListener('click', accion(() => recargar({ modo: 'cambiar', indice: Number(b.dataset.cambiarPlato) }))));
  sheet.querySelectorAll('[data-acompanar]').forEach((b) => b.addEventListener('click', accion(async () => {
    const i = Number(b.dataset.acompanar);
    const pl = s.platos[i];
    const p = pl.disponible === false ? pl : await api('GET', `/platillos/${pl.platilloId}`);
    confirmarPlatillo(p, async (guarniciones) => {
      await guardar({ guarniciones, reemplazarPlato: i, platilloEsperado: pl.platilloId });
      await refrescarSemana(); await recargar();
    }, { editar: true, actuales: pl.guarniciones, volver: recargar });
  })));
  sheet.querySelector('[data-hecho]')?.addEventListener('click', accion(() => hojaHecho(fecha, comida, s)));
  sheet.querySelector('[data-deshacer]')?.addEventListener('click', accion(async () => {
    if (!confirm('¿Quitar esta comida del historial? Sus estrellas y el refri se pueden corregir por separado.')) return;
    await api('DELETE', `/plan/${fecha}/${comida}/hecho`); await refrescarSemana(); await recargar();
  }));
  sheet.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', accion(() => recargar({ modo: b.dataset.modo }))));
  const marcarPersona = (b, activo = !b.classList.contains('on')) => {
    b.classList.toggle('on', activo);
    b.setAttribute('aria-pressed', String(activo));
  };
  sheet.querySelectorAll('#para-nuevo [data-persona]').forEach((b) => b.addEventListener('click', () => { marcarPersona(b); cargarSugs(); }));
  sheet.querySelectorAll('#para-nuevo [data-grupo]').forEach((b) => b.addEventListener('click', () => {
    const esNino = b.dataset.grupo === 'ninos';
    sheet.querySelectorAll('#para-nuevo [data-persona]').forEach((x) => {
      const p = nombrePersona(x.dataset.persona);
      marcarPersona(x, (p.rol === 'nino') === esNino);
    });
    cargarSugs();
  }));
  sheet.querySelectorAll('[data-inv]').forEach((b) => b.addEventListener('click', accion(async () => {
    const inv = sheet.querySelector('#inv');
    const n = Math.max(0, Number(inv.textContent) + Number(b.dataset.inv));
    if (n === Number(inv.textContent)) return;
    await guardar({ invitados: n });
    inv.textContent = n;
    await refrescarSemana();
    await cargarSugs();
  })));
  sheet.querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', accion(async () => {
    if (s.platos.length && !confirm('¿Reemplazar los platillos de este espacio?')) return;
    await guardar({ estado: b.dataset.estado || null });
    cerrarSheet();
    await refrescarSemana(fecha, comida);
  })));

  let soloRapido = false;
  let mostrados = [...excluir];
  let solicitud = 0;
  async function cargarSugs(extraExcluir = []) {
    const cont = sheet.querySelector('#sugs');
    if (!cont) return;
    const actual = ++solicitud;
    const para = modo === 'agregar' ? paraSeleccion() : s.platos[indice]?.para || [];
    const qs = new URLSearchParams({ fecha, comida, cantidad: 3, rapido: soloRapido });
    const excl = [...extraExcluir, ...s.platos.map((p) => p.platilloId)];
    if (excl.length) qs.set('excluir', excl.join(','));
    if (para.length) qs.set('para', para.join(','));
    try {
      const sugs = await api('GET', `/sugerencias?${qs}`);
      if (solicitud !== actual || !cont.isConnected) return;
      mostrados = [...new Set([...extraExcluir, ...sugs.map((x) => x.platillo.id)])];
      cont.innerHTML = sugs.length ? sugs.map(sugerenciaHtml).join('') : '<p class="ayuda">Ya viste todas las opciones con estos filtros. Puedes buscar en tu lista.</p>';
      cont.querySelectorAll('[data-elegir]').forEach((b) => b.addEventListener('click', accion(() => elegir(sugs.find((x) => x.platillo.id === b.dataset.elegir).platillo))));
    } catch (error) { if (solicitud === actual && cont.isConnected) mostrarReintento(cont, () => cargarSugs(extraExcluir), error); }
  }
  function elegir(p) {
    const para = modo === 'agregar' ? paraSeleccion() : [];
    if (modo === 'agregar' && !para.length) throw new Error('Primero elige para quién es.');
    const pl = modo !== 'agregar' && s.platos[indice];
    const resumen = pl ? `Cambia ${pl.nombre}${pl.para?.length ? ` para ${pl.paraNombres.join(', ')}` : ''}.` : undefined;
    confirmarPlatillo(p, async (guarniciones) => {
      await guardar({
        platillo: p.id, guarniciones,
        ...(modo === 'agregar' ? { modo, para } : pl ? { reemplazarPlato: indice, platilloEsperado: pl.platilloId } : {}),
      });
      cerrarSheet(); toast('Platillo guardado'); await refrescarSemana(fecha, comida);
    }, { actuales: (p.guarniciones || []).slice(0, 2), resumen, volver: () => recargar({ para }) });
  }
  sheet.querySelector('[data-otras]')?.addEventListener('click', () => cargarSugs(mostrados));
  sheet.querySelector('[data-rapido]')?.addEventListener('click', (e) => {
    soloRapido = !soloRapido;
    e.currentTarget.classList.toggle('rosa', soloRapido);
    e.currentTarget.classList.toggle('sec', !soloRapido);
    e.currentTarget.setAttribute('aria-pressed', String(soloRapido));
    cargarSugs();
  });

  const buscar = sheet.querySelector('#buscar-plat');
  let todos = null;
  buscar?.addEventListener('input', async () => {
    let catalogo;
    try { catalogo = await (todos ||= api('GET', `/platillos?tipo=${comida}`)); }
    catch (error) { todos = null; if (buscar.isConnected) mostrarError(error); return; }
    if (!buscar.isConnected) return;
    const t = normalizar(buscar.value);
    const res = t ? catalogo.filter((p) => normalizar(p.nombre).includes(t)).slice(0, 8) : [];
    sheet.querySelector('#res-busqueda').innerHTML = res.map((p) => `<button class="lista-item" data-elegir="${p.id}">
      <span class="cat">${CAT_ICONO[p.categoria] || '🍽️'}</span><span class="flex nombre">${esc(p.nombre)}</span>
      ${p.stats.puntaje ? `<span class="puntaje">★ ${p.stats.puntaje}</span>` : ''}</button>`).join('')
      || (t ? `<button class="lista-item" data-nuevo><span class="cat">➕</span><span class="flex">Crear “${esc(buscar.value)}”</span></button>` : '');
    sheet.querySelectorAll('#res-busqueda [data-elegir]').forEach((b) => b.addEventListener('click', accion(() => elegir(res.find((p) => p.id === b.dataset.elegir)))));
    sheet.querySelector('#res-busqueda [data-nuevo]')?.addEventListener('click', accion(() =>
      hojaPlatillo(null, { nombre: buscar.value, tipos: [comida] }, elegir)
    ));
  });

  if (!s.hecho) cargarSugs(excluir);
}

// ---------- marcar como hecho + calificar ----------
async function hojaHecho(fecha, comida, s) {
  const detalles = await Promise.all(s.platos.map((p) => p.disponible === false ? p : api('GET', `/platillos/${p.platilloId}`)));
  const ingredientes = [...new Set(detalles.flatMap((d, i) => [...(d.ingredientes || []), ...(s.platos[i].guarniciones || [])]))];
  const sheet = abrirSheet(`
    <div class="sheet-tit"><h2>¿Qué tal estuvo? 😋</h2><button class="icono" data-cerrar>✕</button></div>
    ${detalles.map((d, i) => {
      if (!d.id) return `<p class="ayuda">${esc(d.nombre)} ya no está en el catálogo.</p>`;
      const para = s.platos[i].para?.length ? s.platos[i].para : estado.personas.map((p) => p.id);
      return `<div class="tarjeta" data-plat="${d.id}"><b>${esc(d.nombre)}</b>
        ${para.map((pid) => { const per = nombrePersona(pid); if (!per) return '';
          return `<div class="persona-estrellas"><span>${esc(per.emoji)} ${esc(per.nombre)}</span>${estrellasHtml(d.calificaciones?.[pid], `data-persona="${pid}" data-valor="${d.calificaciones?.[pid] || 0}"`)}</div>`; }).join('')}
      </div>`;
    }).join('')}
    ${ingredientes.length ? `<h3>¿Se acabó algo?</h3><div class="ayuda" style="margin-bottom:6px">Lo quito de tu refri</div>
      <div class="chips">${ingredientes.map((i) => `<button class="chip" data-acabo="${esc(i)}">${esc(i)}</button>`).join('')}</div>` : ''}
    <button class="btn ancho" data-guardar style="margin-top:8px">Guardar ✅</button>`);
  sheet.querySelectorAll('[data-acabo]').forEach((b) => b.addEventListener('click', () => b.classList.toggle('on')));
  sheet.querySelector('[data-guardar]').addEventListener('click', accion(async () => {
    const calificaciones = {};
    sheet.querySelectorAll('[data-plat]').forEach((t) => {
      const porPersona = {};
      const p = detalles.find((d) => d.id === t.dataset.plat);
      t.querySelectorAll('[data-persona]').forEach((e) => {
        const valor = Number(e.dataset.valor);
        if (valor !== (p.calificaciones?.[e.dataset.persona] || 0)) porPersona[e.dataset.persona] = valor;
      });
      if (Object.keys(porPersona).length) calificaciones[t.dataset.plat] = { ...calificaciones[t.dataset.plat], ...porPersona };
    });
    const seAcabo = [...sheet.querySelectorAll('[data-acabo].on')].map((b) => b.dataset.acabo);
    await api('POST', `/plan/${fecha}/${comida}/hecho`, { calificaciones, seAcabo });
    cerrarSheet(); toast('Comida registrada'); await refrescarSemana(fecha, comida);
  }));
}

// =====================================================================
// PLATILLOS
// =====================================================================
let filtroPlat = { texto: '', tipo: '', categoria: '' };
let soloArchivados = false;
let solicitudPlatillos = 0;
async function vistaPlatillos() {
  const solicitud = ++solicitudPlatillos;
  const app = $('#app');
  app.innerHTML = `
    <div class="cabecera"><h1>Mis platillos</h1><button class="btn chico" data-nuevo>+ Nuevo</button></div>
    <input class="buscar" id="q" aria-label="Buscar por nombre o ingrediente" placeholder="🔍 Buscar por nombre o ingrediente" value="${esc(filtroPlat.texto)}">
    <div class="chips scroll" id="f-tipo">
      <button class="chip ${!filtroPlat.tipo && !filtroPlat.categoria ? 'on' : ''}" data-f="">Todos</button>
      <button class="chip ${filtroPlat.tipo === 'desayuno' ? 'on' : ''}" data-f="tipo:desayuno">☀️ Desayunos</button>
      ${CATEGORIAS.filter((c) => c !== 'desayuno').map((c) => `<button class="chip ${filtroPlat.categoria === c ? 'on' : ''}" data-f="categoria:${c}">${CAT_ICONO[c]} ${c}</button>`).join('')}
    </div>
    <div class="fila" style="justify-content:space-between; flex-wrap:wrap;margin-bottom:8px">
      <label class="sub">Ordenar <select id="orden" class="chip">
      <option value="nombre">Nombre</option><option value="puntaje">⭐ Más gustados</option><option value="veces">🔁 Más hechos</option><option value="olvidados">💤 Más olvidados</option>
      </select></label>
      <button class="chip ${soloArchivados ? 'on' : ''}" data-archivados aria-pressed="${soloArchivados}">Archivados</button>
    </div>
    <div id="lista"><div class="cargando">Cargando…</div></div>`;
  app.querySelector('[data-nuevo]').addEventListener('click', accion(() => hojaPlatillo(null)));
  app.querySelector('[data-archivados]').addEventListener('click', () => { soloArchivados = !soloArchivados; irA('platillos'); });
  app.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    const [k, v] = b.dataset.f.split(':');
    filtroPlat = { texto: filtroPlat.texto, tipo: '', categoria: '' };
    if (k) filtroPlat[k] = v;
    irA('platillos');
  }));
  const orden = app.querySelector('#orden');
  orden.value = lsGet('orden') || 'nombre';
  const todos = await api('GET', `/platillos?${new URLSearchParams({ tipo: filtroPlat.tipo, categoria: filtroPlat.categoria, archivados: soloArchivados })}`);
  if (estado.tab !== 'platillos' || solicitud !== solicitudPlatillos) return;
  const pintar = () => {
    const t = normalizar(filtroPlat.texto);
    const l = todos.filter((p) => (!soloArchivados || p.archivado) && (!t || normalizar(p.nombre).includes(t) || p.ingredientes.some((i) => normalizar(i).includes(t))));
    const o = orden.value;
    if (o === 'puntaje') l.sort((a, b) => (b.stats.puntaje || 0) - (a.stats.puntaje || 0));
    if (o === 'veces') l.sort((a, b) => b.stats.veces - a.stats.veces);
    if (o === 'olvidados') l.sort((a, b) => (b.stats.diasDesde ?? 999) - (a.stats.diasDesde ?? 999) || a.stats.veces - b.stats.veces);
    $('#lista').innerHTML = l.length ? l.map((p) => `<button class="lista-item" data-id="${p.id}">
      <span class="cat">${CAT_ICONO[p.categoria] || '🍽️'}</span>
      <span class="flex"><div class="nombre">${esc(p.nombre)}</div>
        <div class="det">${p.stats.veces ? `${p.stats.veces} ${p.stats.veces === 1 ? 'vez' : 'veces'}` : 'Nuevo'}${p.stats.diasDesde != null ? ` · hace ${p.stats.diasDesde} días` : ''}${p.etiquetas.includes('invitados') ? ' · 🎉' : ''}</div></span>
      ${p.stats.puntaje ? `<span class="puntaje">★ ${p.stats.puntaje}</span>` : '<span class="ayuda">sin ★</span>'}
    </button>`).join('') : '<div class="vacio-grande">No encontré platillos 🤔</div>';
    $('#lista').querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', accion(() => hojaPlatillo(b.dataset.id))));
  };
  app.querySelector('#q').addEventListener('input', (e) => { filtroPlat.texto = e.target.value; pintar(); });
  orden.addEventListener('change', () => { lsSet('orden', orden.value); pintar(); });
  pintar();
}

async function hojaPlatillo(id, base = {}, alGuardar) {
  const p = id ? await api('GET', `/platillos/${id}`) : { nombre: '', tipos: ['comida', 'cena'], categoria: 'pollo', tiempo: 'medio', ingredientes: [], guarniciones: [], etiquetas: [], notas: '', calificaciones: {}, ...base };
  const st = p.stats;
  const sheet = abrirSheet(`
    <div class="sheet-tit"><h2>${id ? esc(p.nombre) : 'Nuevo platillo'}</h2><button class="icono" data-cerrar>✕</button></div>
    ${st ? `<p class="sub" style="margin-top:0">🔁 ${st.veces} ${st.veces === 1 ? 'vez' : 'veces'}${st.ultimaVez ? ` · última vez hace ${st.diasDesde} días` : ''}${st.puntaje ? ` · ★ ${st.puntaje} familiar` : ''}</p>` : ''}
    <form id="f-plat">
      <label class="campo">Nombre<input name="nombre" required value="${esc(p.nombre)}"></label>
      <div class="campo" style="font-weight:700;font-size:.9rem">¿Cuándo se come?</div>
      <div class="chips" id="tipos">${['desayuno', 'comida', 'cena'].map((t) => `<button type="button" class="chip ${p.tipos.includes(t) ? 'on' : ''}" data-t="${t}">${COMIDA_ICONO[t]} ${COMIDA_NOMBRE[t]}</button>`).join('')}</div>
      <label class="campo">Tipo<select name="categoria">${CATEGORIAS.map((c) => `<option value="${c}" ${p.categoria === c ? 'selected' : ''}>${CAT_ICONO[c]} ${c}</option>`).join('')}</select></label>
      <label class="campo">Tiempo<select name="tiempo">${Object.entries(TIEMPOS).map(([k, v]) => `<option value="${k}" ${p.tiempo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="campo">Ingredientes principales <span class="ayuda">(separados por coma)</span><textarea name="ingredientes" rows="2">${esc(p.ingredientes.join(', '))}</textarea></label>
      <label class="campo">Acompañamientos típicos <span class="ayuda">(arroz, frijoles, sopa…)</span><input name="guarniciones" value="${esc(p.guarniciones.join(', '))}"></label>
      <div class="chips" id="etiquetas">
        <button type="button" class="chip ${p.etiquetas.includes('invitados') ? 'on' : ''}" data-e="invitados">🎉 Bueno para invitados</button>
        <button type="button" class="chip ${p.etiquetas.includes('ninos') ? 'on' : ''}" data-e="ninos">🧒 Favorito de los niños</button>
        <button type="button" class="chip ${p.etiquetas.includes('adultos') ? 'on' : ''}" data-e="adultos">🍷 De adultos</button>
      </div>
      <label class="campo">Notas<textarea name="notas" rows="2">${esc(p.notas)}</textarea></label>
      <label class="campo">Veces anotadas en la libreta<input type="number" name="vecesPrevias" min="0" max="999999" step="1" required value="${p.vecesPrevias || 0}"></label>
      <h3>¿Cuánto les gusta?</h3>
      ${estado.personas.map((per) => `<div class="persona-estrellas"><span>${esc(per.emoji)} ${esc(per.nombre)}</span>${estrellasHtml(p.calificaciones?.[per.id], `data-persona="${per.id}" data-valor="${p.calificaciones?.[per.id] || 0}"`)}</div>`).join('')}
      <button class="btn ancho" style="margin-top:14px">Guardar</button>
      ${id ? p.archivado
        ? '<button type="button" class="btn sec ancho" data-restaurar style="margin-top:6px">Restaurar platillo</button>'
        : '<button type="button" class="btn peligro ancho" data-archivar style="margin-top:6px">Archivar platillo</button>' : ''}
    </form>`);
  sheet.querySelectorAll('#tipos .chip, #etiquetas .chip').forEach((b) => b.addEventListener('click', () => b.classList.toggle('on')));
  sheet.querySelector('[data-archivar]')?.addEventListener('click', accion(async () => {
    const usos = await api('GET', `/platillos/${id}/usos-futuros`);
    const detalle = usos.length ? ` Se conserva en el plan: ${usos.map((u) => `${diaNum(u.fecha)} ${mesCorto(u.fecha)} (${COMIDA_NOMBRE[u.comida]})`).join(', ')}.` : '';
    if (!confirm(`¿Archivar «${p.nombre}»? Dejará de aparecer en sugerencias.${detalle}`)) return;
    await api('DELETE', `/platillos/${id}`); cerrarSheet(); toast('Platillo archivado'); vistaActual();
  }));
  sheet.querySelector('[data-restaurar]')?.addEventListener('click', accion(async () => {
    await api('POST', `/platillos/${id}/restaurar`, {}); cerrarSheet(); toast('Platillo restaurado'); vistaActual();
  }));
  sheet.querySelector('#f-plat').addEventListener('submit', accion(async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const datos = {
      nombre: f.get('nombre'), categoria: f.get('categoria'), tiempo: f.get('tiempo'),
      ingredientes: f.get('ingredientes'), guarniciones: f.get('guarniciones'), notas: f.get('notas'),
      tipos: [...sheet.querySelectorAll('#tipos .on')].map((b) => b.dataset.t),
      etiquetas: [...sheet.querySelectorAll('#etiquetas .on')].map((b) => b.dataset.e),
      vecesPrevias: Number(f.get('vecesPrevias')),
    };
    if (!datos.tipos.length) throw new Error('Elige al menos desayuno, comida o cena.');
    const estrellas = {};
    sheet.querySelectorAll('[data-persona]').forEach((el) => {
      const v = Number(el.dataset.valor);
      if (v !== (p.calificaciones?.[el.dataset.persona] || 0)) estrellas[el.dataset.persona] = v;
    });
    if (Object.keys(estrellas).length) datos.calificaciones = estrellas;
    const guardado = id ? await api('PATCH', `/platillos/${id}`, datos) : await api('POST', '/platillos', datos);
    if (alGuardar) return alGuardar(guardado);
    cerrarSheet(); toast('Guardado ✨'); vistaActual();
  }));
}

const vistaActual = () => irA(estado.tab);

// =====================================================================
// REFRI
// =====================================================================
async function vistaRefri() {
  const app = $('#app');
  app.innerHTML = `<div class="cabecera"><h1>Mi refri 🧊</h1></div>
    <p class="sub" style="margin-top:-6px">Toca lo que <b>sí tienes</b> en casa.</p>
    <button class="btn rosa ancho" data-quehago style="margin-bottom:12px">🍳 ¿Qué hago con lo que tengo?</button>
    <form id="f-ing" class="fila" style="margin-bottom:6px"><input class="buscar" name="n" aria-label="Otro ingrediente" placeholder="Agregar otro ingrediente…" maxlength="120" required style="margin:0"><button class="btn chico" aria-label="Agregar ingrediente">+</button></form>
    <div id="refri"><div class="cargando">Cargando…</div></div>`;
  const items = await api('GET', '/refri');
  if (estado.tab !== 'refri') return;
  const secciones = { carniceria: '🥩 Carnicería', verdura: '🥬 Verdura y fruta', super: '🛒 Súper' };
  $('#refri').innerHTML = Object.entries(secciones).map(([k, t]) => {
    const l = items.filter((i) => i.seccion === k);
    return l.length ? `<h3>${t}</h3><div class="chips">${l.map((i) => `<button class="chip verde ${i.tengo ? 'on' : ''}" aria-pressed="${i.tengo}" data-ing="${esc(i.nombre)}">${esc(i.nombre)}</button>`).join('')}</div>` : '';
  }).join('');
  $('#refri').querySelectorAll('[data-ing]').forEach((b) => b.addEventListener('click', accion(async () => {
    const on = !b.classList.contains('on');
    await api('POST', '/refri', on ? { tengo: [b.dataset.ing] } : { seAcabo: [b.dataset.ing] });
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  })));
  $('#f-ing').addEventListener('submit', accion(async (e) => {
    e.preventDefault();
    const n = e.target.n.value.trim();
    if (!n) return;
    await api('POST', '/refri', { tengo: [n] }); if (estado.tab === 'refri') await vistaRefri();
  }));
  app.querySelector('[data-quehago]').addEventListener('click', accion(async () => {
    const res = await api('GET', '/refri/que-hago?comida=comida');
    const sheet = abrirSheet(`<div class="sheet-tit"><h2>Con lo que tienes…</h2><button class="icono" data-cerrar>✕</button></div>
      ${res.length ? res.map((r) => `<div class="tarjeta"><div class="fila"><div class="flex"><b>${esc(r.platillo)}</b>
        <div class="ayuda">Tienes ${r.tienes} de ${r.total}${r.faltan.length ? ` · falta: ${esc(r.faltan.join(', '))}` : ' · ¡tienes todo! 🎉'}</div></div>
        <button class="btn chico" data-hoy="${r.id}" aria-label="Elegir ${esc(r.platillo)} para hoy">Hoy</button></div></div>`).join('') : '<p class="vacio-grande">Marca primero lo que tienes en el refri 🙂</p>'}`);
    sheet.querySelectorAll('[data-hoy]').forEach((b) => b.addEventListener('click', accion(async () => {
      const sem = await api('GET', '/semana');
      estado.hoy = sem.hoy;
      if (!sem.comidasActivas.includes('comida')) throw new Error('Activa «Comida» en Más para planearla.');
      const actual = sem.dias.find((d) => d.esHoy).comidas.comida;
      if (actual?.hecho) throw new Error('La comida de hoy ya está hecha. Revísala en Semana para corregirla.');
      const p = await api('GET', `/platillos/${b.dataset.hoy}`);
      const anteriores = actual?.platos.map((pl) => pl.nombre).join(' y ') || actual?.etiqueta;
      confirmarPlatillo(p, async (guarniciones) => {
        await api('PUT', `/plan/${sem.hoy}/comida`, { platillo: p.id, guarniciones, soloSiVacio: !anteriores });
        cerrarSheet(); toast('Puesto para la comida de hoy');
      }, { actuales: p.guarniciones.slice(0, 2), resumen: anteriores ? `Reemplaza «${anteriores}» en la comida de hoy.` : undefined });
    })));
  }));
}

// =====================================================================
// SÚPER
// =====================================================================
async function vistaSuper() {
  const app = $('#app');
  app.innerHTML = '<div class="cargando">Cargando…</div>';
  const fecha = estado.fecha;
  let l = await api('GET', fecha ? `/compras?fecha=${fecha}` : '/compras');
  if (estado.tab !== 'super') return;
  const fechaMostrada = l.semana;
  const iconos = { carniceria: '🥩', verdura: '🥬', super: '🛒' };
  const total = Object.values(l.secciones).flat();
  app.innerHTML = `<div class="cabecera"><h1>Lista del súper</h1>${navigator.share ? '<button class="icono" data-compartir aria-label="Compartir">📤</button>' : ''}</div>
    <p class="sub" style="margin-top:-6px">Semana del ${diaNum(l.semana)} ${mesCorto(l.semana)} · sin lo que ya tienes en el refri</p>
    <form id="f-extra" class="fila" style="margin-bottom:10px">
      <input class="buscar" name="n" aria-label="Artículo extra" placeholder="Agregar (papel de baño, leche…)" maxlength="120" required style="margin:0">
      <button class="btn chico" aria-label="Agregar artículo">+</button>
    </form>
    <label class="extra-alimento"><input type="checkbox" name="alimento" form="f-extra"> Es un alimento</label>
    <div class="armar"><button class="btn sec" data-al-refri hidden>Pasar alimentos marcados al refri</button></div>
    ${total.length ? Object.entries(l.secciones).map(([k, items]) => items.length ? `<div class="tarjeta"><h3 style="margin-top:0">${iconos[k]} ${esc(l.nombresSecciones[k])}</h3>
      ${items.map((i) => `<div class="compra ${i.marcado ? 'marcado' : ''}">
        <input type="checkbox" id="compra-${esc(encodeURIComponent(i.id))}" data-c="${esc(i.nombre)}" ${i.marcado ? 'checked' : ''}>
        <label for="compra-${esc(encodeURIComponent(i.id))}" class="flex"><span class="nombre">${esc(i.nombre)}</span>${i.para ? `<span class="det">${esc(i.para.join(', '))}</span>` : ''}</label>
        ${i.extra ? `<button type="button" class="quitar" data-q="${esc(i.nombre)}" aria-label="Quitar ${esc(i.nombre)}">✕</button>` : ''}
      </div>`).join('')}</div>` : '').join('') : '<div class="vacio-grande">Planea tu semana y aquí aparece lo que hay que comprar 🛒</div>'}`;
  const pasar = app.querySelector('[data-al-refri]');
  const actualizarPasar = () => { pasar.hidden = !Object.values(l.secciones).flat().some((i) => i.alimento && i.marcado); };
  actualizarPasar();
  let marcas = Promise.resolve();
  app.querySelectorAll('[data-c]').forEach((c) => c.addEventListener('change', accion(async () => {
    const marcado = c.checked;
    const guardar = marcas.then(async () => {
      l = await api('POST', '/compras/marcar', { fecha: fechaMostrada, nombre: c.dataset.c, marcado });
      c.closest('.compra').classList.toggle('marcado', marcado);
      actualizarPasar();
    });
    marcas = guardar.catch(() => {});
    try { await guardar; }
    catch (error) { c.checked = !marcado; throw error; }
  })));
  pasar.addEventListener('click', accion(async () => {
    await marcas;
    const { agregados } = await api('POST', '/compras/al-refri', { fecha: fechaMostrada });
    toast(agregados.length ? `Al refri: ${agregados.join(', ')}` : 'Marca primero los alimentos que compraste.');
    if (estado.tab === 'super') await vistaSuper();
  }));
  app.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', accion(async () => {
    await api('DELETE', `/compras/${encodeURIComponent(b.dataset.q)}?fecha=${fechaMostrada}`);
    if (estado.tab === 'super') await vistaSuper();
  })));
  $('#f-extra').addEventListener('submit', accion(async (e) => {
    e.preventDefault();
    const n = e.target.n.value.trim();
    if (!n) return;
    const datos = new FormData(e.target);
    await api('POST', '/compras', { fecha: fechaMostrada, nombre: n, alimento: datos.has('alimento') });
    if (estado.tab === 'super') await vistaSuper();
  }));
  app.querySelector('[data-compartir]')?.addEventListener('click', () => {
    const texto = Object.entries(l.secciones).filter(([, i]) => i.some((x) => !x.marcado))
      .map(([k, i]) => `${iconos[k]} ${l.nombresSecciones[k]}\n${i.filter((x) => !x.marcado).map((x) => `- ${x.nombre}`).join('\n')}`).join('\n\n');
    navigator.share({ title: 'Lista del súper', text: texto }).catch(() => {});
  });
}

// =====================================================================
// MÁS
// =====================================================================
async function vistaMas() {
  const app = $('#app');
  const [personas, config, hist] = await Promise.all([
    api('GET', '/personas?todas=1'), api('GET', '/config'), api('GET', `/historial?desde=${sumarDias(hoyISO(), -30)}`),
  ]);
  if (estado.tab !== 'mas') return;
  const base = location.origin;
  app.innerHTML = `<div class="cabecera"><h1>Más</h1></div>
    <div class="tarjeta"><h3 style="margin-top:0">👪 Familia</h3>
      ${personas.map((p) => `<div class="fila" style="padding:6px 0;${p.activo ? '' : 'opacity:.5'}">
        <span style="font-size:1.5rem">${esc(p.emoji)}</span><span class="flex"><b>${esc(p.nombre)}</b> <span class="ayuda">${p.rol === 'nino' ? 'niño/a' : 'adulto'}${p.activo ? '' : ' · inactivo'}</span></span>
        <button class="btn sec chico" data-editar="${p.id}">Editar</button></div>`).join('')}
      <button class="btn sec chico" data-agregar style="margin-top:6px">+ Agregar persona</button>
    </div>
    <div class="tarjeta"><h3 style="margin-top:0">🗓️ Días que cocino</h3>
      <div class="chips" id="dias">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="chip ${config.diasCocina.includes(d) ? 'on' : ''}" aria-pressed="${config.diasCocina.includes(d)}" data-d="${d}">${DIAS_CORTOS[d]}</button>`).join('')}</div>
      <h3>🍽️ Qué planeo</h3>
      <div class="chips" id="comidas">${['desayuno', 'comida', 'cena'].map((c) => `<button class="chip ${config.comidasActivas.includes(c) ? 'on' : ''}" aria-pressed="${config.comidasActivas.includes(c)}" data-c="${c}">${COMIDA_ICONO[c]} ${COMIDA_NOMBRE[c]}</button>`).join('')}</div>
    </div>
    <div class="tarjeta"><h3 style="margin-top:0">📜 Últimos 30 días</h3>
      ${hist.length ? hist.map((h) => `<div class="fila" style="padding:4px 0"><span class="ayuda" style="width:84px">${h.dia.slice(0, 3)} ${diaNum(h.fecha)} ${mesCorto(h.fecha)}</span><span class="flex">${COMIDA_ICONO[h.comida]} ${esc(h.platillo)}</span></div>`).join('') : '<p class="ayuda">Aquí aparece lo que vayas marcando como “Ya lo cociné”.</p>'}
    </div>
    <div class="tarjeta"><h3 style="margin-top:0">🟣 Conectar con Muse</h3>
      <p class="ayuda">Escríbele a Muse algo como:</p>
      <p style="font-size:.9rem;background:var(--lila-claro);border-radius:12px;padding:10px">“Crea un conector a mi app de comidas. Es un servidor MCP por HTTP en <code>${esc(base)}/mcp</code>, con autenticación bearer token. Pruébalo y guárdalo como skill.”</p>
      <p class="ayuda">Cuando te pida el token, escribe la clave del conector <b>en el aviso seguro de Muse</b>. Documentación de la API <code>${esc(base)}/openapi.json</code></p>
    </div>
    <button class="btn peligro ancho" data-salir>Cerrar sesión en este teléfono</button>`;

  app.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => hojaPersona(personas.find((p) => p.id === b.dataset.editar))));
  app.querySelector('[data-agregar]').addEventListener('click', () => hojaPersona(null));
  const configBotones = [...app.querySelectorAll('#dias .chip, #comidas .chip')];
  configBotones.forEach((b) => b.addEventListener('click', accion(async () => {
    const seleccionar = (selector) => [...app.querySelectorAll(selector)].filter((x) => x.classList.contains('on') !== (x === b));
    const patch = b.dataset.d !== undefined
      ? { diasCocina: seleccionar('#dias .chip').map((x) => Number(x.dataset.d)) }
      : { comidasActivas: seleccionar('#comidas .chip').map((x) => x.dataset.c) };
    configBotones.forEach((x) => { x.disabled = true; });
    try {
      const nueva = await api('PUT', '/config', patch);
      configBotones.forEach((x) => {
        const on = x.dataset.d !== undefined ? nueva.diasCocina.includes(Number(x.dataset.d)) : nueva.comidasActivas.includes(x.dataset.c);
        x.classList.toggle('on', on);
        x.setAttribute('aria-pressed', String(on));
      });
      toast('Guardado');
    } finally { configBotones.forEach((x) => { x.disabled = false; }); }
  })));
  app.querySelector('[data-salir]').addEventListener('click', () => { lsSet('clave', null); estado.clave = null; pintarLogin(); });
}

function hojaPersona(p) {
  const sheet = abrirSheet(`<div class="sheet-tit"><h2>${p ? 'Editar' : 'Nueva persona'}</h2><button class="icono" data-cerrar>✕</button></div>
    <form id="f-per">
      <label class="campo">Nombre<input name="nombre" required value="${esc(p?.nombre || '')}"></label>
      <label class="campo">Emoji<input name="emoji" value="${esc(p?.emoji || '🙂')}" maxlength="8"></label>
      <label class="campo">Es<select name="rol"><option value="adulto">Adulto</option><option value="nino" ${p?.rol === 'nino' ? 'selected' : ''}>Niño/a</option></select></label>
      ${p ? `<label class="campo" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="activo" ${p.activo ? 'checked' : ''} style="width:auto;margin:0"> Activo (aparece en estrellas y sugerencias)</label>` : ''}
      <button class="btn ancho">Guardar</button>
    </form>`);
  sheet.querySelector('#f-per').addEventListener('submit', accion(async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const datos = { nombre: f.get('nombre'), emoji: f.get('emoji'), rol: f.get('rol') };
    if (p) datos.activo = f.get('activo') === 'on';
    if (p) await api('PATCH', `/personas/${p.id}`, datos); else await api('POST', '/personas', datos);
    estado.personas = await api('GET', '/personas');
    cerrarSheet(); if (estado.tab === 'mas') await vistaMas();
  }));
}

iniciar();
