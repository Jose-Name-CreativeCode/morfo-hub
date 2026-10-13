import { isCardExpense } from "./finance-periods.js";
import { normalizeText } from "./utils.js";

/**
 * Periodos de una tarjeta: qué se paga en la próxima fecha y qué se va a la
 * siguiente.
 *
 * Un cargo entra en el estado de cuenta que cierra en el primer día de corte
 * a partir de ese cargo, y ese estado de cuenta se paga en el día de pago. Con
 * corte 8 y pago 18, lo que se gastó del 9 de septiembre al 8 de octubre se
 * paga el 18 de octubre, en ese mismo mes. Si el día de pago fuera anterior al
 * de corte, ese pago caería en el mes siguiente.
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

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
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

function clampDay(value, fallback) {
  const day = Math.trunc(Number(value));
  return day >= 1 && day <= 31 ? day : fallback;
}

/** El corte y el día de pago de una tarjeta, como se guardan en Ajustes. */
export function cardSettings(method) {
  const cutDay = clampDay(method?.cutDay, DEFAULT_CUT_DAY);
  const payDay = clampDay(method?.payDay, DEFAULT_PAY_DAY);
  return {
    name: method?.name || "Tarjeta",
    cutDay,
    payDay,
    // Si se paga en un día anterior al corte, ese pago cae el mes siguiente.
    payNextMonth: payDay <= cutDay,
  };
}

/** La tarjeta de la lista de formas de pago; la primera si no se pide una. */
export function findCard(paymentMethods = [], name = "") {
  const wanted = normalizeText(name);
  const cards = paymentMethods.filter((method) =>
    isCardExpense({ paymentMethod: method.name }, paymentMethods),
  );
  const method = wanted
    ? cards.find((card) => normalizeText(card.name) === wanted)
    : cards[0];
  return method ? cardSettings(method) : null;
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
 * Los cargos agrupados por la fecha en que se pagan, de la más próxima a la
 * más lejana.
 *
 * `charges` son los gastos con la tarjeta; `immediate`, los que no pasaron por
 * ella (efectivo, transferencia), que se deben desde ya y van primero.
 * `payments` son los abonos que ya se hicieron, que bajan primero lo más viejo.
 */
export function groupByPaymentDate({
  charges = [],
  immediate = [],
  payments = [],
  card = cardSettings(),
}) {
  const groups = new Map();
  const add = (date, label, expense) => {
    const group = groups.get(date) || { date, label, total: 0, charges: [] };
    group.total += Number(expense.amount || 0);
    group.charges.push(expense);
    groups.set(date, group);
  };

  // Sin fecha de pago: ese dinero ya salió, así que ordena antes que todo.
  immediate.forEach((expense) => add("", "Ya salió", expense));
  charges.forEach((expense) => {
    const date = paymentDateFor(expense.date, card);
    add(date, paymentLabel(date), expense);
  });

  const rows = [...groups.values()]
    .map((group) => ({
      ...group,
      total: round(group.total),
      charges: group.charges.sort((a, b) =>
        String(a.date).localeCompare(String(b.date)),
      ),
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
    row.paid = round(applied);
    row.due = round(row.total - applied);
  });

  return rows.filter((row) => row.due > 0.005);
}
