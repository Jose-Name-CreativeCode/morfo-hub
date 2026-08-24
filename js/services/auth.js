import { apiRequest } from "./api-client.js";

const LOGIN_PATH = "/login.html";
const DEFAULT_REDIRECT_PATH = "/dashboard.html?scope=morfo";

function getLoginUrl() {
  return new URL(LOGIN_PATH, window.location.origin).toString();
}

function getDefaultRedirectUrl() {
  return new URL(DEFAULT_REDIRECT_PATH, window.location.origin).toString();
}

export function isUserAllowed(user) {
  return Boolean(user?.email);
}

export function isAuthEnabled() {
  return true;
}

export async function ensureAuthReady() {
  return getCurrentUser();
}

export async function loginWithEmail(email, password) {
  const result = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
    }),
  });

  return result?.user || null;
}

export async function logoutCurrentUser() {
  await apiRequest("/auth/logout", {
    method: "POST",
  });
}

export async function getCurrentUser() {
  try {
    const result = await apiRequest("/auth/session");
    const user = result?.user || null;
    if (!isUserAllowed(user)) {
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

function getDisplayName(user) {
  const explicitName = String(user?.name || "").trim();
  if (explicitName) return explicitName;

  const email = String(user?.email || "")
    .trim()
    .toLowerCase();

  if (email.startsWith("manolo") || email.startsWith("manolonat17")) {
    return "Jose";
  }

  if (email.startsWith("verogr")) {
    return "Vero";
  }

  if (!email) return "";

  const localPart = email.split("@")[0] || "";
  return localPart || email;
}

export function setHeaderUser(user) {
  const headerUser = document.querySelector(".header-user");
  if (!headerUser) return;

  let actions = document.querySelector(".header-actions");

  if (!actions) {
    actions = document.createElement("div");
    actions.className = "header-actions";

    const parent = headerUser.parentElement;
    if (parent) {
      parent.appendChild(actions);
    }
  }

  actions.replaceChildren();

  if (!user?.email) {
    headerUser.textContent = "Sesión no iniciada";
    return;
  }

  headerUser.textContent = `${getDisplayName(user)} / Administrador`;

  const logoutButton = document.createElement("button");
  logoutButton.type = "button";
  logoutButton.className = "header-logout-btn";
  logoutButton.textContent = "Cerrar sesión";
  logoutButton.addEventListener("click", async () => {
    await logoutCurrentUser();
    window.location.href = getLoginUrl();
  });

  actions.appendChild(logoutButton);
}

export async function protectPage({
  loginPath = getLoginUrl(),
  allowLocalFallback = false,
} = {}) {
  const user = await getCurrentUser();

  if (!user) {
    if (allowLocalFallback) {
      setHeaderUser(null);
      return null;
    }
    window.location.href = loginPath;
    return null;
  }

  setHeaderUser(user);
  return user;
}

export async function redirectAuthenticatedUser({
  targetPath = getDefaultRedirectUrl(),
} = {}) {
  const user = await getCurrentUser();
  if (user) {
    window.location.href = targetPath;
  }

  return user;
}
