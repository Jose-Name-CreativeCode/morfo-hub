const DEFAULT_LOCAL_API_BASE = "http://localhost:3000/api";

function isLocalHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0"
  );
}

export function shouldUseLocalApi() {
  if (typeof window === "undefined") return false;

  const forcedMode = String(
    window.localStorage.getItem("morfo_data_mode") || "",
  ).trim();

  if (forcedMode === "api") return true;
  if (forcedMode === "firebase") return false;

  return isLocalHost(window.location.hostname);
}

export function getApiBaseUrl() {
  return String(import.meta.env.VITE_API_BASE_URL || DEFAULT_LOCAL_API_BASE);
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
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
