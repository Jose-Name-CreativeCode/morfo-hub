# Firebase Setup

## 1. Crear proyecto

1. Crea un proyecto en Firebase
2. Activa `Authentication`
3. Activa `Cloud Firestore`
4. Registra una app web
5. Copia las credenciales al archivo `.env`

## 2. Authentication

Activa el proveedor:

- `Email/Password`

Crea manualmente los dos usuarios que usaran Morfo Hub.

## 3. Variables de entorno

Llena estas variables:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_ALLOWED_EMAILS=tu-correo@ejemplo.com,pareja@ejemplo.com
```

## 4. Colecciones actuales

Las colecciones remotas integradas son:

- `clients`
- `income`
- `expenses`
- `quotes`
- `app/settings`

## 5. Mantenimiento y respaldo

`maintenance.html` permite:

- revisar duplicados e inconsistencias
- descargar respaldo JSON con las colecciones principales
- restaurar un respaldo JSON con confirmacion manual

Conviene descargar un respaldo antes de hacer limpiezas o cambios masivos.

## 6. Reglas base sugeridas para Firestore

Estas reglas permiten acceso solo a usuarios autenticados cuyos correos esten
autorizados. Tambien estan guardadas en `firestore.rules`.

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAllowedUser() {
      return request.auth != null &&
        request.auth.token.email_verified == true &&
        request.auth.token.email in [
          "manolonat17@gmail.com",
          "verogr2000@gmail.com"
        ];
    }

    match /{document=**} {
      allow read, write: if isAllowedUser();
    }
  }
}
```

## 7. Publicar reglas

Si tienes Firebase CLI instalado:

```bash
firebase deploy --only firestore:rules
```

Tambien puedes copiar el contenido de `firestore.rules` y pegarlo en Firebase
Console, dentro de Firestore > Rules.

## 8. Hosting

La configuracion de Firebase Hosting vive en `firebase.json` y publica la
carpeta `dist/`.

Para publicar solo Hosting:

```bash
npm run deploy:hosting
```

Para publicar Hosting y reglas:

```bash
npm run deploy:firebase
```

## 9. Nota importante

Las reglas exigen `email_verified == true`. Antes de publicarlas, confirma que
ambas cuentas autorizadas aparezcan como verificadas en Firebase Authentication.
