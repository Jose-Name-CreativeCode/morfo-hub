import crypto from "node:crypto";
import { prisma } from "./prisma.js";

const SESSION_COOKIE_NAME = "morfo_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PASSWORD_SALT_BYTES = 16;
const SCRYPT_KEYLEN = 64;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  parts.push(`Path=${options.path || "/"}`);
  parts.push(`SameSite=${options.sameSite || "Lax"}`);

  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function parseCookies(cookieHeader = "") {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex <= 0) return acc;

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function getSeedUsers() {
  const fromJson = String(process.env.AUTH_USERS_JSON || "").trim();

  if (fromJson) {
    try {
      const parsed = JSON.parse(fromJson);
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => ({
            email: normalizeEmail(entry?.email),
            password: String(entry?.password || ""),
            name: String(entry?.name || ""),
          }))
          .filter((entry) => entry.email && entry.password);
      }
    } catch (error) {
      console.error("No se pudo leer AUTH_USERS_JSON:", error);
    }
  }

  const emails = String(process.env.AUTH_SEED_EMAILS || "")
    .split(",")
    .map((entry) => normalizeEmail(entry))
    .filter(Boolean);
  const sharedPassword = String(process.env.AUTH_SEED_PASSWORD || "");

  if (!emails.length || !sharedPassword) {
    return [];
  }

  return emails.map((email) => ({
    email,
    password: sharedPassword,
    name: "",
  }));
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(PASSWORD_SALT_BYTES).toString("hex");
  const derivedKey = crypto
    .scryptSync(password, salt, SCRYPT_KEYLEN)
    .toString("hex");
  return `${salt}:${derivedKey}`;
}

export function verifyPassword(password, passwordHash) {
  const [salt, storedKey] = String(passwordHash || "").split(":");
  if (!salt || !storedKey) return false;

  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const storedBuffer = Buffer.from(storedKey, "hex");

  if (storedBuffer.length !== derivedKey.length) return false;

  return crypto.timingSafeEqual(storedBuffer, derivedKey);
}

export async function ensureSeedUsers() {
  const seedUsers = getSeedUsers();

  if (!seedUsers.length) {
    return [];
  }

  const upsertedUsers = [];

  for (const user of seedUsers) {
    const existing = await prisma.appUser.findUnique({
      where: { email: user.email },
    });

    let record = existing;

    if (!existing) {
      record = await prisma.appUser.create({
        data: {
          email: user.email,
          name: user.name || null,
          passwordHash: hashPassword(user.password),
          isActive: true,
        },
      });
    } else {
      const shouldRefreshPassword = !verifyPassword(
        user.password,
        existing.passwordHash,
      );
      const shouldRefreshName = Boolean(user.name) && user.name !== existing.name;

      if (shouldRefreshPassword || shouldRefreshName || !existing.isActive) {
        record = await prisma.appUser.update({
          where: { id: existing.id },
          data: {
            ...(shouldRefreshPassword
              ? { passwordHash: hashPassword(user.password) }
              : {}),
            ...(shouldRefreshName ? { name: user.name } : {}),
            isActive: true,
          },
        });
      }
    }

    upsertedUsers.push(record);
  }

  return upsertedUsers;
}

export async function authenticateUser(email, password) {
  await ensureSeedUsers();

  const user = await prisma.appUser.findUnique({
    where: { email: normalizeEmail(email) },
  });

  if (!user || !user.isActive) {
    return null;
  }

  return verifyPassword(password, user.passwordHash) ? user : null;
}

export async function createSession(userId) {
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.appSession.create({
    data: {
      tokenHash: hashSessionToken(sessionToken),
      userId,
      expiresAt,
    },
  });

  return {
    sessionToken,
    expiresAt,
  };
}

export function setSessionCookie(response, sessionToken, expiresAt) {
  response.setHeader(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE_NAME, sessionToken, {
      maxAge: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      secure: process.env.NODE_ENV === "production",
    }),
  );
}

export function clearSessionCookie(response) {
  response.setHeader(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE_NAME, "", {
      maxAge: 0,
      secure: process.env.NODE_ENV === "production",
    }),
  );
}

export async function getSessionUser(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const sessionToken = cookies[SESSION_COOKIE_NAME];

  if (!sessionToken) return null;

  const session = await prisma.appSession.findUnique({
    where: { tokenHash: hashSessionToken(sessionToken) },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.appSession.delete({
      where: { id: session.id },
    });
    return null;
  }

  if (!session.user?.isActive) {
    return null;
  }

  return {
    sessionId: session.id,
    user: session.user,
  };
}

export async function destroySessionByRequest(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  const sessionToken = cookies[SESSION_COOKIE_NAME];

  if (!sessionToken) return;

  await prisma.appSession.deleteMany({
    where: {
      tokenHash: hashSessionToken(sessionToken),
    },
  });
}

export async function requireSession(request, response, next) {
  const session = await getSessionUser(request);

  if (!session) {
    response.status(401).json({
      error: "unauthorized",
      message: "Necesito una sesión activa para continuar.",
    });
    return;
  }

  request.auth = {
    user: session.user,
    sessionId: session.sessionId,
  };

  next();
}

export function mapPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || "",
  };
}
