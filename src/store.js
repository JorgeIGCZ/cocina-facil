// Almacenamiento de documentos: { coleccion, id } -> objeto JSON.
// Driver "file" para desarrollo local (data/db.json) y "mysql" para Hostinger.
import fs from 'node:fs/promises';
import path from 'node:path';

const COLECCIONES = ['personas', 'platillos', 'historial', 'plan', 'refri', 'compras', 'config'];

function crearFileStore(archivo) {
  let datos = null;
  let escribiendo = Promise.resolve();

  async function cargar() {
    if (datos) return datos;
    try {
      datos = JSON.parse(await fs.readFile(archivo, 'utf8'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      datos = {};
    }
    for (const c of COLECCIONES) datos[c] ??= {};
    return datos;
  }

  function guardar() {
    escribiendo = escribiendo.then(async () => {
      await fs.mkdir(path.dirname(archivo), { recursive: true });
      const tmp = `${archivo}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(datos, null, 1));
      await fs.rename(tmp, archivo);
    });
    return escribiendo;
  }

  return {
    async init() { await cargar(); },
    async all(col) { const d = await cargar(); return Object.values(d[col] ?? {}).map(clonar); },
    async get(col, id) { const d = await cargar(); return d[col]?.[id] ? clonar(d[col][id]) : null; },
    async put(col, id, doc) { const d = await cargar(); (d[col] ??= {})[id] = clonar(doc); await guardar(); return doc; },
    async del(col, id) { const d = await cargar(); const existia = !!d[col]?.[id]; delete d[col]?.[id]; await guardar(); return existia; },
  };
}

function crearMysqlStore() {
  let pool;
  return {
    async init() {
      const mysql = (await import('mysql2/promise')).default;
      pool = process.env.DATABASE_URL
        ? mysql.createPool(process.env.DATABASE_URL)
        : mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
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
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    },
    async all(col) {
      const [rows] = await pool.query('SELECT data FROM docs WHERE col = ?', [col]);
      return rows.map((r) => JSON.parse(r.data));
    },
    async get(col, id) {
      const [rows] = await pool.query('SELECT data FROM docs WHERE col = ? AND id = ?', [col, id]);
      return rows[0] ? JSON.parse(rows[0].data) : null;
    },
    async put(col, id, doc) {
      await pool.query(
        'INSERT INTO docs (col, id, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
        [col, id, JSON.stringify(doc)],
      );
      return doc;
    },
    async del(col, id) {
      const [r] = await pool.query('DELETE FROM docs WHERE col = ? AND id = ?', [col, id]);
      return r.affectedRows > 0;
    },
  };
}

function clonar(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }

export function crearStore() {
  const driver = process.env.DB_DRIVER || (process.env.DB_NAME || process.env.DATABASE_URL ? 'mysql' : 'file');
  if (driver === 'mysql') return crearMysqlStore();
  return crearFileStore(process.env.DATA_FILE || path.resolve('data/db.json'));
}
