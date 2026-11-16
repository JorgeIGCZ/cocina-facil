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
  tab: lsGet('tab') || 'semana',
  fecha: null, // un día de la semana visible
  personas: [],
  config: null,
};

// ---------- utilidades ----------
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const sumarDias = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const diaNum = (iso) => Number(iso.slice(8, 10));
const mesCorto = (iso) => MESES[Number(iso.slice(5, 7)) - 1];
const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function api(metodo, ruta, cuerpo) {
  const r = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${estado.clave}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (r.status === 401) { lsSet('clave', null); estado.clave = null; pintarLogin('La clave no es correcta.'); throw new Error('401'); }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) { toast(datos.error || 'Algo salió mal'); throw new Error(datos.error); }
  return datos;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

function abrirSheet(html) {
  const s = $('#sheet');
  s.innerHTML = html; s.hidden = false; $('#sheet-fondo').hidden = false;
  document.body.style.overflow = 'hidden';
  s.scrollTop = 0;
  return s;
}
function cerrarSheet() {
  $('#sheet').hidden = true; $('#sheet-fondo').hidden = true; $('#sheet').innerHTML = '';
  document.body.style.overflow = '';
}
$('#sheet-fondo').addEventListener('click', cerrarSheet);

function estrellasHtml(valor, attrs = '') {
  return `<span class="estrellas" ${attrs}>${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-estrella="${n}" class="${n <= (valor || 0) ? 'on' : ''}" aria-label="${n} estrellas">★</button>`).join('')}</span>`;
}
// Delegación: tocar una estrella marca el valor en el contenedor (data-valor)
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-estrella]');
  if (!b) return;
  const cont = b.parentElement;
  const n = Number(b.dataset.estrella);
  const nuevo = Number(cont.dataset.valor) === n ? 0 : n;
  cont.dataset.valor = nuevo;
  cont.querySelectorAll('button').forEach((x) => x.classList.toggle('on', Number(x.dataset.estrella) <= nuevo));
});

// ---------- login ----------
function pintarLogin(error) {
  $('#tabs').hidden = true;
  $('#app').innerHTML = `
    <div class="login"><div class="tarjeta">
      <div style="font-size:3rem">🍳</div>
      <h1>Mi Cocina <span style="color:var(--rosa)">✦</span></h1>
      <p class="sub">Escribe tu clave para entrar</p>
      <form id="f-login">
        <input class="entrada" type="password" name="clave" autocomplete="current-password" placeholder="Clave" required>
        ${error ? `<p style="color:var(--rosa);font-weight:700">${esc(error)}</p>` : ''}
        <button class="btn ancho" style="margin-top:12px">Entrar</button>
      </form>
    </div></div>`;
  $('#f-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    estado.clave = new FormData(e.target).get('clave');
    lsSet('clave', estado.clave);
    iniciar();
  });
}

// ---------- navegación ----------
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) irA(b.dataset.tab);
});
function irA(tab) {
  estado.tab = tab; lsSet('tab', tab);
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('activo', b.dataset.tab === tab));
  window.scrollTo(0, 0);
  ({ semana: vistaSemana, platillos: vistaPlatillos, refri: vistaRefri, super: vistaSuper, mas: vistaMas })[tab]();
}

async function iniciar() {
  if (!estado.clave) return pintarLogin();
  try {
    [estado.personas, estado.config] = await Promise.all([api('GET', '/personas'), api('GET', '/config')]);
  } catch { return; }
  estado.fecha ||= hoyISO();
  $('#tabs').hidden = false;
  irA(estado.tab);
}

const nombrePersona = (id) => estado.personas.find((p) => p.id === id);

// =====================================================================
// SEMANA
// =====================================================================
async function vistaSemana() {
  const app = $('#app');
  if (!app.querySelector('.dia')) app.innerHTML = '<div class="cargando">Cargando…</div>';
  const sem = await api('GET', `/semana?fecha=${estado.fecha}`);
  if (estado.tab !== 'semana') return;
  const rango = `${diaNum(sem.inicio)} ${mesCorto(sem.inicio)} – ${diaNum(sem.fin)} ${mesCorto(sem.fin)}`;
  const vacios = sem.dias.filter((d) => d.cocina && d.fecha >= hoyISO()).some((d) => Object.values(d.comidas).some((s) => !s));
  app.innerHTML = `
    <div class="cabecera">
      <h1>Mi Cocina <span class="chispa">✦</span></h1>
      <div class="semana-nav">
        <button class="icono" data-sem="-7" aria-label="Semana anterior">‹</button>
        <button class="icono" data-sem="hoy" aria-label="Esta semana" title="Esta semana">•</button>
        <button class="icono" data-sem="7" aria-label="Semana siguiente">›</button>
      </div>
    </div>
    <div class="sub" style="margin:-6px 0 10px;font-weight:700">Semana del ${rango}</div>
    <div class="armar">
      ${vacios ? '<button class="btn rosa" data-accion="armar">✨ Armar mi semana</button>' : '<button class="btn sec" data-accion="rearmar">🔄 Rehacer semana</button>'}
    </div>
    ${sem.dias.map((d) => diaHtml(d, sem.comidasActivas)).join('')}`;

  app.querySelectorAll('[data-sem]').forEach((b) => b.addEventListener('click', () => {
    estado.fecha = b.dataset.sem === 'hoy' ? hoyISO() : sumarDias(estado.fecha, Number(b.dataset.sem));
    vistaSemana();
  }));
  app.querySelector('[data-accion="armar"]')?.addEventListener('click', () => armar(false));
  app.querySelector('[data-accion="rearmar"]')?.addEventListener('click', () => {
    if (confirm('¿Cambiar todo lo planeado de aquí en adelante? (No se toca lo ya cocinado ni los días pasados)')) armar(true);
  });
  app.querySelectorAll('.slot').forEach((b) => b.addEventListener('click', () => hojaSlot(b.dataset.fecha, b.dataset.comida)));
}

async function armar(reemplazar) {
  const r = await api('POST', '/semana/armar', { fecha: estado.fecha, reemplazar });
  toast(r.llenados.length ? `✨ Listo: ${r.llenados.length} comidas planeadas` : 'No había espacios vacíos');
  vistaSemana();
}

function diaHtml(d, comidas) {
  const tit = `${d.dia} ${diaNum(d.fecha)}`;
  return `<div class="dia ${d.esHoy ? 'hoy' : ''} ${d.cocina ? '' : 'libre'}">
    <div class="dia-titulo"><span class="mano">${esc(tit)}</span>
      ${d.esHoy ? '<span class="etiqueta">Hoy</span>' : ''}
      ${d.cocina ? '' : '<span class="etiqueta gris">Día libre</span>'}
    </div>
    ${comidas.map((c) => slotHtml(d.fecha, c, d.comidas[c])).join('')}
  </div>`;
}

function slotHtml(fecha, comida, s) {
  let cuerpo;
  if (!s || (!s.estado && !s.platos.length)) cuerpo = '<span class="vacio">+ Elegir</span>';
  else if (s.estado && s.estado !== 'cocinar') cuerpo = `<span class="estado-pill">${ESTADO_INFO[s.estado] || esc(s.etiqueta)}</span>`;
  else {
    cuerpo = s.platos.map((p) => `<div class="plato">
      <span class="nombre">${esc(p.nombre)}</span>${p.para?.length ? `<span class="para">${esc(p.paraNombres.join(', '))}</span>` : ''}
      ${p.guarniciones?.length ? `<div class="det">con ${esc(p.guarniciones.join(' · '))}</div>` : ''}
    </div>`).join('');
  }
  const extras = `${s?.invitados ? `<span class="invit">👥 +${s.invitados}</span>` : ''}${s?.hecho ? ' <span class="hecho">✓ Hecho</span>' : ''}`;
  return `<button class="slot" data-fecha="${fecha}" data-comida="${comida}">
    <span class="que" title="${COMIDA_NOMBRE[comida]}">${COMIDA_ICONO[comida]}</span>
    <span class="cuerpo">${cuerpo}${extras ? `<div>${extras}</div>` : ''}</span>
  </button>`;
}

// ---------- hoja de un espacio (día + comida) ----------
async function hojaSlot(fecha, comida, opciones = {}) {
  const sem = await api('GET', `/semana?fecha=${fecha}`);
  const dia = sem.dias.find((d) => d.fecha === fecha);
  const s = dia.comidas[comida] || { platos: [], estado: null, invitados: 0, hecho: false };
  const modo = opciones.modo || 'cambiar';
  const paraNuevo = opciones.para || [];
  const excluir = opciones.excluir || [];

  const sheet = abrirSheet(`
    <div class="sheet-tit"><h2>${esc(dia.dia)} ${diaNum(fecha)} · ${COMIDA_NOMBRE[comida]}</h2><button class="icono" data-cerrar>✕</button></div>
    ${s.platos.length ? `<h3>Planeado</h3>${s.platos.map((p, i) => `
      <div class="tarjeta" style="padding:10px">
        <div class="fila"><div class="flex"><b>${esc(p.nombre)}</b>${p.para?.length ? `<span class="para">${esc(p.paraNombres.join(', '))}</span>` : ''}
          ${p.guarniciones?.length ? `<div class="ayuda">con ${esc(p.guarniciones.join(' · '))}</div>` : ''}</div>
          ${s.hecho ? '' : `<button class="quitar" data-quitar="${i}" aria-label="Quitar">✕</button>`}
        </div>
      </div>`).join('')}` : ''}
    ${s.platos.length && !s.hecho && fecha <= hoyISO() ? '<button class="btn ancho" data-hecho style="margin:4px 0 8px">✅ Ya lo cociné</button>' : ''}
    ${s.hecho ? '<button class="btn sec ancho" data-deshacer style="margin:4px 0 8px">↩️ Desmarcar "hecho"</button>' : ''}

    ${s.hecho ? '' : `
    <h3>Sugerencias</h3>
    ${s.platos.length ? `<div class="seg">
      <button data-modo="cambiar" class="${modo === 'cambiar' ? 'on' : ''}">Cambiar platillo</button>
      <button data-modo="agregar" class="${modo === 'agregar' ? 'on' : ''}">+ Otro para…</button>
    </div>` : ''}
    ${modo === 'agregar' ? `<div class="ayuda" style="margin-bottom:6px">¿Para quién es el otro platillo?</div>
      <div class="chips" id="para-nuevo">
        <button class="chip" data-grupo="ninos">👧 Niños</button>
        <button class="chip" data-grupo="adultos">🧑 Adultos</button>
        ${estado.personas.map((p) => `<button class="chip ${paraNuevo.includes(p.id) ? 'on' : ''}" data-persona="${p.id}">${esc(p.emoji)} ${esc(p.nombre)}</button>`).join('')}
      </div>` : ''}
    <div id="sugs"><div class="cargando">Pensando…</div></div>
    <div class="fila" style="gap:8px;margin-bottom:6px">
      <button class="btn sec chico" data-otras>🔄 Otras opciones</button>
      <button class="btn sec chico" data-rapido>⚡ Solo rápidas</button>
    </div>
    <input class="buscar" id="buscar-plat" placeholder="🔍 Buscar en mi lista…" style="margin-top:8px">
    <div id="res-busqueda"></div>

    <h3>O este día…</h3>
    <div class="estados">${ESTADOS.map(([k, e, t]) => `<button data-estado="${k}" class="${s.estado === k ? 'on' : ''}"><span>${e}</span>${t}</button>`).join('')}
      <button data-estado=""><span>🗑️</span>Vaciar</button></div>
    `}
    <h3>Invitados</h3>
    <div class="stepper"><button data-inv="-1">−</button><b id="inv">${s.invitados || 0}</b><button data-inv="1">+</button><span class="ayuda">personas extra</span></div>
  `);

  const recargar = (o = {}) => hojaSlot(fecha, comida, { modo, para: paraNuevo, excluir, ...o });
  const guardar = async (cuerpo) => { await api('PUT', `/plan/${fecha}/${comida}`, cuerpo); vistaSemana(); };
  const paraSeleccion = () => [...sheet.querySelectorAll('#para-nuevo [data-persona].on')].map((b) => b.dataset.persona);

  sheet.querySelector('[data-cerrar]').addEventListener('click', cerrarSheet);
  sheet.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', async () => { await guardar({ quitarPlato: Number(b.dataset.quitar) }); recargar({ modo: 'cambiar' }); }));
  sheet.querySelector('[data-hecho]')?.addEventListener('click', () => hojaHecho(fecha, comida, s));
  sheet.querySelector('[data-deshacer]')?.addEventListener('click', async () => {
    await api('DELETE', `/plan/${fecha}/${comida}/hecho`); vistaSemana(); recargar();
  });
  sheet.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => recargar({ modo: b.dataset.modo })));
  sheet.querySelectorAll('#para-nuevo [data-persona]').forEach((b) => b.addEventListener('click', () => { b.classList.toggle('on'); cargarSugs(); }));
  sheet.querySelectorAll('#para-nuevo [data-grupo]').forEach((b) => b.addEventListener('click', () => {
    const esNino = b.dataset.grupo === 'ninos';
    sheet.querySelectorAll('#para-nuevo [data-persona]').forEach((x) => {
      const p = nombrePersona(x.dataset.persona);
      x.classList.toggle('on', (p.rol === 'nino') === esNino);
    });
    cargarSugs();
  }));
  sheet.querySelectorAll('[data-inv]').forEach((b) => b.addEventListener('click', async () => {
    const n = Math.max(0, Number($('#inv').textContent) + Number(b.dataset.inv));
    $('#inv').textContent = n;
    await guardar({ invitados: n });
  }));
  sheet.querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', async () => {
    await guardar({ estado: b.dataset.estado || null });
    cerrarSheet();
  }));

  let soloRapido = false;
  let mostrados = [...excluir];
  async function cargarSugs(extraExcluir = []) {
    const cont = sheet.querySelector('#sugs');
    if (!cont) return;
    const para = modo === 'agregar' ? paraSeleccion() : [];
    const qs = new URLSearchParams({ fecha, comida, cantidad: 3, rapido: soloRapido });
    const excl = [...extraExcluir, ...s.platos.map((p) => p.platilloId)];
    if (excl.length) qs.set('excluir', excl.join(','));
    if (para.length) qs.set('para', para.join(','));
    const sugs = await api('GET', `/sugerencias?${qs}`);
    mostrados = [...new Set([...extraExcluir, ...sugs.map((x) => x.platillo.id)])];
    cont.innerHTML = sugs.length ? sugs.map((x) => `
      <button class="sug" data-elegir="${x.platillo.id}">
        <div class="nombre">${CAT_ICONO[x.platillo.categoria] || '🍽️'} ${esc(x.platillo.nombre)}</div>
        <div class="razones">${esc(x.razones.join(' · '))}</div>
        ${x.faltan?.length && x.faltan.length <= 4 ? `<div class="razones">Falta: ${esc(x.faltan.join(', '))}</div>` : ''}
        ${modo !== 'agregar' && x.puntajeNinos != null && x.puntajeNinos < 3 ? '<div class="aviso">A los niños no les encanta — puedes agregar otro para ellos</div>' : ''}
      </button>`).join('') : '<p class="ayuda">No hay más sugerencias con esos filtros.</p>';
    cont.querySelectorAll('[data-elegir]').forEach((b) => b.addEventListener('click', () => elegir(b.dataset.elegir)));
  }
  async function elegir(platilloId) {
    if (modo === 'agregar') {
      const para = paraSeleccion();
      if (!para.length) return toast('Primero elige para quién es');
      await guardar({ platillo: platilloId, modo: 'agregar', para });
    } else {
      await guardar({ platillo: platilloId, modo: 'reemplazar' });
    }
    toast('Listo 👍');
    cerrarSheet();
  }
  sheet.querySelector('[data-otras]')?.addEventListener('click', () => cargarSugs(mostrados));
  sheet.querySelector('[data-rapido]')?.addEventListener('click', (e) => { soloRapido = !soloRapido; e.target.classList.toggle('rosa', soloRapido); e.target.classList.toggle('sec', !soloRapido); cargarSugs(); });

  const buscar = sheet.querySelector('#buscar-plat');
  let todos = null;
  buscar?.addEventListener('input', async () => {
    todos ||= await api('GET', `/platillos?tipo=${comida}`);
    const t = normalizar(buscar.value);
    const res = t ? todos.filter((p) => normalizar(p.nombre).includes(t)).slice(0, 8) : [];
    sheet.querySelector('#res-busqueda').innerHTML = res.map((p) => `<button class="lista-item" data-elegir="${p.id}">
      <span class="cat">${CAT_ICONO[p.categoria] || '🍽️'}</span><span class="flex nombre">${esc(p.nombre)}</span>
      ${p.stats.puntaje ? `<span class="puntaje">★ ${p.stats.puntaje}</span>` : ''}</button>`).join('')
      || (t ? `<button class="lista-item" data-nuevo><span class="cat">➕</span><span class="flex">Crear “${esc(buscar.value)}”</span></button>` : '');
    sheet.querySelectorAll('#res-busqueda [data-elegir]').forEach((b) => b.addEventListener('click', () => elegir(b.dataset.elegir)));
    sheet.querySelector('#res-busqueda [data-nuevo]')?.addEventListener('click', () => hojaPlatillo(null, { nombre: buscar.value, tipos: [comida] }));
  });

  if (!s.hecho) cargarSugs(excluir);
}

// ---------- marcar como hecho + calificar ----------
async function hojaHecho(fecha, comida, s) {
  const detalles = await Promise.all(s.platos.map((p) => api('GET', `/platillos/${p.platilloId}`)));
  const ingredientes = [...new Set(detalles.flatMap((d) => d.ingredientes || []))];
  const sheet = abrirSheet(`
    <div class="sheet-tit"><h2>¿Qué tal estuvo? 😋</h2><button class="icono" data-cerrar>✕</button></div>
    ${detalles.map((d, i) => {
      const para = s.platos[i].para?.length ? s.platos[i].para : estado.personas.map((p) => p.id);
      return `<div class="tarjeta" data-plat="${d.id}"><b>${esc(d.nombre)}</b>
        ${para.map((pid) => { const per = nombrePersona(pid); if (!per) return '';
          return `<div class="persona-estrellas"><span>${esc(per.emoji)} ${esc(per.nombre)}</span>${estrellasHtml(d.calificaciones?.[pid], `data-persona="${pid}" data-valor="${d.calificaciones?.[pid] || 0}"`)}</div>`; }).join('')}
      </div>`;
    }).join('')}
    ${ingredientes.length ? `<h3>¿Se acabó algo?</h3><div class="ayuda" style="margin-bottom:6px">Lo quito de tu refri</div>
      <div class="chips">${ingredientes.map((i) => `<button class="chip" data-acabo="${esc(i)}">${esc(i)}</button>`).join('')}</div>` : ''}
    <button class="btn ancho" data-guardar style="margin-top:8px">Guardar ✅</button>`);
  sheet.querySelector('[data-cerrar]').addEventListener('click', cerrarSheet);
  sheet.querySelectorAll('[data-acabo]').forEach((b) => b.addEventListener('click', () => b.classList.toggle('on')));
  sheet.querySelector('[data-guardar]').addEventListener('click', async () => {
    const calificaciones = {};
    sheet.querySelectorAll('[data-plat]').forEach((t) => {
      const porPersona = {};
      t.querySelectorAll('[data-persona]').forEach((e) => { if (Number(e.dataset.valor)) porPersona[e.dataset.persona] = Number(e.dataset.valor); });
      if (Object.keys(porPersona).length) calificaciones[t.dataset.plat] = porPersona;
    });
    const seAcabo = [...sheet.querySelectorAll('[data-acabo].on')].map((b) => b.dataset.acabo);
    await api('POST', `/plan/${fecha}/${comida}/hecho`, { calificaciones, seAcabo });
    cerrarSheet(); toast('¡Guardado! ⭐'); vistaSemana();
  });
}

// =====================================================================
// PLATILLOS
// =====================================================================
let filtroPlat = { texto: '', tipo: '', categoria: '' };
async function vistaPlatillos() {
  const app = $('#app');
  app.innerHTML = `
    <div class="cabecera"><h1>Mis platillos</h1><button class="btn chico" data-nuevo>+ Nuevo</button></div>
    <input class="buscar" id="q" placeholder="🔍 Buscar por nombre o ingrediente" value="${esc(filtroPlat.texto)}">
    <div class="chips scroll" id="f-tipo">
      <button class="chip ${!filtroPlat.tipo && !filtroPlat.categoria ? 'on' : ''}" data-f="">Todos</button>
      <button class="chip ${filtroPlat.tipo === 'desayuno' ? 'on' : ''}" data-f="tipo:desayuno">☀️ Desayunos</button>
      ${CATEGORIAS.filter((c) => c !== 'desayuno').map((c) => `<button class="chip ${filtroPlat.categoria === c ? 'on' : ''}" data-f="categoria:${c}">${CAT_ICONO[c]} ${c}</button>`).join('')}
    </div>
    <div class="sub" style="margin-bottom:8px">Ordenar: <select id="orden" class="chip">
      <option value="nombre">Nombre</option><option value="puntaje">⭐ Más gustados</option><option value="veces">🔁 Más hechos</option><option value="olvidados">💤 Más olvidados</option>
    </select></div>
    <div id="lista"><div class="cargando">Cargando…</div></div>`;
  app.querySelector('[data-nuevo]').addEventListener('click', () => hojaPlatillo(null));
  app.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
    const [k, v] = b.dataset.f.split(':');
    filtroPlat = { texto: filtroPlat.texto, tipo: '', categoria: '' };
    if (k) filtroPlat[k] = v;
    vistaPlatillos();
  }));
  const orden = app.querySelector('#orden');
  orden.value = lsGet('orden') || 'nombre';
  let todos = await api('GET', `/platillos?${new URLSearchParams({ tipo: filtroPlat.tipo, categoria: filtroPlat.categoria })}`);
  if (estado.tab !== 'platillos') return;
  const pintar = () => {
    const t = normalizar(filtroPlat.texto);
    let l = todos.filter((p) => !t || normalizar(p.nombre).includes(t) || p.ingredientes.some((i) => normalizar(i).includes(t)));
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
    $('#lista').querySelectorAll('[data-id]').forEach((b) => b.addEventListener('click', () => hojaPlatillo(b.dataset.id)));
  };
  app.querySelector('#q').addEventListener('input', (e) => { filtroPlat.texto = e.target.value; pintar(); });
  orden.addEventListener('change', () => { lsSet('orden', orden.value); pintar(); });
  pintar();
}

async function hojaPlatillo(id, base = {}) {
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
      <h3>¿Cuánto les gusta?</h3>
      ${estado.personas.map((per) => `<div class="persona-estrellas"><span>${esc(per.emoji)} ${esc(per.nombre)}</span>${estrellasHtml(p.calificaciones?.[per.id], `data-persona="${per.id}" data-valor="${p.calificaciones?.[per.id] || 0}"`)}</div>`).join('')}
      <button class="btn ancho" style="margin-top:14px">Guardar</button>
      ${id ? '<button type="button" class="btn peligro ancho" data-borrar style="margin-top:6px">Borrar platillo</button>' : ''}
    </form>`);
  sheet.querySelector('[data-cerrar]').addEventListener('click', cerrarSheet);
  sheet.querySelectorAll('#tipos .chip, #etiquetas .chip').forEach((b) => b.addEventListener('click', () => b.classList.toggle('on')));
  sheet.querySelector('[data-borrar]')?.addEventListener('click', async () => {
    if (!confirm(`¿Borrar "${p.nombre}"? Su historial se queda pero ya no aparecerá en sugerencias.`)) return;
    await api('DELETE', `/platillos/${id}`); cerrarSheet(); toast('Borrado'); vistaActual();
  });
  sheet.querySelector('#f-plat').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const datos = {
      nombre: f.get('nombre'), categoria: f.get('categoria'), tiempo: f.get('tiempo'),
      ingredientes: f.get('ingredientes'), guarniciones: f.get('guarniciones'), notas: f.get('notas'),
      tipos: [...sheet.querySelectorAll('#tipos .on')].map((b) => b.dataset.t),
      etiquetas: [...sheet.querySelectorAll('#etiquetas .on')].map((b) => b.dataset.e),
    };
    if (!datos.tipos.length) return toast('Elige al menos desayuno, comida o cena');
    const guardado = id ? await api('PATCH', `/platillos/${id}`, datos) : await api('POST', '/platillos', datos);
    const estrellas = {};
    sheet.querySelectorAll('[data-persona]').forEach((el) => {
      const v = Number(el.dataset.valor);
      if (v !== (p.calificaciones?.[el.dataset.persona] || 0)) estrellas[el.dataset.persona] = v;
    });
    if (Object.keys(estrellas).length) await api('POST', `/platillos/${guardado.id}/calificar`, { estrellas });
    cerrarSheet(); toast('Guardado ✨'); vistaActual();
  });
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
    <form id="f-ing" class="fila" style="margin-bottom:6px"><input class="buscar" name="n" placeholder="Agregar otro ingrediente…" style="margin:0"><button class="btn chico">+</button></form>
    <div id="refri"><div class="cargando">Cargando…</div></div>`;
  const items = await api('GET', '/refri');
  if (estado.tab !== 'refri') return;
  const secciones = { carniceria: '🥩 Carnicería', verdura: '🥬 Verdura y fruta', super: '🛒 Súper' };
  $('#refri').innerHTML = Object.entries(secciones).map(([k, t]) => {
    const l = items.filter((i) => i.seccion === k);
    return l.length ? `<h3>${t}</h3><div class="chips">${l.map((i) => `<button class="chip verde ${i.tengo ? 'on' : ''}" data-ing="${esc(i.nombre)}">${esc(i.nombre)}</button>`).join('')}</div>` : '';
  }).join('');
  $('#refri').querySelectorAll('[data-ing]').forEach((b) => b.addEventListener('click', async () => {
    const on = !b.classList.contains('on');
    b.classList.toggle('on', on);
    await api('POST', '/refri', on ? { tengo: [b.dataset.ing] } : { seAcabo: [b.dataset.ing] });
  }));
  $('#f-ing').addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = e.target.n.value.trim();
    if (!n) return;
    await api('POST', '/refri', { tengo: [n] }); vistaRefri();
  });
  app.querySelector('[data-quehago]').addEventListener('click', async () => {
    const res = await api('GET', '/refri/que-hago?comida=comida');
    const sheet = abrirSheet(`<div class="sheet-tit"><h2>Con lo que tienes…</h2><button class="icono" data-cerrar>✕</button></div>
      ${res.length ? res.map((r) => `<div class="tarjeta"><div class="fila"><div class="flex"><b>${esc(r.platillo)}</b>
        <div class="ayuda">Tienes ${r.tienes} de ${r.total}${r.faltan.length ? ` · falta: ${esc(r.faltan.join(', '))}` : ' · ¡tienes todo! 🎉'}</div></div>
        <button class="btn chico" data-hoy="${r.id}">Hoy</button></div></div>`).join('') : '<p class="vacio-grande">Marca primero lo que tienes en el refri 🙂</p>'}`);
    sheet.querySelector('[data-cerrar]').addEventListener('click', cerrarSheet);
    sheet.querySelectorAll('[data-hoy]').forEach((b) => b.addEventListener('click', async () => {
      await api('PUT', `/plan/${hoyISO()}/comida`, { platillo: b.dataset.hoy });
      cerrarSheet(); toast('Puesto para la comida de hoy 👍');
    }));
  });
}

// =====================================================================
// SÚPER
// =====================================================================
async function vistaSuper() {
  const app = $('#app');
  app.innerHTML = '<div class="cargando">Cargando…</div>';
  const l = await api('GET', `/compras?fecha=${estado.fecha}`);
  if (estado.tab !== 'super') return;
  const iconos = { carniceria: '🥩', verdura: '🥬', super: '🛒' };
  const total = Object.values(l.secciones).flat();
  app.innerHTML = `<div class="cabecera"><h1>Lista del súper</h1>${navigator.share ? '<button class="icono" data-compartir aria-label="Compartir">📤</button>' : ''}</div>
    <p class="sub" style="margin-top:-6px">Semana del ${diaNum(l.semana)} ${mesCorto(l.semana)} · sin lo que ya tienes en el refri</p>
    <form id="f-extra" class="fila" style="margin-bottom:10px">
      <input class="buscar" name="n" placeholder="Agregar (papel de baño, leche…)" style="margin:0">
      <button class="btn chico">+</button>
    </form>
    ${total.length ? Object.entries(l.secciones).map(([k, items]) => items.length ? `<div class="tarjeta"><h3 style="margin-top:0">${iconos[k]} ${esc(l.nombresSecciones[k])}</h3>
      ${items.map((i) => `<label class="compra ${i.marcado ? 'marcado' : ''}">
        <input type="checkbox" data-c="${esc(i.nombre)}" ${i.marcado ? 'checked' : ''}>
        <span class="flex"><span class="nombre">${esc(i.nombre)}</span>${i.para ? `<div class="det">${esc(i.para.join(', '))}</div>` : ''}</span>
        ${i.extra ? `<button type="button" class="quitar" data-q="${esc(i.nombre)}" aria-label="Quitar">✕</button>` : ''}
      </label>`).join('')}</div>` : '').join('') : '<div class="vacio-grande">Planea tu semana y aquí aparece lo que hay que comprar 🛒</div>'}`;
  app.querySelectorAll('[data-c]').forEach((c) => c.addEventListener('change', async () => {
    c.closest('.compra').classList.toggle('marcado', c.checked);
    await api('POST', '/compras/marcar', { fecha: estado.fecha, nombre: c.dataset.c, marcado: c.checked });
  }));
  app.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault();
    await api('DELETE', `/compras/${encodeURIComponent(b.dataset.q)}?fecha=${estado.fecha}`); vistaSuper();
  }));
  $('#f-extra').addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = e.target.n.value.trim();
    if (!n) return;
    await api('POST', '/compras', { fecha: estado.fecha, nombre: n }); vistaSuper();
  });
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
      <div class="chips" id="dias">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button class="chip ${config.diasCocina.includes(d) ? 'on' : ''}" data-d="${d}">${DIAS_CORTOS[d]}</button>`).join('')}</div>
      <h3>🍽️ Qué planeo</h3>
      <div class="chips" id="comidas">${['desayuno', 'comida', 'cena'].map((c) => `<button class="chip ${config.comidasActivas.includes(c) ? 'on' : ''}" data-c="${c}">${COMIDA_ICONO[c]} ${COMIDA_NOMBRE[c]}</button>`).join('')}</div>
    </div>
    <div class="tarjeta"><h3 style="margin-top:0">📜 Últimos 30 días</h3>
      ${hist.length ? hist.map((h) => `<div class="fila" style="padding:4px 0"><span class="ayuda" style="width:84px">${h.dia.slice(0, 3)} ${diaNum(h.fecha)} ${mesCorto(h.fecha)}</span><span class="flex">${COMIDA_ICONO[h.comida]} ${esc(h.platillo)}</span></div>`).join('') : '<p class="ayuda">Aquí aparece lo que vayas marcando como “Ya lo cociné”.</p>'}
    </div>
    <div class="tarjeta"><h3 style="margin-top:0">🟣 Conectar con Muse</h3>
      <p class="ayuda">Escríbele a Muse algo como:</p>
      <p style="font-size:.9rem;background:var(--lila-claro);border-radius:12px;padding:10px">“Crea un conector a mi app de comidas. Es un servidor MCP por HTTP en <code>${esc(base)}/mcp</code>, con autenticación bearer token. Pruébalo y guárdalo como skill.”</p>
      <p class="ayuda">Cuando te pida el token, escribe tu clave <b>en el aviso seguro de Muse</b>, no en el chat. Documentación de la API: <code>${esc(base)}/openapi.json</code></p>
    </div>
    <button class="btn peligro ancho" data-salir>Cerrar sesión en este teléfono</button>`;

  app.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => hojaPersona(personas.find((p) => p.id === b.dataset.editar))));
  app.querySelector('[data-agregar]').addEventListener('click', () => hojaPersona(null));
  const guardarConfig = async () => {
    const diasCocina = [...app.querySelectorAll('#dias .on')].map((b) => Number(b.dataset.d));
    const comidasActivas = [...app.querySelectorAll('#comidas .on')].map((b) => b.dataset.c);
    if (!comidasActivas.length) return toast('Deja al menos una comida');
    estado.config = await api('PUT', '/config', { diasCocina, comidasActivas });
    toast('Guardado');
  };
  app.querySelectorAll('#dias .chip, #comidas .chip').forEach((b) => b.addEventListener('click', () => { b.classList.toggle('on'); guardarConfig(); }));
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
  sheet.querySelector('[data-cerrar]').addEventListener('click', cerrarSheet);
  sheet.querySelector('#f-per').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const datos = { nombre: f.get('nombre'), emoji: f.get('emoji'), rol: f.get('rol') };
    if (p) datos.activo = f.get('activo') === 'on';
    if (p) await api('PATCH', `/personas/${p.id}`, datos); else await api('POST', '/personas', datos);
    estado.personas = await api('GET', '/personas');
    cerrarSheet(); vistaMas();
  });
}

iniciar();
