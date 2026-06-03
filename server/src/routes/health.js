import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const healthRouter = Router();

function getDatabaseMeta() {
  try {
    const databaseUrl = new URL(process.env.DATABASE_URL || "");

    return {
      provider: "postgresql",
      host: databaseUrl.hostname || "desconocido",
      database: databaseUrl.pathname.replace(/^\//, "") || "desconocida",
    };
  } catch {
    return {
      provider: "postgresql",
      host: "desconocido",
      database: "desconocida",
    };
  }
}

healthRouter.get("/", async (_request, response) => {
  const database = getDatabaseMeta();

  try {
    await prisma.$queryRaw`SELECT 1`;

    response.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: {
        ...database,
        status: "connected",
      },
    });
  } catch (error) {
    console.error("Health check database error:", error);
    response.status(503).json({
      status: "degraded",
      timestamp: new Date().toISOString(),
      database: {
        ...database,
        status: "error",
      },
      message: "La API está activa, pero no pudo conectarse a la base de datos.",
    });
  }
});
