export const FINANCE_SCOPES = ["morfo", "personal", "casa"];

export function normalizeFinanceScope(value) {
  const scope = String(value || "morfo")
    .trim()
    .toLowerCase();
  return FINANCE_SCOPES.includes(scope) ? scope : "morfo";
}

export function ownerForScope(scope, userId) {
  return scope === "personal" ? userId : null;
}

export function canAccessFinanceRecord(record, userId) {
  if (!record) return false;
  if (record.scope !== "personal") return true;
  // Registros personales anteriores a esta versión no tenían propietario.
  return !record.ownerUserId || record.ownerUserId === userId;
}

export function visibleFinanceWhere(userId, scope) {
  const access = {
    OR: [
      { scope: { not: "personal" } },
      { ownerUserId: userId },
      { scope: "personal", ownerUserId: null },
    ],
  };

  if (!scope || scope === "resumen") return access;

  return {
    AND: [access, { scope: normalizeFinanceScope(scope) }],
  };
}
