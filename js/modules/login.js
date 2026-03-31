import {
  isAuthEnabled,
  loginWithEmail,
  redirectAuthenticatedUser,
} from "../services/auth.js";
import { setButtonLoading } from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  const loginForm = document.querySelector("form");
  const submitButton = loginForm?.querySelector(".btn-primary");

  if (!loginForm || !submitButton) return;

  const message = document.createElement("p");
  message.id = "login-status-message";
  message.style.marginTop = "16px";
  message.style.fontSize = "0.95rem";
  message.style.color = "#475569";
  loginForm.appendChild(message);

  if (!isAuthEnabled()) {
    message.textContent =
      "Configura Firebase en el archivo .env para habilitar el inicio de sesion compartido.";
    submitButton.disabled = true;
    submitButton.style.opacity = "0.7";
    submitButton.style.cursor = "not-allowed";
    return;
  }

  await redirectAuthenticatedUser();

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
      message.textContent = "Completa tu correo y contrasena.";
      message.style.color = "#b91c1c";
      return;
    }

    setButtonLoading(submitButton, true, "Entrando...");
    message.textContent = "Validando acceso...";
    message.style.color = "#475569";

    try {
      await loginWithEmail(email, password);
      window.location.href = "dashboard.html";
    } catch (error) {
      message.textContent =
        error?.message || "No fue posible iniciar sesion. Revisa tus credenciales.";
      message.style.color = "#b91c1c";
    } finally {
      setButtonLoading(submitButton, false);
    }
  });
});
