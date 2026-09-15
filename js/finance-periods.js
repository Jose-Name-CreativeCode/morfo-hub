import { normalizeText } from "./utils.js";

/**
 * Periodos del Resumen de Personal y Casa.
 * Personal se lleva por mes; Casa por quincena (1-15 y 16-fin de mes).
 * "Entró" es un monto que el usuario escribe por periodo y se guarda como un
 * ingreso con id determinista (`kind: "period-income"`).
 */

export const PERIOD_INCOME_KIND = "period-income";

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const CREDIT_METHODS = [
  "nu",
  "tarjeta",
  "tarjeta de credito",
  "credito",
  "amex",
];

// Evita recorrer historiales absurdamente largos al calcular lo que sobró.
const MAX_CARRY_STEPS = 600;

export function usesQuincenas(scope) {
  return scope === "casa";
}

/** Lo que sobra (o falta) de un periodo pasa al siguiente sólo en Casa. */
export function carriesLeftover(scope) {
  return scope === "casa";
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function lastDayOfMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function periodForDate(scope, isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  return {
    scope,
    year,
    month: month - 1,
    half: usesQuincenas(scope) ? (day <= 15 ? 1 : 2) : 0,
  };
}

export function periodKey(period) {
  const base = `${period.year}-${pad(period.month + 1)}`;
  return period.half ? `${base}-q${period.half}` : base;
}

export function periodFromKey(scope, key) {
  const [year, month, half] = String(key).split("-");
  return {
    scope,
    year: Number(year),
    month: Number(month) - 1,
    half: half ? Number(half.slice(1)) : 0,
  };
}

export function shiftPeriod(period, delta) {
  let { year, month, half } = period;

  if (half) {
    // Cada mes tiene dos quincenas: se avanza en unidades de media quincena.
    const index = year * 24 + month * 2 + (half - 1) + delta;
    year = Math.floor(index / 24);
    month = Math.floor((index % 24) / 2);
    half = (index % 2) + 1;
  } else {
    const index = year * 12 + month + delta;
    year = Math.floor(index / 12);
    month = index % 12;
  }

  return { ...period, year, month, half };
}

export function periodRange(period) {
  const base = `${period.year}-${pad(period.month + 1)}`;
  const lastDay = lastDayOfMonth(period.year, period.month);

  if (period.half === 1) return { start: `${base}-01`, end: `${base}-15` };
  if (period.half === 2)
    return { start: `${base}-16`, end: `${base}-${lastDay}` };
  return { start: `${base}-01`, end: `${base}-${lastDay}` };
}

export function isDateInPeriod(isoDate, period) {
  const { start, end } = periodRange(period);
  const date = String(isoDate || "").slice(0, 10);
  return date >= start && date <= end;
}

export function periodLabel(period) {
  const monthName = MONTHS[period.month];
  if (period.half === 1) return `1 al 15 de ${monthName}`;
  if (period.half === 2) {
    return `16 al ${lastDayOfMonth(period.year, period.month)} de ${monthName}`;
  }
  return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)}`;
}

/** "esta quincena" / "este mes", para textos cortos. */
export function periodNoun(period) {
  return period.half ? "esta quincena" : "este mes";
}

export function periodIncomeId(scope, period, userId) {
  const key = periodKey(period);
  // En Personal cada usuario tiene su propio monto.
  return scope === "personal"
    ? `entro-personal-${userId}-${key}`
    : `entro-${scope}-${key}`;
}

export function isPeriodIncome(income) {
  return income?.kind === PERIOD_INCOME_KIND;
}

export function isOtherPayer(expense) {
  return normalizeText(expense?.payer).includes("papa");
}

export function isCreditExpense(expense, accounts = []) {
  const account = accounts.find(
    (item) => String(item.id) === String(expense?.accountId || ""),
  );
  if (account) return account.type === "credit";
  return CREDIT_METHODS.includes(normalizeText(expense?.paymentMethod));
}

function incomeAmount(income) {
  return Number(income?.paidAmount ?? income?.totalAmount ?? 0) || 0;
}

/**
 * Montos escritos por periodo. Si un periodo no tiene monto propio pero sí
 * ingresos registrados con el sistema anterior, se usan esos para no perder
 * el historial.
 */
function explicitIncomeByKey(scope, incomes) {
  const written = new Map();
  const legacy = new Map();

  incomes.forEach((income) => {
    if (!income?.date) return;
    const key = periodKey(periodForDate(scope, income.date));
    const target = isPeriodIncome(income) ? written : legacy;
    target.set(key, (target.get(key) || 0) + incomeAmount(income));
  });

  const amounts = new Map(legacy);
  written.forEach((amount, key) => amounts.set(key, amount));
  return { amounts, firstWrittenKey: [...written.keys()].sort()[0] || "" };
}

function resolveIncome(explicit, key) {
  if (explicit.has(key)) return { amount: explicit.get(key), copied: false };

  const previousKey = [...explicit.keys()]
    .filter((candidate) => candidate < key)
    .sort()
    .pop();

  return previousKey
    ? { amount: explicit.get(previousKey), copied: true }
    : { amount: 0, copied: false };
}

/** Gasto que cuenta para "Me queda": en Personal no cuenta lo que pagó papá. */
function countedSpent(scope, expenses, period) {
  return expenses
    .filter((expense) => isDateInPeriod(expense.date, period))
    .filter((expense) => scope !== "personal" || !isOtherPayer(expense))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
}

/**
 * Lo que sobró de periodos anteriores. Empieza a contar desde el primer monto
 * escrito con el Resumen, para que el historial previo no arrastre saldos.
 */
function carryInto(scope, period, income, expenses) {
  const firstKey = income.firstWrittenKey;
  const targetKey = periodKey(period);
  if (!carriesLeftover(scope) || !firstKey || firstKey >= targetKey) return 0;

  const explicit = income.amounts;

  let cursor = periodFromKey(scope, firstKey);
  let carry = 0;

  for (let step = 0; step < MAX_CARRY_STEPS; step += 1) {
    const key = periodKey(cursor);
    if (key >= targetKey) break;
    carry +=
      resolveIncome(explicit, key).amount -
      countedSpent(scope, expenses, cursor);
    cursor = shiftPeriod(cursor, 1);
  }

  return carry;
}

export function buildPeriodSummary({
  scope,
  period,
  incomes,
  expenses,
  accounts = [],
}) {
  const incomeByKey = explicitIncomeByKey(scope, incomes);
  const key = periodKey(period);
  const income = resolveIncome(incomeByKey.amounts, key);
  const periodExpenses = expenses.filter((expense) =>
    isDateInPeriod(expense.date, period),
  );

  const total = periodExpenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0,
  );
  const other = periodExpenses
    .filter(isOtherPayer)
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const credit = periodExpenses
    .filter((expense) => isCreditExpense(expense, accounts))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const spent = scope === "personal" ? total - other : total;
  const carryIn = carryInto(scope, period, incomeByKey, expenses);
  const available = income.amount + carryIn;

  return {
    key,
    income: income.amount,
    incomeCopied: income.copied,
    hasIncome: incomeByKey.amounts.size > 0,
    carryIn,
    available,
    spent,
    total,
    paidByOther: other,
    credit,
    cashAndTransfer: total - credit,
    left: available - spent,
    percent: available > 0 ? Math.round((spent / available) * 100) : 0,
    expenses: periodExpenses,
  };
}
