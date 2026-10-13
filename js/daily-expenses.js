import { REMINDER_FREQUENCIES } from "./reminders.js";

/**
 * Gastos del día a día, como la comida.
 *
 * En vez de registrar $400 cada día, se registran de una vez los días que
 * faltan: "Comida · 1 al 12 de octubre, 12 días, $4,800". Cada registro
 * guarda qué días cubre, para que el siguiente empiece donde quedó el
 * anterior y nada se cuente dos veces.
 *
 * Los lotes se cortan en la quincena para que el reparto por quincena del
 * Resumen siga cuadrando.
 */

export const DAILY_BATCH_KIND = "daily-batch";

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

function lastDayOfMonth(month) {
  const [year, index] = String(month).split("-").map(Number);
  return new Date(year, index, 0).getDate();
}

function dayOf(isoDate) {
  return Number(String(isoDate).slice(8, 10));
}

export function isDailyItem(item) {
  return item?.frequency === REMINDER_FREQUENCIES.DAILY;
}

export function isDailyBatch(expense) {
  return expense?.kind === DAILY_BATCH_KIND;
}

/** Las dos quincenas de un mes, como rangos de días. */
function quincenas(month) {
  return [
    { from: 1, to: 15 },
    { from: 16, to: lastDayOfMonth(month) },
  ];
}

/** Los días del mes que ya están registrados para este gasto. */
function coveredDays(expenses, itemId, month) {
  const covered = new Set();

  expenses.forEach((expense) => {
    if (!isDailyBatch(expense) || expense.dailyId !== itemId) return;
    if (String(expense.coversFrom || "").slice(0, 7) !== month) return;

    const from = dayOf(expense.coversFrom);
    const to = dayOf(expense.coversTo || expense.coversFrom);
    for (let day = from; day <= to; day += 1) covered.add(day);
  });

  return covered;
}

export function batchLabel(month, from, to) {
  const short = SHORT_MONTHS[Number(month.slice(5, 7)) - 1];
  return from === to ? `${from} ${short}` : `${from} al ${to} ${short}`;
}

/**
 * Lo que falta por registrar de cada gasto diario en un mes, hasta hoy.
 * Devuelve un lote por quincena y gasto.
 */
export function pendingDailyBatches({
  items = [],
  expenses = [],
  month,
  today,
}) {
  const isCurrentMonth = String(today).slice(0, 7) === month;
  // En un mes que ya pasó se registran los días completos.
  const lastDay = isCurrentMonth ? dayOf(today) : lastDayOfMonth(month);
  if (String(today).slice(0, 7) < month) return [];

  const batches = [];

  items.filter(isDailyItem).forEach((item) => {
    const daily = Number(item.amount || 0);
    if (!daily) return;

    const covered = coveredDays(expenses, item.id, month);

    quincenas(month).forEach(({ from, to }) => {
      const end = Math.min(to, lastDay);
      const days = [];
      for (let day = from; day <= end; day += 1) {
        if (!covered.has(day)) days.push(day);
      }
      if (!days.length) return;

      const first = days[0];
      const last = days[days.length - 1];
      batches.push({
        item,
        id: `diario-${item.id}-${month}-${pad(first)}`,
        from: `${month}-${pad(first)}`,
        to: `${month}-${pad(last)}`,
        days: days.length,
        amount: Math.round(daily * days.length * 100) / 100,
        label: batchLabel(month, first, last),
      });
    });
  });

  return batches;
}
