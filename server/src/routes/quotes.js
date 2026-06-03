import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { parseJsonRecord } from "../lib/json-record.js";

export const quotesRouter = Router();

function mapQuotePayload(body = {}) {
  const id = String(body.id || "").trim();
  const record = {
    ...body,
    id,
  };

  return {
    id,
    publicId: body.publicId ? String(body.publicId) : null,
    client: body.client ? String(body.client) : null,
    date: body.date ? String(body.date) : null,
    title: body.title ? String(body.title) : null,
    serviceType: body.serviceType ? String(body.serviceType) : null,
    status: body.status ? String(body.status) : null,
    paymentStatus: body.paymentStatus ? String(body.paymentStatus) : null,
    paymentMethod: body.paymentMethod ? String(body.paymentMethod) : null,
    total: body.total !== undefined ? Number(body.total || 0) : null,
    totalPaid: body.totalPaid !== undefined ? Number(body.totalPaid || 0) : null,
    remainingAmount:
      body.remainingAmount !== undefined
        ? Number(body.remainingAmount || 0)
        : null,
    linkedIncomeId: body.linkedIncomeId ? String(body.linkedIncomeId) : null,
    rawJson: JSON.stringify(record),
  };
}

function mapQuoteRecord(record) {
  const data = parseJsonRecord(record.rawJson, {});
  return {
    ...data,
    id: record.id,
    publicId: record.publicId || data.publicId || "",
    createdAtMs: record.createdAt.getTime(),
    updatedAtMs: record.updatedAt.getTime(),
  };
}

quotesRouter.get("/", async (_request, response) => {
  const quotes = await prisma.quoteRecord.findMany({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  response.json(quotes.map(mapQuoteRecord));
});

quotesRouter.post("/", async (request, response) => {
  const payload = mapQuotePayload(request.body);
  if (!payload.id) {
    response.status(400).json({
      error: "invalid_quote_id",
      message: "El id de la cotización es obligatorio.",
    });
    return;
  }

  const saved = await prisma.quoteRecord.upsert({
    where: { id: payload.id },
    update: payload,
    create: payload,
  });

  response.status(201).json(mapQuoteRecord(saved));
});

quotesRouter.put("/:id", async (request, response) => {
  const existing = await prisma.quoteRecord.findUnique({
    where: { id: request.params.id },
  });

  if (!existing) {
    response.status(404).json({
      error: "quote_not_found",
      message: "No se encontró la cotización solicitada.",
    });
    return;
  }

  const payload = mapQuotePayload({
    ...request.body,
    id: request.params.id,
  });

  const updated = await prisma.quoteRecord.update({
    where: { id: request.params.id },
    data: payload,
  });

  response.json(mapQuoteRecord(updated));
});

quotesRouter.delete("/:id", async (request, response) => {
  const existing = await prisma.quoteRecord.findUnique({
    where: { id: request.params.id },
  });

  if (!existing) {
    response.status(404).json({
      error: "quote_not_found",
      message: "No se encontró la cotización solicitada.",
    });
    return;
  }

  await prisma.quoteRecord.delete({
    where: { id: request.params.id },
  });

  response.status(204).send();
});
