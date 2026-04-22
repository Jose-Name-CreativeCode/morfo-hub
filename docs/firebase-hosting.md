# Publicacion con Firebase Hosting

Firebase Hosting es la opcion recomendada para Morfo Hub porque ya usamos
Firebase Auth y Firestore. Puedes mantener el repositorio privado y publicar la
app con una URL de Firebase.

## 1. Requisitos

- Proyecto Firebase creado.
- Authentication con `Email/Password` activo.
- Firestore activo.
- Reglas de `firestore.rules` publicadas.
- Variables `VITE_*` configuradas en `.env` local.

## 2. Instalar Firebase CLI

Si no lo tienes instalado:

```bash
npm install -g firebase-tools
```

Inicia sesion:

```bash
firebase login
```

## 3. Conectar el proyecto local

Desde la carpeta del proyecto:

```bash
firebase use --add
```

Selecciona tu proyecto Firebase y ponle un alias, por ejemplo:

```txt
default
```

Esto crea `.firebaserc` con el proyecto elegido.

## 4. Probar build

```bash
npm run build
```

Opcionalmente, revisa el build:

```bash
npm run preview
```

## 5. Publicar solo Hosting

```bash
npm run deploy:hosting
```

Esto ejecuta:

```bash
npm run build
firebase deploy --only hosting
```

## 6. Publicar Hosting y reglas

Si tambien quieres publicar reglas:

```bash
npm run deploy:firebase
```

## 7. Importante sobre privacidad

Firebase Hosting entrega una URL publica, pero Morfo Hub queda protegido por:

- login obligatorio con Firebase Auth
- correos permitidos en `VITE_ALLOWED_EMAILS`
- reglas de Firestore limitadas a los dos correos autorizados

Aunque alguien abra la URL, no podra leer ni escribir datos si no inicia sesion
con una cuenta autorizada.

## 8. Variables de entorno

El build usa las variables `VITE_*` de tu archivo `.env`. No subas `.env` al
repositorio.

Variables necesarias:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_ALLOWED_EMAILS=manolonat17@gmail.com,verogr2000@gmail.com
```
