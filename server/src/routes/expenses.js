import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { parseJsonRecord } from "../lib/json-record.js";
import {
  canAccessFinanceRecord,
  normalizeFinanceScope,
  ownerForScope,
  visibleFinanceWhere,
} from "../lib/finance-access.js";

export const expensesRouter = Router();

function mapExpensePayload(body = {}, userId, existing = null) {
  const id = String(body.id || crypto.randomUUID()).trim();
  const scope = normalizeFinanceScope(body.scope || existing?.scope);
  const ownerUserId =
    scope === "personal"
      ? existing?.ownerUserId || ownerForScope(scope, userId)
      : null;
  const record = {
    ...body,
    id,
    scope,
    accountId: body.accountId ? String(body.accountId) : null,
  };

  return {
    id,
    date: body.date ? String(body.date) : null,
    concept: body.concept ? String(body.concept) : null,
    category: body.category ? String(body.category) : null,
    paymentMethod: body.paymentMethod ? String(body.paymentMethod) : null,
    invoice: body.invoice ? String(body.invoice) : null,
    amount: body.amount !== undefined ? Number(body.amount || 0) : null,
    scope,
    accountId: body.accountId ? String(body.accountId) : null,
    ownerUserId,
    rawJson: JSON.stringify(record),
  };
}

function mapExpenseRecord(record) {
  const data = parseJsonRecord(record.rawJson, {});
  return {
    ...data,
    id: record.id,
    scope: record.scope || data.scope || "morfo",
    accountId: record.accountId || data.accountId || "",
    createdAtMs: record.createdAt.getTime(),
    updatedAtMs: record.updatedAt.getTime(),
  };
}

expensesRouter.get("/", async (request, response) => {
  const expenses = await prisma.expenseRecord.findMany({
    where: visibleFinanceWhere(request.auth.user.id, request.query.scope),
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  response.json(expenses.map(mapExpenseRecord));
});

expensesRouter.post("/", async (request, response) => {
  const requestedId = String(request.body?.id || "").trim();
  const existing = requestedId
    ? await prisma.expenseRecord.findUnique({ where: { id: requestedId } })
    : null;
  if (existing && !canAccessFinanceRecord(existing, request.auth.user.id)) {
    response.status(403).json({ message: "No tienes acceso a este gasto." });
    return;
  }
  const payload = mapExpensePayload(
    request.body,
    request.auth.user.id,
    existing,
  );
  if (!payload.id) {
    response.status(400).json({
      error: "invalid_expense_id",
      message: "El id del gasto es obligatorio.",
    });
    return;
  }

  const saved = await prisma.expenseRecord.upsert({
    where: { id: payload.id },
    update: payload,
    create: payload,
  });

  response.status(201).json(mapExpenseRecord(saved));
});

expensesRouter.put("/:id", async (request, response) => {
  const existing = await prisma.expenseRecord.findUnique({
    where: { id: request.params.id },
  });

  if (existing && !canAccessFinanceRecord(existing, request.auth.user.id)) {
    response.status(403).json({
      error: "forbidden",
      message: "No tienes acceso a este gasto personal.",
    });
    return;
  }

  const payload = mapExpensePayload(
    {
      ...request.body,
      id: request.params.id,
    },
    request.auth.user.id,
    existing,
  );

  const updated = await prisma.expenseRecord.upsert({
    where: { id: request.params.id },
    update: payload,
    create: payload,
  });

  response.json(mapExpenseRecord(updated));
});

expensesRouter.delete("/:id", async (request, response) => {
  const existing = await prisma.expenseRecord.findUnique({
    where: { id: request.params.id },
  });

  if (!existing) {
    response.status(404).json({
      error: "expense_not_found",
      message: "No se encontró el gasto solicitado.",
    });
    return;
  }

  if (!canAccessFinanceRecord(existing, request.auth.user.id)) {
    response.status(403).json({
      error: "forbidden",
      message: "No tienes acceso a este gasto personal.",
    });
    return;
  }

  await prisma.expenseRecord.delete({
    where: { id: request.params.id },
  });

  response.status(204).send();
});
