import { isCardExpense } from "./finance-periods.js";
import { normalizeText } from "./utils.js";

/**
 * Periodos de una tarjeta: qué se paga en la próxima fecha y qué se va a la
 * siguiente.
 *
 * Un cargo entra en el estado de cuenta que cierra en el primer día de corte
 * a partir de ese cargo, y ese estado de cuenta se paga en el día de pago.
 * `payNextMonth` dice si ese pago cae en el mes siguiente al corte, que es lo
 * normal cuando el día de pago es anterior o cercano al de corte.
 */

export const DEFAULT_CUT_DAY = 8;
export const DEFAULT_PAY_DAY = 18;

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

function pad(value) {
  return String(value).padStart(2, "0");
}

function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function iso(year, monthIndex, day) {
  const cursor = new Date(year, monthIndex, 1);
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  return `${y}-${pad(m + 1)}-${pad(Math.min(day, lastDayOfMonth(y, m)))}`;
}

/** Las tarjetas configuradas en Ajustes, con su corte y su día de pago. */
export function cardSettings(method) {
  return {
    name: method?.name || "Tarjeta",
    cutDay: Number(method?.cutDay) || DEFAULT_CUT_DAY,
    payDay: Number(method?.payDay) || DEFAULT_PAY_DAY,
    // Por omisión el pago cae en el mes siguiente al corte.
    payNextMonth: method?.payNextMonth !== false,
  };
}

/** Cuándo se paga un cargo hecho en `date`. */
export function paymentDateFor(date, card) {
  const [year, month, day] = String(date).slice(0, 10).split("-").map(Number);
  const { cutDay, payDay, payNextMonth } = card;

  // El corte que alcanza a este cargo: el de este mes si todavía no pasa.
  const cutMonth = day <= cutDay ? month - 1 : month;
  const payMonth = cutMonth + (payNextMonth ? 1 : 0);
  return iso(year, payMonth, payDay);
}

export function paymentLabel(isoDate) {
  const [, month, day] = String(isoDate).split("-").map(Number);
  return `${day} de ${MONTHS[month - 1]}`;
}

/**
 * Los cargos de tarjeta agrupados por la fecha en que se pagan, de la más
 * próxima a la más lejana. `charges` son gastos; `payments` los abonos que ya
 * se hicieron, que bajan primero lo más viejo.
 */
export function groupChargesByPayment({
  expenses = [],
  payments = [],
  paymentMethods = [],
  card = cardSettings(),
}) {
  const name = normalizeText(card.name);
  const isThisCard = (record) =>
    isCardExpense(record, paymentMethods) &&
    (!name || normalizeText(record.paymentMethod) === name);

  const groups = new Map();
  expenses.filter(isThisCard).forEach((expense) => {
    const date = paymentDateFor(expense.date, card);
    const group = groups.get(date) || { date, total: 0, charges: [] };
    group.total += Number(expense.amount || 0);
    group.charges.push(expense);
    groups.set(date, group);
  });

  const rows = [...groups.values()]
    .map((group) => ({
      ...group,
      total: Math.round(group.total * 100) / 100,
      charges: group.charges.sort((a, b) =>
        String(a.date).localeCompare(String(b.date)),
      ),
      label: paymentLabel(group.date),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Lo abonado baja primero lo que se paga antes.
  let left = payments.reduce(
    (sum, payment) => sum + Number(payment.paidAmount || 0),
    0,
  );
  rows.forEach((row) => {
    const applied = Math.min(left, row.total);
    left -= applied;
    row.paid = Math.round(applied * 100) / 100;
    row.due = Math.round((row.total - applied) * 100) / 100;
  });

  return rows.filter((row) => row.due > 0.005 || row.paid > 0);
}
