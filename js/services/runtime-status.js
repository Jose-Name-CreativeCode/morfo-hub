import { isFirebaseConfigured } from "./firebase-config.js";
import {
  apiRequest,
  getApiBaseUrl,
  getForcedDataMode,
  shouldUseLocalApi,
} from "./api-client.js";

export async function getRuntimeStatus() {
  const usingLocalApi = shouldUseLocalApi();
  const forcedMode = getForcedDataMode();

  if (usingLocalApi) {
    const status = {
      modeValue: "API local activa",
      modeTone: "is-success",
      modeNote:
        forcedMode === "api"
          ? "Yo forcé manualmente el uso del nuevo servidor desde localStorage."
          : "Yo estoy en localhost y la app usa automáticamente el nuevo servidor.",
      apiValue: "Verificando API...",
      apiTone: "is-warning",
      apiNote: getApiBaseUrl(),
      dbValue: "Verificando base...",
      dbTone: "is-warning",
      dbNote: "Yo estoy validando la conexión del backend con PostgreSQL / Neon.",
    };

    try {
      const health = await apiRequest("/health");
      const database = health?.database || {};

      status.apiValue = "API disponible";
      status.apiTone = "is-success";
      status.apiNote = `${getApiBaseUrl()} · ${health.timestamp || "sin marca de tiempo"}`;
      status.dbValue =
        database.status === "connected"
          ? "PostgreSQL / Neon conectado"
          : "Base de datos con alerta";
      status.dbTone =
        database.status === "connected" ? "is-success" : "is-danger";
      status.dbNote = `${database.host || "host desconocido"} · ${database.database || "base desconocida"}`;
      return status;
    } catch (error) {
      status.apiValue = "API no disponible";
      status.apiTone = "is-danger";
      status.apiNote =
        error?.message || "Yo no pude validar la API en este momento.";
      status.dbValue = "Sin verificación";
      status.dbTone = "is-danger";
      status.dbNote =
        "Yo no pude comprobar la conexión con PostgreSQL / Neon.";
      return status;
    }
  }

  if (isFirebaseConfigured) {
    return {
      modeValue: "Firebase / Firestore",
      modeTone: "is-warning",
      modeNote:
        forcedMode === "firebase"
          ? "Yo forcé manualmente el uso de Firebase desde localStorage."
          : "Yo estoy fuera de localhost y la app conserva el flujo con Firebase.",
      apiValue: "API local inactiva",
      apiTone: "",
      apiNote:
        "Yo uso la API nueva automáticamente solo cuando trabajo en localhost.",
      dbValue: "Neon sin uso",
      dbTone: "",
      dbNote:
        "Yo no uso PostgreSQL en este modo porque los datos salen de Firebase.",
    };
  }

  return {
    modeValue: "localStorage",
    modeTone: "is-warning",
    modeNote:
      "Yo no tengo Firebase configurado y la API local no está activa.",
    apiValue: "API local inactiva",
    apiTone: "",
    apiNote:
      "Yo necesito correr `npm run dev:full` en localhost para usar el nuevo servidor.",
    dbValue: "Neon sin uso",
    dbTone: "",
    dbNote:
      "Yo solo uso PostgreSQL cuando el frontend apunta a la API local.",
  };
}
