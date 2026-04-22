# Publicacion en GitHub Pages

Morfo Hub puede publicarse como sitio estatico en GitHub Pages porque el
frontend usa Vite y Firebase se encarga de autenticacion y datos.

## Build local

Para generar el build normal:

```bash
npm run build
```

Para generar el build pensando en un repositorio llamado `morfo-hub`:

```bash
npm run build:github-pages
```

Ese script usa:

```bash
VITE_BASE_PATH=/morfo-hub/
```

Si el repositorio tiene otro nombre, cambia el valor de `VITE_BASE_PATH`.

## Variables necesarias

GitHub Pages no puede leer tu archivo `.env` local. Si haces deploy con GitHub
Actions, agrega estas variables como secrets o variables del repositorio:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_ALLOWED_EMAILS`

## Reglas de seguridad

Antes de usar la app fuera de tu compu, publica las reglas de `firestore.rules`
en Firebase. La app bloquea usuarios desde el frontend, pero Firestore debe
ser quien proteja la base de datos realmente.

## Nota sobre rutas

Este proyecto es multipagina. GitHub Pages debe servir los archivos generados
en `dist/` tal cual:

- `login.html`
- `dashboard.html`
- `clients.html`
- `income.html`
- `expenses.html`
- `quotes.html`
- `reports.html`
- `maintenance.html`
- `settings.html`
