/**
 * Cálculos fiscales de Morfo (persona física en RESICO).
 *
 * Todo se calcula sobre lo efectivamente cobrado en el mes, que es como paga
 * impuestos una persona física. Son estimados para saber cuánto apartar: los
 * números definitivos los confirma el contador.
 */

export const IVA_RATE = 0.16;

// Retención de ISR que hace una persona moral a un RESICO persona física.
export const RESICO_WITHHOLDING_RATE = 0.0125;

// Día límite para la declaración mensual.
export const DECLARATION_DAY = 17;

/**
 * Tabla mensual de ISR de RESICO para personas físicas: la tasa se aplica
 * sobre los ingresos cobrados y facturados del mes, sin deducciones.
 */
export const RESICO_BRACKETS = [
  { upTo: 25000, rate: 0.01 },
  { upTo: 50000, rate: 0.011 },
  { upTo: 83333.33, rate: 0.015 },
  { upTo: 208333.33, rate: 0.02 },
  { upTo: Infinity, rate: 0.025 },
];

export function resicoRate(monthlyIncome) {
  const bracket = RESICO_BRACKETS.find((item) => monthlyIncome <= item.upTo);
  return bracket ? bracket.rate : 0.025;
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function isInvoiced(record) {
  const value = String(record?.invoiced ?? record?.invoiceRequired ?? "")
    .trim()
    .toLowerCase();
  return value === "sí" || value === "si" || value === "true";
}

/** Lo cobrado en el mes, ya sin IVA: es la base del ISR. */
function baseOf(record) {
  const paid = Number(record?.paidAmount || 0);
  if (!paid) return 0;
  return isInvoiced(record) ? round(paid / (1 + IVA_RATE)) : paid;
}

function inMonth(record, month) {
  return String(record?.date || "").startsWith(month);
}

/** Reparto de un cobro entre los socios, según los porcentajes del proyecto. */
export function splitOf(record, partners) {
  const split = record?.split || {};
  const total = partners.reduce(
    (sum, partner) => sum + Number(split[partner.key] ?? partner.share ?? 0),
    0,
  );

  return partners.map((partner) => {
    const share = Number(split[partner.key] ?? partner.share ?? 0);
    return {
      key: partner.key,
      name: partner.name,
      percent: total ? (share / total) * 100 : 0,
    };
  });
}

/**
 * Resumen del mes: cobrado, impuestos estimados y cuánto le toca a cada socio.
 * `partners` es [{ key, name, share }] con el reparto por omisión.
 */
export function buildMonthlyTaxSummary({
  incomes = [],
  expenses = [],
  month,
  partners = [],
}) {
  const monthIncomes = incomes.filter(
    (income) => inMonth(income, month) && Number(income.paidAmount || 0) > 0,
  );
  const monthExpenses = expenses.filter((expense) => inMonth(expense, month));

  const invoiced = monthIncomes.filter(isInvoiced);
  const notInvoiced = monthIncomes.filter((income) => !isInvoiced(income));

  const collectedInvoiced = round(
    invoiced.reduce((sum, income) => sum + Number(income.paidAmount || 0), 0),
  );
  const collectedPlain = round(
    notInvoiced.reduce(
      (sum, income) => sum + Number(income.paidAmount || 0),
      0,
    ),
  );
  const taxableBase = round(
    invoiced.reduce((sum, income) => sum + baseOf(income), 0),
  );

  const ivaCharged = round(collectedInvoiced - taxableBase);
  const deductibleExpenses = monthExpenses.filter(
    (expense) => isInvoiced(expense) && expense.deductible !== false,
  );
  const expensesTotal = round(
    monthExpenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0,
    ),
  );
  const ivaCredit = round(
    deductibleExpenses.reduce(
      (sum, expense) =>
        sum +
        Number(expense.amount || 0) -
        Number(expense.amount || 0) / (1 + IVA_RATE),
      0,
    ),
  );

  const withheld = round(
    invoiced.reduce((sum, income) => sum + Number(income.withheldIsr || 0), 0),
  );
  const isrRate = resicoRate(taxableBase);
  const isrTotal = round(taxableBase * isrRate);
  const isrToPay = round(Math.max(0, isrTotal - withheld));
  const ivaToPay = round(Math.max(0, ivaCharged - ivaCredit));

  const collected = round(collectedInvoiced + collectedPlain);
  const profit = round(collected - ivaCharged - expensesTotal - isrToPay);

  const partnerTotals = partners.map((partner) => ({
    key: partner.key,
    name: partner.name,
    amount: 0,
  }));

  monthIncomes.forEach((income) => {
    const net = round(baseOf(income));
    splitOf(income, partners).forEach((row) => {
      const target = partnerTotals.find((item) => item.key === row.key);
      if (target)
        target.amount = round(target.amount + net * (row.percent / 100));
    });
  });

  return {
    month,
    collected,
    collectedInvoiced,
    collectedPlain,
    taxableBase,
    ivaCharged,
    ivaCredit,
    ivaToPay,
    isrRate,
    isrTotal,
    withheld,
    isrToPay,
    taxesToPay: round(ivaToPay + isrToPay),
    expensesTotal,
    profit,
    partnerTotals,
    incomes: monthIncomes,
    dueDate: `${month}-${String(DECLARATION_DAY).padStart(2, "0")}`,
  };
}

export { isInvoiced, baseOf };
