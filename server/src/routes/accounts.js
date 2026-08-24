import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  canAccessFinanceRecord,
  normalizeFinanceScope,
  ownerForScope,
  visibleFinanceWhere,
} from "../lib/finance-access.js";

export const accountsRouter = Router();

function accountPayload(body, userId, existing = null) {
  const scope = normalizeFinanceScope(body.scope || existing?.scope);
  return {
    scope,
    name: String(body.name || "").trim(),
    type: String(body.type || "bank").trim(),
    institution: String(body.institution || "").trim(),
    startingBalance: Number(body.startingBalance || 0),
    creditLimit:
      body.creditLimit === "" || body.creditLimit == null
        ? null
        : Number(body.creditLimit),
    statementDay:
      body.statementDay === "" || body.statementDay == null
        ? null
        : Number(body.statementDay),
    paymentDay:
      body.paymentDay === "" || body.paymentDay == null
        ? null
        : Number(body.paymentDay),
    color: String(body.color || "#7c5cff"),
    ownerUserId:
      scope === "personal"
        ? existing?.ownerUserId || ownerForScope(scope, userId)
        : null,
    isActive: body.isActive !== false,
  };
}

accountsRouter.get("/", async (request, response) => {
  const accounts = await prisma.financialAccount.findMany({
    where: visibleFinanceWhere(request.auth.user.id, request.query.scope),
    orderBy: [{ scope: "asc" }, { name: "asc" }],
  });
  response.json(accounts);
});

accountsRouter.post("/", async (request, response) => {
  const payload = accountPayload(request.body, request.auth.user.id);
  if (!payload.name) {
    response.status(400).json({
      error: "invalid_account",
      message: "El nombre de la cuenta es obligatorio.",
    });
    return;
  }

  const account = await prisma.financialAccount.create({ data: payload });
  response.status(201).json(account);
});

accountsRouter.put("/:id", async (request, response) => {
  const existing = await prisma.financialAccount.findUnique({
    where: { id: request.params.id },
  });
  if (!existing) {
    response.status(404).json({ message: "No se encontró la cuenta." });
    return;
  }
  if (!canAccessFinanceRecord(existing, request.auth.user.id)) {
    response.status(403).json({ message: "No tienes acceso a esta cuenta." });
    return;
  }

  const account = await prisma.financialAccount.update({
    where: { id: existing.id },
    data: accountPayload(request.body, request.auth.user.id, existing),
  });
  response.json(account);
});

accountsRouter.delete("/:id", async (request, response) => {
  const existing = await prisma.financialAccount.findUnique({
    where: { id: request.params.id },
  });
  if (!existing) {
    response.status(404).json({ message: "No se encontró la cuenta." });
    return;
  }
  if (!canAccessFinanceRecord(existing, request.auth.user.id)) {
    response.status(403).json({ message: "No tienes acceso a esta cuenta." });
    return;
  }

  await prisma.financialAccount.update({
    where: { id: existing.id },
    data: { isActive: false },
  });
  response.status(204).send();
});
