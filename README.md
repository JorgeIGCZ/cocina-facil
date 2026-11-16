# 🍳 Mi Cocina

Planeador de comidas familiar: plan semanal, sugerencias inteligentes, estrellas por persona, refri, lista del súper e historial. Incluye un **conector MCP** para usarlo desde **Meta Muse**.

## Correr en local

```bash
npm install
npm run dev        # http://localhost:3000  (clave: dev)
```

Sin variables de entorno, los datos se guardan en `data/db.json` y la clave es `dev`.
Usa `npm test` para ejecutar las regresiones del plan, las estrellas y la lista del súper con datos desechables.

## Estructura

| Archivo | Qué hace |
|---|---|
| `src/domain.js` | Toda la lógica: sugerencias, plan, súper, refri, historial |
| `src/seed.js` | Platillos iniciales sacados de sus libretas |
| `src/store.js` | Almacenamiento: archivo JSON (local) o MySQL (Hostinger) |
| `src/server.js` | API REST (`/api/*`), conector MCP (`/mcp`) y webapp |
| `src/mcp.js` | Herramientas que ve Muse |
| `src/openapi.js` | Documentación pública de la API (`/openapi.json`) |
| `public/` | Webapp móvil (HTML/CSS/JS sin dependencias) |

## Desplegar en Hostinger (Node.js)

1. En hPanel crea una **base de datos MySQL** y anota nombre, usuario y contraseña.
2. Crea la **app de Node.js** apuntando a este proyecto. Selecciona Node 24 en hPanel. El punto de entrada es `src/server.js` (`npm start`).
3. Configura las variables de entorno de `.env.example`:
   - `APP_KEY` para el teléfono y `MCP_KEY` para Muse. Genera dos claves distintas con `openssl rand -hex 24`. Puedes dejar `MCP_KEY` vacía mientras preparas el conector.
   - `NODE_ENV=production`, `DB_HOST=127.0.0.1`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. También se admite `DATABASE_URL`.
   - `PUBLIC_URL` con el origen HTTPS, por ejemplo `https://cocina.tudominio.com`.
4. Al arrancar se crea la tabla `docs` y se carga el catálogo inicial en una base vacía. En producción el arranque exige MySQL.
5. Comprueba `/api/salud` y, desde el celular, guarda un cambio, reinicia la app en hPanel y confirma que se conservó. Si ya hay datos en `data/db.json` que quieras llevar a producción, respáldalos antes de desplegar. La base nueva se inicializa con el catálogo de fábrica.
6. Exporta la base con phpMyAdmin y prueba restaurarla en una base aparte. Guarda ese respaldo antes de cada cambio grande.

## Conectar con Meta Muse

Escríbele a Muse:

> Crea un conector a mi app de comidas. Es un servidor MCP por HTTP en `https://cocina.tudominio.com/mcp`, con autenticación bearer token. Pruébalo y guárdalo como skill.

Cuando pida el token, escribe la `MCP_KEY` **en el aviso seguro de Muse**. En los ajustes de Muse deja activada la aprobación para las acciones que modifican datos. Para comprobar el conector, pídele «¿Qué planeé esta semana?» y luego prueba una escritura en un espacio libre. Puedes revocar el conector cambiando solo `MCP_KEY` y reiniciando la app.
