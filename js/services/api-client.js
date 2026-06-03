const DEFAULT_LOCAL_API_BASE = "http://localhost:3000/api";
const DEFAULT_PRODUCTION_API_BASE = "/api";
const DATA_MODE_KEY = "morfo_data_mode";

function isLocalHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0"
  );
}

export function shouldUseLocalApi() {
  if (typeof window === "undefined") return false;

  const forcedMode = getForcedDataMode();

  if (forcedMode === "api") return true;
  if (forcedMode === "local") return false;

  return isLocalHost(window.location.hostname);
}

export function getForcedDataMode() {
  if (typeof window === "undefined") return "";

  return String(window.localStorage.getItem(DATA_MODE_KEY) || "").trim();
}

export function getApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return String(import.meta.env.VITE_API_BASE_URL);
  }

  return shouldUseLocalApi() ? DEFAULT_LOCAL_API_BASE : DEFAULT_PRODUCTION_API_BASE;
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = "No se pudo completar la petición.";

    try {
      const errorData = await response.json();
      message = errorData?.message || message;
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}
