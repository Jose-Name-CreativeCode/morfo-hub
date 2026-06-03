import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

function resolveDatabasePath(databaseUrl) {
  const fallback = path.resolve("prisma/dev.db");
  if (!databaseUrl) return fallback;

  if (!databaseUrl.startsWith("file:")) {
    return fallback;
  }

  const filePath = databaseUrl.slice("file:".length);
  return path.resolve(filePath);
}

const databasePath = resolveDatabasePath(process.env.DATABASE_URL);
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);

db.exec(`
  CREATE TABLE IF NOT EXISTS "Client" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "status" TEXT,
    "invoiceRequired" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS "AppSettings" (
    "id" TEXT PRIMARY KEY NOT NULL,
    "agencyName" TEXT NOT NULL DEFAULT 'Morfo Studio',
    "agencyEmail" TEXT NOT NULL DEFAULT '',
    "agencyPhone" TEXT NOT NULL DEFAULT '',
    "agencyAddress" TEXT NOT NULL DEFAULT '',
    "agencyWebsite" TEXT NOT NULL DEFAULT '',
    "terms" TEXT NOT NULL DEFAULT '',
    "invoiceTax" REAL NOT NULL DEFAULT 16,
    "invoiceNote" TEXT NOT NULL DEFAULT '',
    "advancePercent" INTEGER NOT NULL DEFAULT 50,
    "paymentMethodsJson" TEXT NOT NULL DEFAULT '["Transferencia","Efectivo","Tarjeta","Otro"]',
    "bankDetails" TEXT NOT NULL DEFAULT '',
    "bankDetailsInvoice" TEXT NOT NULL DEFAULT 'Banco: BBVA\nTitular: Morfo Studio S.A. de C.V.\nCLABE: 012345678901234567\nRFC: MOR000000XXX\nConcepto: Nombre del cliente + servicio',
    "bankDetailsNoInvoice" TEXT NOT NULL DEFAULT 'Banco: Nu\nTitular: Nombre Apellido\nCLABE: 987654321098765432\nConcepto: Nombre del cliente + servicio',
    "legalNote" TEXT NOT NULL DEFAULT '',
    "serviceTemplatesJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log(`SQLite ready at ${databasePath}`);
db.close();
