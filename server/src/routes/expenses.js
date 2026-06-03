import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { parseJsonRecord } from "../lib/json-record.js";

export const expensesRouter = Router();

function mapExpensePayload(body = {}) {
  const id = String(body.id || crypto.randomUUID()).trim();
  const record = {
    ...body,
    id,
  };

  return {
    id,
    date: body.date ? String(body.date) : null,
    concept: body.concept ? String(body.concept) : null,
    category: body.category ? String(body.category) : null,
    paymentMethod: body.paymentMethod ? String(body.paymentMethod) : null,
    invoice: body.invoice ? String(body.invoice) : null,
    amount: body.amount !== undefined ? Number(body.amount || 0) : null,
    rawJson: JSON.stringify(record),
  };
}

function mapExpenseRecord(record) {
  const data = parseJsonRecord(record.rawJson, {});
  return {
    ...data,
    id: record.id,
    createdAtMs: record.createdAt.getTime(),
    updatedAtMs: record.updatedAt.getTime(),
  };
}

expensesRouter.get("/", async (_request, response) => {
  const expenses = await prisma.expenseRecord.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  response.json(expenses.map(mapExpenseRecord));
});

expensesRouter.post("/", async (request, response) => {
  const payload = mapExpensePayload(request.body);
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
  const payload = mapExpensePayload({
    ...request.body,
    id: request.params.id,
  });

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

  await prisma.expenseRecord.delete({
    where: { id: request.params.id },
  });

  response.status(204).send();
});
