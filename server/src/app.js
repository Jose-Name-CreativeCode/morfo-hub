import cors from "cors";
import express from "express";
import { requireSession } from "./lib/auth.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { clientsRouter } from "./routes/clients.js";
import { incomeRouter } from "./routes/income.js";
import { expensesRouter } from "./routes/expenses.js";
import { quotesRouter } from "./routes/quotes.js";
import { settingsRouter } from "./routes/settings.js";
import { accountsRouter } from "./routes/accounts.js";
import { recurringRulesRouter } from "./routes/recurring-rules.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: (origin, callback) => {
        const allowedOrigins = [
          process.env.APP_ORIGIN,
          "http://localhost:5173",
          "http://127.0.0.1:5173",
        ].filter(Boolean);

        const isLocalDevelopmentOrigin =
          /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || "");

        if (
          !origin ||
          allowedOrigins.includes(origin) ||
          isLocalDevelopmentOrigin
        ) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
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

  app.use("/api/auth", authRouter);
  app.use("/api/health", healthRouter);
  app.use("/api/clients", requireSession, clientsRouter);
  app.use("/api/income", requireSession, incomeRouter);
  app.use("/api/expenses", requireSession, expensesRouter);
  app.use("/api/quotes", requireSession, quotesRouter);
  app.use("/api/settings", requireSession, settingsRouter);
  app.use("/api/accounts", requireSession, accountsRouter);
  app.use("/api/recurring-rules", requireSession, recurringRulesRouter);

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
