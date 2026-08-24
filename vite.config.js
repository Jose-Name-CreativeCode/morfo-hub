import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import process from "node:process";
import { defineConfig } from "vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const base = process.env.VITE_BASE_PATH || "/";

export default defineConfig({
  base,
  server: {
    port: 5173,
    open: "/index.html",
  },
  preview: {
    port: 4173,
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        login: resolve(__dirname, "login.html"),
        dashboard: resolve(__dirname, "dashboard.html"),
        movements: resolve(__dirname, "movements.html"),
        financeSettings: resolve(__dirname, "finance-settings.html"),
        clients: resolve(__dirname, "clients.html"),
        income: resolve(__dirname, "income.html"),
        expenses: resolve(__dirname, "expenses.html"),
        quotes: resolve(__dirname, "quotes.html"),
        reports: resolve(__dirname, "reports.html"),
        maintenance: resolve(__dirname, "maintenance.html"),
        settings: resolve(__dirname, "settings.html"),
      },
    },
  },
});
