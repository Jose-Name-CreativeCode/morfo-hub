import { isCardExpense } from "./finance-periods.js";
import {
  REMINDER_FREQUENCIES,
  hasDueDate,
  monthlyAmount,
} from "./reminders.js";
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

// La tarjeta se paga el día 17: lo que se carga a ella sale en la segunda
// quincena, sin importar el día en que se hizo el cargo.
export const CARD_PAY_DAY = 17;

// Un mes promedio tiene 30.4 días: 15 en la primera quincena y el resto en
// la segunda.
const FIRST_HALF_DAYS = 15;
const SECOND_HALF_DAYS = 365 / 12 - FIRST_HALF_DAYS;

// Lo que no se paga cada mes cuenta su promedio mensual, en un solo renglón
// por categoría: las cuatro parcialidades de la escuela son "Colegiatura".
const PERIODIC_FREQUENCIES = [
  REMINDER_FREQUENCIES.BIMONTHLY,
  REMINDER_FREQUENCIES.FOUR_MONTHLY,
  REMINDER_FREQUENCIES.BIANNUAL,
  REMINDER_FREQUENCIES.ANNUAL,
];

/**
 * El presupuesto partido en las dos quincenas, según cuándo sale el dinero:
 * lo de la tarjeta, el 17; lo que tiene día, en su quincena; lo diario, por
 * días; y lo demás (gasolina, psicólogo), mitad y mitad.
 */
export function splitBudgetByQuincena(items = [], paymentMethods = []) {
  const halves = [
    { key: "first", total: 0, items: [] },
    { key: "second", total: 0, items: [] },
  ];

  items.forEach((item) => {
    const monthly = monthlyAmount(item);
    if (!monthly) return;

    const periodic = PERIODIC_FREQUENCIES.includes(item.frequency);
    const key = periodic ? `promedio:${item.category || "Otro"}` : item.id;
    const name = periodic ? item.category || "Otro" : item.name;
    const average = periodic ? " · promedio al mes" : "";

    const add = (index, amount, when) => {
      if (amount <= 0) return;
      const half = halves[index];
      const row = half.items.find((entry) => entry.key === key);
      if (row) row.amount += amount;
      else half.items.push({ key, name, amount, when: when + average });
      half.total += amount;
    };

    if (isCardExpense({ paymentMethod: item.method }, paymentMethods)) {
      add(1, monthly, `tarjeta, se paga el ${CARD_PAY_DAY}`);
    } else if (item.frequency === REMINDER_FREQUENCIES.DAILY) {
      const daily = Number(item.amount || 0);
      add(0, daily * FIRST_HALF_DAYS, "15 días");
      add(1, daily * SECOND_HALF_DAYS, "el resto del mes");
    } else if (!hasDueDate(item)) {
      add(0, monthly / 2, "la mitad");
      add(1, monthly / 2, "la mitad");
    } else {
      add(Number(item.day) <= 15 ? 0 : 1, monthly, `día ${item.day}`);
    }
  });

  return halves.map((half) => ({
    ...half,
    total: round(half.total),
    items: half.items
      .map((row) => ({ ...row, amount: round(row.amount) }))
      .sort((a, b) => b.amount - a.amount),
  }));
}
