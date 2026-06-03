import cors from "cors";
import express from "express";
import { healthRouter } from "./routes/health.js";
import { clientsRouter } from "./routes/clients.js";
import { settingsRouter } from "./routes/settings.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: true,
      credentials: true,
    }),
  );
  app.use(express.json());

  app.get("/", (_request, response) => {
    response.json({
      name: "Morfo Hub API",
      status: "ok",
      version: "1.0.0",
    });
  });

  app.use("/api/health", healthRouter);
  app.use("/api/clients", clientsRouter);
  app.use("/api/settings", settingsRouter);

  app.use((error, _request, response, next) => {
    void next;
    console.error(error);
    response.status(500).json({
      error: "internal_server_error",
      message: "Ocurrió un error inesperado en la API.",
    });
  });

  return app;
}
