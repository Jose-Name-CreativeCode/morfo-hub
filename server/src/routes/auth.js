import { Router } from "express";
import {
  authenticateUser,
  clearSessionCookie,
  createSession,
  destroySessionByRequest,
  ensureSeedUsers,
  getSessionUser,
  mapPublicUser,
  setSessionCookie,
} from "../lib/auth.js";

export const authRouter = Router();

authRouter.get("/status", async (_request, response) => {
  const seedUsers = await ensureSeedUsers();

  response.json({
    status: "ok",
    authConfigured: seedUsers.length > 0,
    seededUsers: seedUsers.map((user) => ({
      email: user.email,
      name: user.name || "",
    })),
  });
});

authRouter.get("/session", async (request, response) => {
  const session = await getSessionUser(request);

  if (!session) {
    response.status(401).json({
      authenticated: false,
      user: null,
      message: "No encontré una sesión activa.",
    });
    return;
  }

  response.json({
    authenticated: true,
    user: mapPublicUser(session.user),
  });
});

authRouter.post("/login", async (request, response) => {
  const email = String(request.body?.email || "").trim();
  const password = String(request.body?.password || "");

  if (!email || !password) {
    response.status(400).json({
      error: "invalid_credentials",
      message: "Necesito correo y contraseña para iniciar sesión.",
    });
    return;
  }

  const user = await authenticateUser(email, password);

  if (!user) {
    response.status(401).json({
      error: "invalid_credentials",
      message: "No pude validar el correo o la contraseña.",
    });
    return;
  }

  const session = await createSession(user.id);
  setSessionCookie(response, session.sessionToken, session.expiresAt);

  response.json({
    authenticated: true,
    user: mapPublicUser(user),
  });
});

authRouter.post("/logout", async (request, response) => {
  await destroySessionByRequest(request);
  clearSessionCookie(response);

  response.json({
    authenticated: false,
  });
});
