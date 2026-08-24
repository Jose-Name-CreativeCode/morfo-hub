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

export const incomeRouter = Router();

function mapIncomePayload(body = {}, userId, existing = null) {
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
    scope,
    accountId: body.accountId ? String(body.accountId) : null,
    ownerUserId,
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
    scope: record.scope || data.scope || "morfo",
    accountId: record.accountId || data.accountId || "",
    createdAtMs: record.createdAt.getTime(),
    updatedAtMs: record.updatedAt.getTime(),
  };
}

incomeRouter.get("/", async (request, response) => {
  const incomes = await prisma.incomeRecord.findMany({
    where: visibleFinanceWhere(request.auth.user.id, request.query.scope),
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  response.json(incomes.map(mapIncomeRecord));
});

incomeRouter.post("/", async (request, response) => {
  const requestedId = String(request.body?.id || "").trim();
  const existing = requestedId
    ? await prisma.incomeRecord.findUnique({ where: { id: requestedId } })
    : null;
  if (existing && !canAccessFinanceRecord(existing, request.auth.user.id)) {
    response.status(403).json({ message: "No tienes acceso a este ingreso." });
    return;
  }
  const payload = mapIncomePayload(
    request.body,
    request.auth.user.id,
    existing,
  );
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
  const existing = await prisma.incomeRecord.findUnique({
    where: { id: request.params.id },
  });

  if (existing && !canAccessFinanceRecord(existing, request.auth.user.id)) {
    response.status(403).json({
      error: "forbidden",
      message: "No tienes acceso a este ingreso personal.",
    });
    return;
  }

  const payload = mapIncomePayload(
    {
      ...request.body,
      id: request.params.id,
    },
    request.auth.user.id,
    existing,
  );

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

  if (!canAccessFinanceRecord(existing, request.auth.user.id)) {
    response.status(403).json({
      error: "forbidden",
      message: "No tienes acceso a este ingreso personal.",
    });
    return;
  }

  await prisma.incomeRecord.delete({
    where: { id: request.params.id },
  });

  response.status(204).send();
});
