import { periodRange } from "./finance-periods.js";
import { normalizeText } from "./utils.js";

/**
 * Deudas de Jose: sus tarjetas y el dinero que pone por papá.
 *
 * - Personal: lo que Jose debe es lo gastado con tarjeta menos sus pagos.
 * - Casa: gastos hechos con dinero de Jose (su Nu o su efectivo), que bajan
 *   cuando papá le devuelve el dinero. Eso no cambia los gastos de Casa.
 */

export const CARD_PAYMENT_KIND = "card-payment";
export const REIMBURSEMENT_KIND = "papa-reimbursement";

export const FUNDED_BY_PAPA = "papa";
export const FUNDED_BY_ME = "mio";

// Formas de pago que no dejan deuda: se pagan en el momento.
const NON_CARD_METHODS = ["", "efectivo", "transferencia", "otro"];

const SHORT_MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function fromIso(isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function sumAmounts(records, field = "amount") {
  return records.reduce((sum, record) => sum + Number(record?.[field] || 0), 0);
}

export function shortDate(isoDate) {
  const date = fromIso(isoDate);
  return `${date.getDate()} ${SHORT_MONTHS[date.getMonth()]}`;
}

export function isNuExpense(expense, accounts = []) {
  const account = accounts.find(
    (item) => String(item.id) === String(expense?.accountId || ""),
  );
  const name = normalizeText(account?.name || expense?.paymentMethod);
  return (
    name === "nu" || name.startsWith("nu ") || name.startsWith("tarjeta nu")
  );
}

export function isCardPayment(income) {
  return income?.kind === CARD_PAYMENT_KIND;
}

export function isReimbursement(income) {
  return income?.kind === REIMBURSEMENT_KIND;
}

/**
 * De quién fue el dinero de un gasto de Casa. Si no se indicó, lo pagado con
 * la Nu se considera de Jose y lo demás de papá.
 */
export function fundedBy(expense, accounts = []) {
  if (
    expense?.fundedBy === FUNDED_BY_ME ||
    expense?.fundedBy === FUNDED_BY_PAPA
  ) {
    return expense.fundedBy;
  }
  return isNuExpense(expense, accounts) ? FUNDED_BY_ME : FUNDED_BY_PAPA;
}

/** Gasto hecho con tarjeta: lo que genera deuda que luego se paga. */
export function isCardExpense(expense, accounts = []) {
  const account = accounts.find(
    (item) => String(item.id) === String(expense?.accountId || ""),
  );
  if (account) return ["credit", "debit"].includes(account.type);
  return !NON_CARD_METHODS.includes(normalizeText(expense?.paymentMethod));
}

/**
 * Deuda de Personal al cierre del periodo que se ve: todos los gastos con
 * tarjeta hasta esa fecha menos todos los pagos hasta esa fecha.
 */
export function buildDebtSummary({
  expenses,
  payments,
  period,
  accounts = [],
}) {
  const { start, end } = periodRange(period);
  const upToEnd = (record) => String(record.date || "") <= end;
  const inPeriod = (record) =>
    String(record.date || "") >= start && upToEnd(record);

  const cardExpenses = expenses.filter((expense) =>
    isCardExpense(expense, accounts),
  );
  const charged = sumAmounts(cardExpenses.filter(upToEnd));
  const paid = sumAmounts(payments.filter(upToEnd), "paidAmount");
  const periodExpenses = expenses.filter(inPeriod);
  const periodCard = sumAmounts(
    periodExpenses.filter((expense) => isCardExpense(expense, accounts)),
  );
  const periodTotal = sumAmounts(periodExpenses);

  return {
    debt: charged - paid,
    charged,
    paid,
    percentPaid:
      charged > 0 ? Math.min(100, Math.round((paid / charged) * 100)) : 0,
    spentInPeriod: periodTotal,
    paidInPeriod: sumAmounts(payments.filter(inPeriod), "paidAmount"),
    cardInPeriod: periodCard,
    cashInPeriod: periodTotal - periodCard,
    payments: payments.filter(inPeriod),
  };
}

/** Lo que Jose ha puesto por papá en Casa menos lo que papá ya le devolvió. */
export function buildPapaDebt({ expenses, reimbursements, accounts = [] }) {
  const fronted = expenses.filter(
    (expense) => fundedBy(expense, accounts) === FUNDED_BY_ME,
  );
  const frontedTotal = sumAmounts(fronted);
  const repaid = sumAmounts(reimbursements, "paidAmount");

  return {
    frontedTotal,
    repaid,
    balance: frontedTotal - repaid,
  };
}
