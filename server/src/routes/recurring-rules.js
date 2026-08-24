import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import {
  canAccessFinanceRecord,
  normalizeFinanceScope,
  ownerForScope,
  visibleFinanceWhere,
} from "../lib/finance-access.js";

export const recurringRulesRouter = Router();

function rulePayload(body, userId, existing = null) {
  const scope = normalizeFinanceScope(body.scope || existing?.scope);
  return {
    scope,
    name: String(body.name || "").trim(),
    type: body.type === "income" ? "income" : "expense",
    amount: Number(body.amount || 0),
    category: String(body.category || "").trim(),
    accountId: body.accountId ? String(body.accountId) : null,
    frequency: ["weekly", "biweekly", "monthly"].includes(body.frequency)
      ? body.frequency
      : "monthly",
    dayOne: body.dayOne ? Number(body.dayOne) : null,
    dayTwo: body.dayTwo ? Number(body.dayTwo) : null,
    ownerUserId:
      scope === "personal"
        ? existing?.ownerUserId || ownerForScope(scope, userId)
        : null,
    isActive: body.isActive !== false,
  };
}

recurringRulesRouter.get("/", async (request, response) => {
  const rules = await prisma.recurringRule.findMany({
    where: visibleFinanceWhere(request.auth.user.id, request.query.scope),
    orderBy: [{ scope: "asc" }, { type: "asc" }, { name: "asc" }],
  });
  response.json(rules);
});

recurringRulesRouter.post("/", async (request, response) => {
  const payload = rulePayload(request.body, request.auth.user.id);
  if (!payload.name || payload.amount <= 0) {
    response.status(400).json({
      error: "invalid_rule",
      message: "La regla necesita nombre y un monto mayor a cero.",
    });
    return;
  }
  const rule = await prisma.recurringRule.create({ data: payload });
  response.status(201).json(rule);
});

recurringRulesRouter.put("/:id", async (request, response) => {
  const existing = await prisma.recurringRule.findUnique({
    where: { id: request.params.id },
  });
  if (!existing) {
    response.status(404).json({ message: "No se encontró la regla." });
    return;
  }
  if (!canAccessFinanceRecord(existing, request.auth.user.id)) {
    response.status(403).json({ message: "No tienes acceso a esta regla." });
    return;
  }
  const rule = await prisma.recurringRule.update({
    where: { id: existing.id },
    data: rulePayload(request.body, request.auth.user.id, existing),
  });
  response.json(rule);
});

recurringRulesRouter.delete("/:id", async (request, response) => {
  const existing = await prisma.recurringRule.findUnique({
    where: { id: request.params.id },
  });
  if (!existing) {
    response.status(404).json({ message: "No se encontró la regla." });
    return;
  }
  if (!canAccessFinanceRecord(existing, request.auth.user.id)) {
    response.status(403).json({ message: "No tienes acceso a esta regla." });
    return;
  }
  await prisma.recurringRule.delete({ where: { id: existing.id } });
  response.status(204).send();
});
