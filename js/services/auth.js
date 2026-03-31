import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase-config.js";

const LOGIN_PATH = "/login.html";
const DEFAULT_REDIRECT_PATH = "/dashboard.html";

const allowedEmails = String(import.meta.env.VITE_ALLOWED_EMAILS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

let authReadyPromise = null;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getLoginUrl() {
  return new URL(LOGIN_PATH, window.location.origin).toString();
}

function getDefaultRedirectUrl() {
  return new URL(DEFAULT_REDIRECT_PATH, window.location.origin).toString();
}

export function isUserAllowed(user) {
  if (!user?.email) return false;
  if (allowedEmails.length === 0) return true;
  return allowedEmails.includes(normalizeEmail(user.email));
}

export function isAuthEnabled() {
  return Boolean(isFirebaseConfigured && auth);
}

export async function ensureAuthReady() {
  if (!isAuthEnabled()) return null;

  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        unsubscribe();
        resolve(user);
      });
    });
  }

  return authReadyPromise;
}

export async function loginWithEmail(email, password) {
  if (!isAuthEnabled()) {
    throw new Error(
      "Firebase Auth no esta configurado. Revisa las variables VITE_FIREBASE_*.",
    );
  }

  await setPersistence(auth, browserLocalPersistence);

  const credentials = await signInWithEmailAndPassword(auth, email, password);

  if (!isUserAllowed(credentials.user)) {
    await signOut(auth);
    throw new Error(
      "Este correo no esta autorizado para usar Morfo Hub. Agregalo en VITE_ALLOWED_EMAILS.",
    );
  }

  return credentials.user;
}

export async function logoutCurrentUser() {
  if (!isAuthEnabled()) return;
  await signOut(auth);
}

export async function getCurrentUser() {
  const user = await ensureAuthReady();

  if (!user) return null;

  if (!isUserAllowed(user)) {
    await logoutCurrentUser();
    return null;
  }

  return user;
}

export function setHeaderUser(user) {
  const headerUser = document.querySelector(".header-user");
  if (!headerUser) return;

  if (!user?.email) {
    headerUser.textContent = "Modo local";
    return;
  }

  headerUser.textContent = `${user.email} / Administrador`;
}

export async function protectPage({
  loginPath = getLoginUrl(),
  allowLocalFallback = true,
} = {}) {
  if (!isAuthEnabled()) {
    if (!allowLocalFallback) {
      window.location.href = loginPath;
    }
    setHeaderUser(null);
    return null;
  }

  const user = await getCurrentUser();

  if (!user) {
    window.location.href = loginPath;
    return null;
  }

  setHeaderUser(user);
  return user;
}

export async function redirectAuthenticatedUser({
  targetPath = getDefaultRedirectUrl(),
} = {}) {
  if (!isAuthEnabled()) return null;

  const user = await getCurrentUser();
  if (user) {
    window.location.href = targetPath;
  }

  return user;
}
