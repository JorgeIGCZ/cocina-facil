import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { crearCocina, hoyISO, inicioSemana, sumarDias } from '../src/domain.js';
import { sembrar } from '../src/seed.js';
import { crearStore } from '../src/store.js';

async function preparar(t) {
  const dir = await mkdtemp(join(tmpdir(), 'mi-cocina-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const prev = { ...process.env };
  process.env.NODE_ENV = 'test';
  process.env.DB_DRIVER = 'file';
  process.env.DATA_FILE = join(dir, 'db.json');
  t.after(() => {
    for (const name of ['NODE_ENV', 'DB_DRIVER', 'DATA_FILE']) {
      if (prev[name] === undefined) delete process.env[name];
      else process.env[name] = prev[name];
    }
  });
  const store = crearStore();
  await store.init();
  const cocina = crearCocina(store);
  await store.atomic((tx) => sembrar(tx, crearCocina(tx)));
  return { store, cocina };
}

const siguienteLunes = () => sumarDias(inicioSemana(), 7);
const comida = (fecha = hoyISO()) => ({ fecha, comida: 'comida' });
const espacio = async (cocina, fecha = hoyISO()) => (await cocina.obtenerSemana(fecha)).dias.find((d) => d.fecha === fecha).comidas.comida;

test('registrar una comida revierte estados, estrellas y refri si alguna calificación falla', async (t) => {
  const { cocina } = await preparar(t);
  const tinga = await cocina.obtenerPlatillo('Tinga');
  const tacos = await cocina.obtenerPlatillo('Tacos dorados');
  const [mama] = await cocina.listarPersonas();
  await cocina.actualizarRefri({ tengo: ['jitomate'] });
  await cocina.asignar({ ...comida(), platillo: tinga.id });
  await cocina.asignar({ ...comida(), platillo: tacos.id, modo: 'agregar', para: ['niños'] });
  await assert.rejects(cocina.marcarHecho({
    ...comida(), seAcabo: ['jitomate'], calificaciones: { [tinga.id]: { [mama.id]: 5 }, [tacos.id]: { [mama.id]: 6 } },
  }), /estrellas/);
  assert.equal((await espacio(cocina)).hecho, false);
  assert.deepEqual(await cocina.listarHistorial(), []);
  assert.deepEqual((await cocina.obtenerPlatillo(tinga.id)).calificaciones, {});
  assert.equal((await cocina.listarRefri()).find((i) => i.id === 'jitomate').tengo, true);

  await cocina.marcarHecho({ ...comida(), seAcabo: ['jitomate'], calificaciones: { [tinga.id]: { [mama.id]: 5 } } });
  await cocina.marcarHecho(comida());
  await assert.rejects(cocina.asignar({ ...comida(), platillo: 'Chuletas' }), /Desmarca/);
  assert.equal((await espacio(cocina)).platos[0].nombre, 'Tinga');
  const reabierto = crearStore();
  await reabierto.init();
  const otra = crearCocina(reabierto);
  assert.equal((await otra.listarHistorial()).length, 2);
  assert.equal((await otra.obtenerPlatillo(tinga.id)).stats.puntaje, 5);
  assert.equal((await otra.listarRefri()).find((i) => i.id === 'jitomate').tengo, false);
  await cocina.desmarcarHecho(comida());
  assert.equal((await espacio(cocina)).hecho, false);
  assert.deepEqual(await cocina.listarHistorial(), []);
});

test('dos operaciones de la web y Muse conservan sus estrellas y sus marcas de compras', async (t) => {
  const { cocina } = await preparar(t);
  const [mama, papa] = await cocina.listarPersonas();
  await cocina.agregarCompra({ nombre: ['jabón', 'papel de baño'] });
  await Promise.all([
    cocina.calificar('Tinga', { [mama.id]: 5 }),
    cocina.calificar('Tinga', { [papa.id]: 4 }),
    cocina.marcarCompra({ nombre: 'jabón' }),
    cocina.marcarCompra({ nombre: 'papel de baño' }),
  ]);
  assert.deepEqual((await cocina.obtenerPlatillo('Tinga')).calificaciones, { [mama.id]: 5, [papa.id]: 4 });
  assert.equal((await cocina.listaCompras()).secciones.super.filter((i) => i.marcado).length, 2);
});

test('llenar respeta espacios libres y rehacer protege estados especiales y platos separados', async (t) => {
  const { store, cocina } = await preparar(t);
  const fecha = siguienteLunes();
  const martes = sumarDias(fecha, 1);
  const miercoles = sumarDias(fecha, 2);
  await cocina.asignar({ ...comida(fecha), platillo: 'Tinga', invitados: 2 });
  await cocina.asignar({ ...comida(fecha), quitarPlato: 0 });
  assert.equal((await espacio(cocina, fecha)).estado, null);
  await cocina.asignar({ ...comida(martes), estado: 'fuera' });
  await cocina.asignar({ ...comida(miercoles), platillo: 'Tinga' });
  await cocina.asignar({ ...comida(miercoles), platillo: 'Tacos dorados', modo: 'agregar', para: ['niños'] });
  const antes = await espacio(cocina, miercoles);
  await cocina.asignar({ ...comida(miercoles), platillo: 'Chuletas', reemplazarPlato: 1, platilloEsperado: antes.platos[1].platilloId, guarniciones: ['arroz'] });
  const separados = await espacio(cocina, miercoles);
  assert.deepEqual(separados.platos[0], antes.platos[0]);
  assert.deepEqual(separados.platos[1].para, antes.platos[1].para);
  await assert.rejects(cocina.asignar({ ...comida(miercoles), quitarPlato: 1, platilloEsperado: antes.platos[1].platilloId }), /cambió/);

  // Formato que guardaba la versión anterior al quitar el último platillo.
  const jueves = sumarDias(fecha, 3);
  const id = `${jueves}_comida`;
  await store.put('plan', id, { id, ...comida(jueves), estado: 'cocinar', platos: [], hecho: false, nota: '' });
  assert.equal((await espacio(cocina, jueves)).estado, null);
  let lecturas = 0;
  const atomic = store.atomic;
  store.atomic = (fn) => atomic((tx) => fn({
    ...tx,
    all(...args) { lecturas += 1; return tx.all(...args); },
    get(...args) { lecturas += 1; return tx.get(...args); },
  }));
  const llenado = await cocina.armarSemana({ fecha });
  assert(llenado.llenados.some((x) => x.fecha === fecha && x.comida === 'comida'));
  assert(llenado.llenados.some((x) => x.fecha === jueves && x.comida === 'comida'));
  assert.equal((await espacio(cocina, fecha)).invitados, 2);
  assert(lecturas <= 7, `El plan hizo ${lecturas} lecturas`);
  await cocina.armarSemana({ fecha, reemplazar: true });
  assert.equal((await espacio(cocina, martes)).estado, 'fuera');
  assert.deepEqual(await espacio(cocina, miercoles), separados);
  await assert.rejects(cocina.asignar({ ...comida(fecha), platillo: 'Tinga', soloSiVacio: true }), /Ya hay algo/);
});

test('archivar conserva el plan y el historial, y el nombre ambiguo requiere aclaración', async (t) => {
  const { cocina } = await preparar(t);
  const fecha = siguienteLunes();
  const dish = await cocina.obtenerPlatillo('Bistec ranchero (entomatado)');
  await assert.rejects(cocina.obtenerPlatillo('Bistec'), /varias opciones/);
  await cocina.asignar({ ...comida(), platillo: dish.id });
  await cocina.marcarHecho(comida());
  await cocina.asignar({ ...comida(fecha), platillo: dish.id });
  const r = await cocina.archivarPlatillo(dish.id);
  assert.deepEqual(r.usosFuturos, [comida(fecha)]);
  assert.equal((await espacio(cocina, fecha)).platos[0].nombre, dish.nombre);
  assert.equal((await cocina.listarHistorial())[0].platillo, dish.nombre);
  assert(!(await cocina.listarPlatillos()).some((p) => p.id === dish.id));
  await assert.rejects(cocina.asignar({ ...comida(sumarDias(fecha, 1)), platillo: dish.id }), /archivado/);
  await cocina.archivarPlatillo(dish.id, false);
  assert((await cocina.listarPlatillos()).some((p) => p.id === dish.id));
});

test('los alias de datos previos se agrupan y solo los alimentos comprados pasan al refri', async (t) => {
  const { store, cocina } = await preparar(t);
  const fecha = siguienteLunes();
  await store.put('refri', 'm/p (muslo con pierna)', { id: 'm/p (muslo con pierna)', nombre: 'm/p (muslo con pierna)', tengo: true });
  await cocina.asignar({ ...comida(fecha), platillo: 'Pollo enchilado', guarniciones: ['arroz'] });
  const items = async () => Object.values((await cocina.listaCompras({ fecha })).secciones).flat();
  assert(!(await items()).some((i) => i.id === 'muslo con pierna'));
  const p = await cocina.obtenerPlatillo('Pollo enchilado');
  assert.equal(p.stats.tienes, 1);
  await cocina.actualizarRefri({ seAcabo: ['muslo con pierna'] });
  await cocina.agregarCompra({ fecha, nombre: ['m/p', 'papel de baño'] });
  assert.equal((await items()).filter((i) => i.id === 'muslo con pierna').length, 1);
  assert((await items()).some((i) => i.id === 'arroz'));
  for (const nombre of ['muslo con pierna', 'arroz', 'papel de baño']) await cocina.marcarCompra({ fecha, nombre });
  await cocina.asignar({ ...comida(fecha), reemplazarPlato: 0, guarniciones: [] });
  assert((await items()).some((i) => i.id === 'arroz' && i.marcado));
  assert.deepEqual((await cocina.pasarComprasAlRefri({ fecha })).agregados.sort(), ['arroz', 'muslo con pierna']);
  const restantes = await items();
  assert(restantes.some((i) => i.id === 'papel de bano' && i.marcado));
  assert(!restantes.some((i) => i.id === 'arroz' || i.id === 'muslo con pierna'));
  await cocina.actualizarRefri({ seAcabo: ['m/p'] });
  assert((await items()).some((i) => i.id === 'muslo con pierna' && !i.marcado));
});

test('las fechas inexistentes y los registros futuros se rechazan', async (t) => {
  const { cocina } = await preparar(t);
  for (const fecha of ['2026-02-30', '2026-13-01']) {
    await assert.rejects(cocina.obtenerSemana(fecha), /Fecha inválida/);
    await assert.rejects(cocina.marcarCompra({ fecha, nombre: 'arroz' }), /Fecha inválida/);
  }
  const fecha = siguienteLunes();
  await cocina.asignar({ ...comida(fecha), platillo: 'Tinga' });
  await assert.rejects(cocina.marcarHecho(comida(fecha)), /futura/);
});
