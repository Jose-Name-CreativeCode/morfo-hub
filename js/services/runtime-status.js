import {
  apiRequest,
  getApiBaseUrl,
  getForcedDataMode,
  shouldUseLocalApi,
} from "./api-client.js";

export async function getRuntimeStatus() {
  const usingLocalApi = shouldUseLocalApi();
  const forcedMode = getForcedDataMode();

  const status = {
    modeValue: usingLocalApi ? "API local activa" : "API de producción",
    modeTone: "is-success",
    modeNote: usingLocalApi
      ? forcedMode === "api"
        ? "Yo forcé manualmente el uso del backend local."
        : "Yo estoy en localhost y la app usa el backend local automáticamente."
      : "Yo estoy usando la API desplegada bajo el mismo dominio en Vercel.",
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
    status.dbNote = "Yo no pude comprobar la conexión con PostgreSQL / Neon.";
    return status;
  };
}
