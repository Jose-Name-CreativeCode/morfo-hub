import { FUNDED_BY_ME, FUNDED_BY_PAPA } from "./card-ledger.js";
import { isFixedExpense } from "./casa-costs.js";
import { monthlyAmount } from "./reminders.js";

/**
 * Decisiones de la casa: ¿nos alcanza para un compromiso nuevo?
 *
 * Compara lo que entra con lo que cuesta la casa (el presupuesto de "Gastos
 * de la casa") y simula algo nuevo, como un carro, con todo lo que cuesta y
 * no sólo la mensualidad. El colchón es la parte de lo que entra que se
 * quiere que siga sobrando; con él se calcula lo máximo que cabe.
 *
 * Cada costo dice quién lo paga: lo de papá sale de la casa y cuenta para
 * decidir; lo de Manolo se muestra aparte y no toca el dinero de la casa.
 */

// Porcentaje de lo que entra que, por omisión, se quiere que sobre.
export const DEFAULT_CUSHION = 15;

export const EVERY_MONTH = "mes";
export const EVERY_YEAR = "año";

// Lo que cuesta tener un carro además de la mensualidad. El seguro y la
// gasolina los paga Manolo; lo demás, la casa.
export const CAR_TEMPLATE = [
  { id: "mensualidad", name: "Mensualidad", every: EVERY_MONTH, main: true },
  {
    id: "seguro",
    name: "Seguro del carro",
    every: EVERY_YEAR,
    paidBy: FUNDED_BY_ME,
  },
  {
    id: "gasolina",
    name: "Gasolina",
    every: EVERY_MONTH,
    paidBy: FUNDED_BY_ME,
  },
  { id: "servicios", name: "Servicios y mantenimiento", every: EVERY_YEAR },
  {
    id: "tramites",
    name: "Control vehicular y verificaciones",
    every: EVERY_YEAR,
  },
].map((line) => ({ amount: 0, paidBy: FUNDED_BY_PAPA, ...line }));

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function percentOf(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/** Lo que paga Manolo no sale de la casa. Sin dato, lo paga papá. */
export function paidByMe(line) {
  return line?.paidBy === FUNDED_BY_ME;
}

/** Lo que cuesta al mes un renglón: lo anual se reparte en 12. */
export function lineMonthly(line) {
  const amount = Number(line?.amount || 0);
  return line?.every === EVERY_YEAR ? amount / 12 : amount;
}

/** Los gastos de la casa que se pueden recortar: los variables con monto. */
export function variableItems(items = [], fixedCategories = []) {
  return items.filter(
    (item) =>
      monthlyAmount(item) > 0 &&
      !isFixedExpense({ category: item.category }, fixedCategories),
  );
}

/** Cuánto se libera al mes recortando cada gasto variable su porcentaje. */
export function savingsFromCuts(items = [], cuts = {}) {
  return round(
    items.reduce(
      (sum, item) =>
        sum + monthlyAmount(item) * (Number(cuts[item.id] || 0) / 100),
      0,
    ),
  );
}

/**
 * El panorama completo: cuánto sobra hoy, cuánto sobraría con lo nuevo, si
 * alcanza y lo máximo que cabe sin tocar el colchón.
 */
export function buildDecision({
  income = 0,
  budgetTotal = 0,
  saved = 0,
  cushion = DEFAULT_CUSHION,
  lines = [],
}) {
  const expenses = round(budgetTotal - saved);
  const freeNow = round(income - expenses);
  const sumOf = (rows) =>
    round(rows.reduce((sum, line) => sum + lineMonthly(line), 0));
  const houseLines = lines.filter((line) => !paidByMe(line));
  // Sólo lo que paga papá cuenta para saber si a la casa le alcanza.
  const planMonthly = sumOf(houseLines);
  const mineMonthly = sumOf(lines.filter(paidByMe));
  const main = houseLines.find((line) => line.main);
  const extras = round(planMonthly - (main ? lineMonthly(main) : 0));
  const freeAfter = round(freeNow - planMonthly);
  const reserve = round((income * Number(cushion || 0)) / 100);
  const maxCommit = round(freeNow - reserve);
  // Lo que tendría que entrar para pagar todo y que siga sobrando el colchón.
  const keep = 1 - Number(cushion || 0) / 100;
  const incomeNeeded =
    keep > 0 ? Math.ceil((expenses + planMonthly) / keep) : 0;

  let verdict = "alcanza";
  if (!income) verdict = "sin-ingreso";
  else if (!planMonthly && !mineMonthly) verdict = "sin-costos";
  else if (freeAfter < 0) verdict = "no-alcanza";
  else if (freeAfter < reserve) verdict = "justo";

  return {
    income: round(income),
    expenses,
    saved: round(saved),
    freeNow,
    freeNowPercent: percentOf(freeNow, income),
    planMonthly,
    mineMonthly,
    extras,
    freeAfter,
    freeAfterPercent: percentOf(freeAfter, income),
    reserve,
    maxCommit,
    // Para la mensualidad, ya descontando seguro, gasolina y lo demás.
    maxMain: round(maxCommit - extras),
    hasMain: Boolean(main),
    incomeNeeded,
    verdict,
  };
}
