/**
 * Lógica financiera del espacio Casa: el ingreso son dos quincenas fijas de
 * $40,000 (día 15 y último día de cada mes) que se generan solas, y el saldo
 * disponible descuenta los gastos en efectivo/transferencia de inmediato pero
 * los de tarjeta Nu hasta el día de corte (18), que es cuando de verdad sale
 * el dinero.
 */

export const CASA_QUINCENA_AMOUNT = 40000;
const CARD_SETTLEMENT_DAY = { Nu: 18 };
const AUTO_INCOME_ID_PREFIX = "casa-quincena-";

function pad(value) {
  return String(value).padStart(2, "0");
}

function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Fechas de quincena (15 y último día del mes) desde `monthsBack` meses
 * atrás hasta hoy. Limitado a pocos meses para no generar historial viejo la
 * primera vez que alguien entra al espacio Casa.
 */
export function getCasaPaydates(referenceDate = new Date(), monthsBack = 1) {
  const todayIso = toISODate(referenceDate);
  const dates = [];

  for (let offset = monthsBack; offset >= 0; offset -= 1) {
    const cursor = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth() - offset,
      1,
    );
    const year = cursor.getFullYear();
    const monthIndex = cursor.getMonth();
    const lastDay = lastDayOfMonth(year, monthIndex);

    dates.push(`${year}-${pad(monthIndex + 1)}-15`);
    dates.push(`${year}-${pad(monthIndex + 1)}-${pad(lastDay)}`);
  }

  return dates.filter((date) => date <= todayIso);
}

export function getCasaAutoIncomeId(dateIso) {
  return `${AUTO_INCOME_ID_PREFIX}${dateIso}`;
}

export function isCasaAutoIncome(income) {
  return String(income?.id || "").startsWith(AUTO_INCOME_ID_PREFIX);
}

export function buildCasaAutoIncomeRecord(dateIso) {
  return {
    id: getCasaAutoIncomeId(dateIso),
    scope: "casa",
    client: "Quincena",
    date: dateIso,
    concept: "Quincena de casa",
    totalAmount: CASA_QUINCENA_AMOUNT,
    paidAmount: CASA_QUINCENA_AMOUNT,
    remainingAmount: 0,
    paymentStatus: "Pagado",
    paymentMethod: "Transferencia",
    invoiceRequired: "No",
    notes: "Generado automáticamente al llegar la fecha de pago.",
  };
}

/** Quincenas que ya deberían existir (por fecha) pero no están en `incomes`. */
export function getMissingCasaPaydates(incomes, referenceDate = new Date()) {
  const existingIds = new Set(
    incomes.filter(isCasaAutoIncome).map((income) => String(income.id)),
  );

  return getCasaPaydates(referenceDate).filter(
    (dateIso) => !existingIds.has(getCasaAutoIncomeId(dateIso)),
  );
}

/**
 * Un gasto en efectivo/transferencia sale de la cuenta el mismo día. Un gasto
 * con una tarjeta con día de corte conocido (Nu, día 18) no sale hasta ese
 * corte: si el gasto es antes o el mismo día 18, liquida ese mes; si es
 * después, liquida hasta el 18 del mes siguiente.
 */
export function getExpenseSettlementDate(expense) {
  const settlementDay = CARD_SETTLEMENT_DAY[expense.paymentMethod];
  if (!settlementDay || !expense.date) return expense.date;

  const [year, month, day] = expense.date.split("-").map(Number);
  const isSameMonth = day <= settlementDay;
  const targetMonthIndex = (isSameMonth ? month : month + 1) - 1;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const clampedDay = Math.min(
    settlementDay,
    lastDayOfMonth(targetYear, normalizedMonthIndex),
  );

  return `${targetYear}-${pad(normalizedMonthIndex + 1)}-${pad(clampedDay)}`;
}

/**
 * Saldo disponible real: ingresos ya recibidos menos gastos ya liquidados.
 * Los gastos de tarjeta que todavía no llegan a su día de corte se muestran
 * aparte como "pendiente por liquidar", no se restan todavía.
 */
export function computeCasaBalance(incomes, expenses, referenceDate = new Date()) {
  const todayIso = toISODate(referenceDate);

  const totalIncome = incomes
    .filter((income) => (income.date || "") <= todayIso)
    .reduce((sum, income) => sum + Number(income.paidAmount || 0), 0);

  let settledExpenses = 0;
  let pendingExpenses = 0;

  expenses.forEach((expense) => {
    const amount = Number(expense.amount || 0);
    const settlementDate = getExpenseSettlementDate(expense);

    if (settlementDate && settlementDate <= todayIso) {
      settledExpenses += amount;
    } else {
      pendingExpenses += amount;
    }
  });

  return {
    totalIncome,
    settledExpenses,
    pendingExpenses,
    balance: totalIncome - settledExpenses,
  };
}
