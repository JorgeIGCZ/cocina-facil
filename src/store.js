// Almacenamiento de documentos: { coleccion, id } -> objeto JSON.
// Driver "file" para desarrollo local (data/db.json) y "mysql" para Hostinger.
import fs from 'node:fs/promises';
import path from 'node:path';

const COLECCIONES = ['personas', 'platillos', 'historial', 'plan', 'refri', 'compras', 'config'];

function crearFileStore(archivo) {
  let datos = null;
  let escribiendo = Promise.resolve();
  let cargando;
  const cargar = () => cargando ??= (async () => {
    try { datos = JSON.parse(await fs.readFile(archivo, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; datos = {}; }
    for (const col of COLECCIONES) datos[col] ??= {};
  })();

  const documentos = (leer) => ({
    async all(col) { return Object.values(leer()[col]).map(clonar); },
    async get(col, id) {
      const items = leer()[col];
      return Object.hasOwn(items, id) ? clonar(items[id]) : null;
    },
    async put(col, id, doc) {
      Object.defineProperty(leer()[col], id, { value: clonar(doc), enumerable: true, writable: true, configurable: true });
      return doc;
    },
    async del(col, id) {
      const items = leer()[col];
      if (!Object.hasOwn(items, id)) return false;
      return delete items[id];
    },
  });
  const leer = documentos(() => datos);
  const atomic = (fn) => {
    const operacion = escribiendo.then(async () => {
      await cargar();
      const copia = clonar(datos);
      const resultado = await fn(documentos(() => copia));
      const contenido = JSON.stringify(copia, null, 1);
      if (contenido !== JSON.stringify(datos, null, 1)) {
        await fs.mkdir(path.dirname(archivo), { recursive: true });
        const tmp = `${archivo}.tmp`;
        await fs.writeFile(tmp, contenido);
        await fs.rename(tmp, archivo);
        datos = copia;
      }
      return resultado;
    });
    escribiendo = operacion.catch(() => {});
    return operacion;
  };

  return {
    init: cargar,
    async all(col) { await cargar(); return leer.all(col); },
    async get(col, id) { await cargar(); return leer.get(col, id); },
    put: (...args) => atomic((tx) => tx.put(...args)),
    del: (...args) => atomic((tx) => tx.del(...args)),
    atomic,
  };
}

function documentosMysql(execute) {
  return {
    async all(col) {
      const [rows] = await execute('SELECT data FROM docs WHERE col = ?', [col]);
      return rows.map((r) => JSON.parse(r.data));
    },
    async get(col, id) {
      const [rows] = await execute('SELECT data FROM docs WHERE col = ? AND id = ?', [col, id]);
      return rows[0] ? JSON.parse(rows[0].data) : null;
    },
    async put(col, id, doc) {
      await execute(
        'INSERT INTO docs (col, id, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
        [col, id, JSON.stringify(doc)],
      );
      return doc;
    },
    async del(col, id) {
      const [r] = await execute('DELETE FROM docs WHERE col = ? AND id = ?', [col, id]);
      return r.affectedRows > 0;
    },
  };
}

function crearMysqlStore() {
  let pool;
  return {
    ...documentosMysql((...args) => pool.execute(...args)),
    async init() {
      const mysql = (await import('mysql2/promise')).default;
      pool = mysql.createPool(process.env.DATABASE_URL || {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        connectionLimit: 5,
        charset: 'utf8mb4',
      });
      await pool.query(`CREATE TABLE IF NOT EXISTS docs (
        col VARCHAR(40) NOT NULL,
        id VARCHAR(120) NOT NULL,
        data LONGTEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (col, id)
      ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await pool.query("INSERT IGNORE INTO docs (col, id, data) VALUES ('interno', 'escritura', '{}')");
    },
    close: () => pool.end(),
    async atomic(fn) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        // Incluye documentos que todavía no existen y coordina varios procesos.
        await conn.query("SELECT id FROM docs WHERE col = 'interno' AND id = 'escritura' FOR UPDATE");
        const res = await fn(documentosMysql(conn.execute.bind(conn)));
        await conn.commit();
        return res;
      } catch (e) {
        await conn.rollback();
        throw e;
      } finally {
        conn.release();
      }
    },
  };
}

function clonar(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }

export function crearStore() {
  const driver = process.env.DB_DRIVER || (process.env.DB_NAME || process.env.DATABASE_URL ? 'mysql' : 'file');
  if (process.env.NODE_ENV === 'production' && driver !== 'mysql') {
    throw new Error('En producción se requiere MySQL (DATABASE_URL o DB_NAME, DB_USER y DB_PASSWORD).');
  }
  if (driver === 'mysql') {
    if (!process.env.DATABASE_URL && !(process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD)) {
      throw new Error('Completa DATABASE_URL o DB_NAME, DB_USER y DB_PASSWORD para usar MySQL.');
    }
    return crearMysqlStore();
  }
  if (driver !== 'file') throw new Error(`DB_DRIVER desconocido: ${driver}`);
  return crearFileStore(process.env.DATA_FILE || path.resolve('data/db.json'));
}
