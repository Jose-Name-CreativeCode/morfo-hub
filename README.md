# Morfo Hub

Sistema interno de gestión para Morfo: clientes, cobros e ingresos, gastos,
cotizaciones, reportes y configuración.

## Stack actual

- HTML multipágina
- CSS plano por vista
- JavaScript modular en navegador
- API REST con Express
- Autenticación propia con sesiones por cookie
- Prisma ORM
- PostgreSQL en Neon
- Vercel para frontend + funciones backend
- Vite para desarrollo y build
- ESLint y Prettier

## Requisitos

- Node.js 20 o superior
- npm 10 o superior recomendado

## Scripts

- `npm install`: instala dependencias
- `npm run dev`: levanta el frontend con Vite
- `npm run api:dev`: levanta la API backend en modo watch
- `npm run api:start`: levanta la API backend
- `npm run dev:full`: levanta frontend + API local al mismo tiempo
- `npm run prisma:generate`: genera el cliente Prisma
- `npm run prisma:push`: crea o actualiza el esquema en PostgreSQL
- `npm run build`: genera el build de producción en `dist/`
- `npm run preview`: sirve el build generado
- `npm run deploy:vercel`: despliega a Vercel en producción
- `npm run lint`: revisa JavaScript con ESLint
- `npm run lint:fix`: corrige problemas autoarreglables
- `npm run format`: formatea el proyecto con Prettier
- `npm run format:check`: valida formato sin modificar archivos

## Estructura

- `index.html`: entrada principal del proyecto
- `*.html`: vistas multipágina
- `css/`: estilos globales y por módulo
- `js/modules/`: lógica de cada página
- `js/services/`: acceso a API, sesión y almacenamiento local
- `server/`: API Express
- `api/`: entrypoint para Vercel Functions
- `prisma/`: esquema de datos
- `docs/`: documentación interna
- `vercel.json`: configuración de despliegue en Vercel

## Variables de entorno

Yo configuro esto como mínimo:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require&channel_binding=require"
PORT=3000
APP_ORIGIN="http://localhost:5173"
VITE_API_BASE_URL="http://localhost:3000/api"
AUTH_USERS_JSON='[{"email":"tu-correo@ejemplo.com","password":"cambia-esta-clave","name":"Jose"}]'
```

También puedo usar esta opción simple para compartir una sola contraseña entre
varios correos:

```env
AUTH_SEED_EMAILS="correo1@ejemplo.com,correo2@ejemplo.com"
AUTH_SEED_PASSWORD="cambia-esta-clave"
```

## Cómo correrlo en local

1. Yo corro `npm install`
2. Yo configuro `DATABASE_URL` en `.env`
3. Yo corro `npm run prisma:generate`
4. Yo corro `npm run prisma:push`
5. Yo corro `npm run dev:full`

Frontend:

- `http://localhost:5173`

API:

- `http://localhost:3000/api`

## Arquitectura actual

Morfo Hub ya no depende de Firebase.

Ahora el flujo es este:

- el frontend llama a la API propia
- la API maneja login, sesión y autorización
- Prisma escribe todo en PostgreSQL
- Neon guarda la base de datos
- Vercel sirve el frontend y ejecuta la API

## Autenticación

La autenticación ya vive en el backend con estas rutas:

- `GET /api/auth/status`
- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/logout`

La sesión se guarda en una cookie `HttpOnly`, así que el navegador comparte el
acceso entre frontend y backend sin exponer tokens al JavaScript de la app.

## Módulos de datos

La API ya cubre:

- `GET /api/health`
- `GET /api/clients`
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

## Runtime y diagnóstico

Las vistas de `dashboard`, `reports` y `maintenance` muestran:

- si la app está usando la API local o la API de producción
- el estado del backend
- el estado de conexión con PostgreSQL / Neon

## Preparación para Vercel

La configuración actual está pensada para Vercel usando:

- `vercel.json` con `buildCommand` y `outputDirectory`
- `api/index.js` como función Node/Express
- `dist/` como salida del frontend de Vite

## Flujo recomendado de despliegue

1. Yo conecto el repositorio a Vercel
2. Yo agrego `DATABASE_URL`, `APP_ORIGIN` y variables de auth en Vercel
3. Yo dejo `Build Command` como `npm run build`
4. Yo dejo `Output Directory` como `dist`
5. Yo valido `https://tu-dominio/api/health`
6. Yo pruebo login y módulos principales

## Documentación relacionada

- [Checklist de prueba completa](docs/qa-checklist.md)
- [Plantilla de incidencias QA](docs/qa-log-template.md)
- [Mapa de módulos](docs/modules.md)
- [Rebuild ordenado](docs/rebuild-plan.md)
