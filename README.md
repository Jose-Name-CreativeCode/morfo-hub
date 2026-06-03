# Morfo Hub

Sistema interno de gestion para Morfo: clientes, ingresos, gastos,
cotizaciones, reportes y configuracion.

## Stack actual

- HTML multipagina
- CSS plano por vista
- JavaScript modular en navegador
- API REST con Express
- Prisma ORM
- SQLite para desarrollo local
- Vite para desarrollo y build
- ESLint para calidad de codigo
- Prettier para formato

## Requisitos

- Node.js 20 o superior
- npm 10 o superior recomendado

## Scripts

- `npm install`: instala dependencias
- `npm run dev`: levanta el entorno local con Vite
- `npm run api:dev`: levanta la API backend en modo watch
- `npm run api:start`: levanta la API backend
- `npm run dev:full`: levanta frontend + API local al mismo tiempo
- `npm run db:setup`: crea la base SQLite local inicial
- `npm run prisma:generate`: genera el cliente Prisma
- `npm run build`: genera el build de produccion en `dist/`
- `npm run build:github-pages`: genera build usando `/morfo-hub/` como base
- `npm run preview`: sirve el build generado
- `npm run deploy:hosting`: genera build y publica Firebase Hosting
- `npm run deploy:firebase`: genera build y publica hosting/reglas Firebase
- `npm run lint`: revisa JavaScript con ESLint
- `npm run lint:fix`: corrige problemas autoarreglables
- `npm run format`: formatea el proyecto con Prettier
- `npm run format:check`: valida formato sin modificar archivos

## Estructura

- `index.html`: entrada principal del proyecto
- `*.html`: vistas multipagina
- `css/`: estilos globales y por modulo
- `js/modules/`: logica de cada pagina
- `js/services/`: acceso a almacenamiento y servicios externos
- `js/utils.js`: utilidades compartidas
- `server/`: API Express
- `prisma/`: esquema de datos
- `scripts/`: utilidades locales de inicializacion
- `assets/`: imagenes y recursos visuales
- `docs/`: documentacion interna

## Flujo de desarrollo sugerido

1. Instala dependencias con `npm install`
2. Crea la base local con `npm run db:setup`
3. Genera Prisma Client con `npm run prisma:generate`
4. Corre el frontend con `npm run dev`
5. Corre la API con `npm run api:dev`
6. Trabaja sobre frontend en `js/modules` y backend en `server/`
7. Revisa formato y lint antes de cerrar cambios

## Primera fase full stack

Ya existe una base backend funcional para empezar la migracion:

- `GET /api/health`
- `GET /api/clients`
- `GET /api/clients/:id`
- `POST /api/clients`
- `PUT /api/clients/:id`
- `DELETE /api/clients/:id`
- `GET /api/income`
- `POST /api/income`
- `PUT /api/income/:id`
- `DELETE /api/income/:id`
- `GET /api/expenses`
- `POST /api/expenses`
- `PUT /api/expenses/:id`
- `DELETE /api/expenses/:id`
- `GET /api/quotes`
- `POST /api/quotes`
- `PUT /api/quotes/:id`
- `DELETE /api/quotes/:id`
- `GET /api/settings`
- `PUT /api/settings`

Por ahora el frontend actual sigue conectado a Firebase y `localStorage`. La
idea recomendada es migrar modulo por modulo hacia la API para no detener la
operacion actual.

## Nuevo servidor local

Si abres la app en `localhost`, el frontend usa automáticamente la API local
del nuevo servidor para estos módulos:

- clientes
- ingresos
- gastos
- cotizaciones
- configuración

### Cómo correr todo junto

1. `npm install`
2. `npm run db:setup`
3. `npm run prisma:generate`
4. `npm run dev:full`

Frontend:
- `http://localhost:5173`

API:
- `http://localhost:3000/api`

### Selector manual del modo de datos

En desarrollo puedes forzar el origen de datos desde consola:

```js
localStorage.setItem("morfo_data_mode", "api");
localStorage.setItem("morfo_data_mode", "firebase");
localStorage.removeItem("morfo_data_mode");
```

- `api`: obliga al frontend a usar el nuevo servidor
- `firebase`: obliga al frontend a usar Firebase
- sin valor: en `localhost` usa la API local automáticamente

## Siguiente etapa recomendada

- publicar reglas definitivas de Firestore desde `firestore.rules`
- fortalecer el panel de mantenimiento con exportacion y recalculos
- pulir el PDF de cotizaciones con identidad visual final
- preparar deploy estable en GitHub Pages

## Firebase

Morfo Hub ya queda preparado para trabajar con Firebase usando variables de
entorno de Vite.

### Variables necesarias

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_ALLOWED_EMAILS`

### Flujo actual integrado

- `login.html` usa Firebase Auth con email y contrasena
- `clients.html`, `income.html`, `expenses.html`, `quotes.html` y
  `settings.html` leen y escriben en Firestore
- si existen datos en `localStorage` y la coleccion remota aun esta vacia, se
  migran automaticamente la primera vez

### Documentacion relacionada

- [Firebase Setup](docs/firebase-setup.md)
- [Firebase Hosting](docs/firebase-hosting.md)
- [GitHub Pages](docs/github-pages.md)
- [Checklist de prueba completa](docs/qa-checklist.md)
- [Mapa de modulos](docs/modules.md)
