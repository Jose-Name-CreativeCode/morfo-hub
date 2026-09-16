import { getCurrentUser } from "../services/auth.js";
import { getActiveScope, getScopeConfig, withScopeParam } from "../scopes.js";

// Tiempo mínimo en pantalla para que el logo no parpadee.
const MIN_SPLASH_MS = 1200;

function homeUrlForUser() {
  const scope = getActiveScope();
  const config = getScopeConfig(scope);
  const page = config.homeKey === "resumen" ? "resumen.html" : "dashboard.html";
  return withScopeParam(page, scope);
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const note = document.getElementById("splash-note");
  const link = document.getElementById("splash-link");

  const [user] = await Promise.all([
    getCurrentUser().catch(() => null),
    wait(MIN_SPLASH_MS),
  ]);

  const target = user ? homeUrlForUser() : "login.html";
  link.href = target;

  if (note) {
    note.textContent = user ? "Listo, entrando..." : "Necesitas iniciar sesión";
  }

  // Si el navegador bloquea el salto automático, queda el botón a la vista.
  link.hidden = false;
  window.location.replace(target);
});
