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

La primera coleccion remota integrada es:

- `clients`

## 5. Reglas base sugeridas para Firestore

Estas reglas permiten acceso solo a usuarios autenticados cuyos correos esten en
la lista autorizada:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAllowedUser() {
      return request.auth != null &&
        request.auth.token.email_verified == true &&
        request.auth.token.email in [
          "tu-correo@ejemplo.com",
          "pareja@ejemplo.com"
        ];
    }

    match /{document=**} {
      allow read, write: if isAllowedUser();
    }
  }
}
```

## 6. Nota importante

Si tus cuentas no tienen `email_verified == true`, quita temporalmente esa
validacion mientras haces pruebas.
