import { monthlyAmount } from "./reminders.js";
import { normalizeText } from "./utils.js";

/**
 * Cuánto cuesta la casa al mes.
 *
 * Separa lo fijo (lo que se paga todos los meses: camioneta, seguro,
 * mantenimiento…) de lo variable, y saca el promedio de los meses que ya
 * cerraron. Ese promedio es el número para saber cuánto cabe un pago nuevo.
 */

// Categorías que por omisión cuentan como gasto fijo; se cambian en Ajustes.
export const DEFAULT_FIXED_CATEGORIES = [
  "Renta / Hipoteca",
  "Luz",
  "Agua",
  "Gas",
  "Internet / Teléfono",
  "Mantenimiento",
  "Camioneta",
  "Seguro",
  "Colegiatura",
  "Suscripciones",
];

// Cuántos meses entran en la gráfica y en el promedio.
export const HISTORY_MONTHS = 6;

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export function monthOf(isoDate) {
  return String(isoDate || "").slice(0, 7);
}

export function shiftMonth(month, delta) {
  const [year, index] = String(month).split("-").map(Number);
  const cursor = new Date(year, index - 1 + delta, 1);
  return `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`;
}

export function isFixedExpense(expense, fixedCategories = []) {
  const name = normalizeText(expense?.category);
  return fixedCategories.some((category) => normalizeText(category) === name);
}

/** Gasto de un mes: total, fijo contra variable y cada quincena. */
export function buildMonthCost(expenses, month, fixedCategories = []) {
  let fixed = 0;
  let variable = 0;
  let firstHalf = 0;
  let secondHalf = 0;
  let count = 0;

  expenses.forEach((expense) => {
    if (monthOf(expense.date) !== month) return;

    const amount = Number(expense.amount || 0);
    count += 1;
    if (isFixedExpense(expense, fixedCategories)) fixed += amount;
    else variable += amount;

    if (Number(String(expense.date).slice(8, 10)) <= 15) firstHalf += amount;
    else secondHalf += amount;
  });

  return {
    month,
    total: round(fixed + variable),
    fixed: round(fixed),
    variable: round(variable),
    firstHalf: round(firstHalf),
    secondHalf: round(secondHalf),
    count,
  };
}

/** Los últimos `size` meses que terminan en `endMonth`, del más viejo al más nuevo. */
export function buildCostHistory(
  expenses,
  endMonth,
  fixedCategories = [],
  size = HISTORY_MONTHS,
) {
  return Array.from({ length: size }, (_, index) =>
    buildMonthCost(
      expenses,
      shiftMonth(endMonth, index - size + 1),
      fixedCategories,
    ),
  );
}

/**
 * Promedio de los meses cerrados que tienen gastos. El mes en curso no
 * cuenta: a medio mes siempre parece más barato de lo que va a salir.
 */
export function averageMonthlyCost(
  expenses,
  today,
  fixedCategories = [],
  maxMonths = HISTORY_MONTHS,
) {
  const current = monthOf(today);
  const months = [
    ...new Set(
      expenses
        .map((expense) => monthOf(expense.date))
        .filter((month) => month && month < current),
    ),
  ]
    .sort()
    .slice(-maxMonths);

  const costs = months.map((month) =>
    buildMonthCost(expenses, month, fixedCategories),
  );
  const count = costs.length;
  const sum = (field) => costs.reduce((total, cost) => total + cost[field], 0);

  return {
    months,
    count,
    average: count ? round(sum("total") / count) : 0,
    fixedAverage: count ? round(sum("fixed") / count) : 0,
    variableAverage: count ? round(sum("variable") / count) : 0,
  };
}

/**
 * Presupuesto de la casa: lo que cuesta al mes según la lista de gastos de
 * Ajustes. Cada gasto cuenta su promedio mensual (lo bimestral, la mitad; lo
 * de cada 15 días, el doble), con o sin fecha de aviso.
 */
export function buildBudget(items = [], fixedCategories = []) {
  const byCategory = new Map();
  let fixed = 0;
  let variable = 0;

  items.forEach((item) => {
    const monthly = monthlyAmount(item);
    if (!monthly) return;

    const category = item.category || "Otro";
    byCategory.set(category, (byCategory.get(category) || 0) + monthly);
    if (isFixedExpense({ category }, fixedCategories)) fixed += monthly;
    else variable += monthly;
  });

  return {
    total: round(fixed + variable),
    fixed: round(fixed),
    variable: round(variable),
    byCategory: new Map(
      [...byCategory].map(([category, amount]) => [category, round(amount)]),
    ),
  };
}

/** Presupuesto de una categoría, sin importar acentos ni mayúsculas. */
export function budgetFor(budget, category) {
  const key = normalizeText(category);
  for (const [name, amount] of budget.byCategory) {
    if (normalizeText(name) === key) return amount;
  }
  return 0;
}
