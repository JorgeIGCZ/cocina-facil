# 🍳 Mi Cocina

Planeador de comidas familiar: plan semanal, sugerencias inteligentes, estrellas por persona, refri, lista del súper e historial. Incluye un **conector MCP** para usarlo desde **Meta Muse**.

## Correr en local

```bash
npm install
npm run dev        # http://localhost:3000  (clave: dev)
```

Sin variables de entorno, los datos se guardan en `data/db.json` y la clave es `dev`.

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
2. Crea la **app de Node.js** (Node 20+) apuntando a este proyecto. Comando de inicio: `npm start`.
3. Configura las variables de entorno de `.env.example`:
   - `APP_KEY`: una clave larga y aleatoria (por ejemplo `openssl rand -hex 24`)
   - `NODE_ENV=production`, `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
4. Al arrancar se crea la tabla `docs` y se cargan los datos iniciales.
5. Usa un subdominio con HTTPS (por ejemplo `cocina.tudominio.com`).

## Conectar con Meta Muse

Escríbele a Muse:

> Crea un conector a mi app de comidas. Es un servidor MCP por HTTP en `https://cocina.tudominio.com/mcp`, con autenticación bearer token. Pruébalo y guárdalo como skill.

Cuando pida el token, escribe la `APP_KEY` **en el aviso seguro de Muse**, no en el chat. En los ajustes de Muse conviene dejar activada la aprobación para las acciones que modifican datos.
