import { normalizeText } from "./utils.js";

/**
 * Tarjeta Nu de Jose y dinero que Jose pone por papá.
 *
 * La tarjeta es una sola, pero se lleva en dos partes:
 * - Tu parte: gastos de Personal con Nu, que bajan con tus abonos.
 * - Parte de papá: gastos de Casa hechos con dinero de Jose (su Nu o su
 *   efectivo), que bajan cuando papá le devuelve el dinero.
 * Ninguno de estos movimientos cambia "Me queda": los gastos ya se contaron.
 */

export const CARD_PAYMENT_KIND = "card-payment";
export const REIMBURSEMENT_KIND = "papa-reimbursement";

export const FUNDED_BY_PAPA = "papa";
export const FUNDED_BY_ME = "mio";

const NU_STATEMENT_DAY = 7;
// Nu da del 18 al 20 para pagar; se avisa con el primer día para no pasarse.
const NU_PAYMENT_DAY = 18;

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

function pad(value) {
  return String(value).padStart(2, "0");
}

function toIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

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

/** Último corte ocurrido hasta hoy (incluido) y fechas relacionadas. */
export function nuCycleDates(today) {
  const reference = fromIso(today);
  const statement = new Date(
    reference.getFullYear(),
    reference.getMonth() - (reference.getDate() >= NU_STATEMENT_DAY ? 0 : 1),
    NU_STATEMENT_DAY,
    12,
  );
  const due = new Date(
    statement.getFullYear(),
    statement.getMonth(),
    NU_PAYMENT_DAY,
    12,
  );
  const nextStatement = new Date(
    statement.getFullYear(),
    statement.getMonth() + 1,
    NU_STATEMENT_DAY,
    12,
  );
  const currentStart = new Date(statement);
  currentStart.setDate(currentStart.getDate() + 1);

  return {
    statement: toIso(statement),
    due: toIso(due),
    currentStart: toIso(currentStart),
    nextStatement: toIso(nextStatement),
  };
}

/**
 * Tu parte de la Nu, como saldo corrido: todos los cargos hasta el último
 * corte menos todos tus abonos. Lo que sobre de abonos se aplica al periodo
 * que va corriendo.
 */
export function buildNuStatus({ expenses, payments, accounts = [], today }) {
  const dates = nuCycleDates(today);
  const charges = expenses.filter((expense) => isNuExpense(expense, accounts));

  const chargedToStatement = sumAmounts(
    charges.filter((expense) => String(expense.date) <= dates.statement),
  );
  const chargedCurrent = sumAmounts(
    charges.filter(
      (expense) =>
        String(expense.date) > dates.statement && String(expense.date) <= today,
    ),
  );
  const paid = sumAmounts(payments, "paidAmount");

  const statementPending = Math.max(0, chargedToStatement - paid);
  const extraPaid = Math.max(0, paid - chargedToStatement);

  return {
    ...dates,
    chargedToStatement,
    statementPending,
    isOverdue: statementPending > 0 && today > dates.due,
    currentPending: Math.max(0, chargedCurrent - extraPaid),
    paid,
    hasActivity: charges.length > 0 || payments.length > 0,
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
