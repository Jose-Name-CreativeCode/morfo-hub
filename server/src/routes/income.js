import { Router } from "express";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { parseJsonRecord } from "../lib/json-record.js";

export const incomeRouter = Router();

function mapIncomePayload(body = {}) {
  const id = String(body.id || crypto.randomUUID()).trim();
  const record = {
    ...body,
    id,
  };

  return {
    id,
    publicId: body.publicId ? String(body.publicId) : null,
    quoteId: body.quoteId ? String(body.quoteId) : null,
    quotePublicId: body.quotePublicId ? String(body.quotePublicId) : null,
    client: body.client ? String(body.client) : null,
    date: body.date ? String(body.date) : null,
    concept: body.concept ? String(body.concept) : null,
    paymentStatus: body.paymentStatus ? String(body.paymentStatus) : null,
    paymentMethod: body.paymentMethod ? String(body.paymentMethod) : null,
    totalAmount:
      body.totalAmount !== undefined ? Number(body.totalAmount || 0) : null,
    paidAmount:
      body.paidAmount !== undefined ? Number(body.paidAmount || 0) : null,
    remainingAmount:
      body.remainingAmount !== undefined
        ? Number(body.remainingAmount || 0)
        : null,
    invoiceRequired: body.invoiceRequired ? String(body.invoiceRequired) : null,
    rawJson: JSON.stringify(record),
  };
}

function mapIncomeRecord(record) {
  const data = parseJsonRecord(record.rawJson, {});
  return {
    ...data,
    id: record.id,
    publicId: record.publicId || data.publicId || "",
    quoteId: record.quoteId || data.quoteId || "",
    quotePublicId: record.quotePublicId || data.quotePublicId || "",
    createdAtMs: record.createdAt.getTime(),
    updatedAtMs: record.updatedAt.getTime(),
  };
}

incomeRouter.get("/", async (_request, response) => {
  const incomes = await prisma.incomeRecord.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  response.json(incomes.map(mapIncomeRecord));
});

incomeRouter.post("/", async (request, response) => {
  const payload = mapIncomePayload(request.body);
  if (!payload.id) {
    response.status(400).json({
      error: "invalid_income_id",
      message: "El id del ingreso es obligatorio.",
    });
    return;
  }

  const saved = await prisma.incomeRecord.upsert({
    where: { id: payload.id },
    update: payload,
    create: payload,
  });

  response.status(201).json(mapIncomeRecord(saved));
});

incomeRouter.put("/:id", async (request, response) => {
  const payload = mapIncomePayload({
    ...request.body,
    id: request.params.id,
  });

  const updated = await prisma.incomeRecord.upsert({
    where: { id: request.params.id },
    update: payload,
    create: payload,
  });

  response.json(mapIncomeRecord(updated));
});

incomeRouter.delete("/:id", async (request, response) => {
  const existing = await prisma.incomeRecord.findUnique({
    where: { id: request.params.id },
  });

  if (!existing) {
    response.status(404).json({
      error: "income_not_found",
      message: "No se encontró el ingreso solicitado.",
    });
    return;
  }

  await prisma.incomeRecord.delete({
    where: { id: request.params.id },
  });

  response.status(204).send();
});
