export const FINANCE_SCOPES = ["morfo"];

export function normalizeFinanceScope(value) {
  const scope = String(value || "morfo")
    .trim()
    .toLowerCase();
  return FINANCE_SCOPES.includes(scope) ? scope : "morfo";
}

export function canAccessFinanceRecord(record) {
  return Boolean(record);
}

export function visibleFinanceWhere(userId, scope) {
  if (!scope) return {};
  return { scope: normalizeFinanceScope(scope) };
}
