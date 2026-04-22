# Morfo Hub

Sistema interno de gestion para Morfo: clientes, ingresos, gastos,
cotizaciones, reportes y configuracion.

## Stack actual

- HTML multipagina
- CSS plano por vista
- JavaScript modular en navegador
- Vite para desarrollo y build
- ESLint para calidad de codigo
- Prettier para formato

## Requisitos

- Node.js 20 o superior
- npm 10 o superior recomendado

## Scripts

- `npm install`: instala dependencias
- `npm run dev`: levanta el entorno local con Vite
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
- `assets/`: imagenes y recursos visuales
- `docs/`: documentacion interna

## Flujo de desarrollo sugerido

1. Instala dependencias con `npm install`
2. Corre `npm run dev`
3. Trabaja sobre los modulos en `js/modules`
4. Revisa formato y lint antes de cerrar cambios

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
