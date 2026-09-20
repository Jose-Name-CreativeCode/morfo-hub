/**
 * Lo que sigue en Morfo: una sola lista con lo que pide atención hoy.
 *
 * Junta cuatro cosas que viven en lugares distintos —cobros abiertos,
 * declaración del SAT, cotizaciones que se enfriaron y recordatorios— y las
 * ordena por urgencia, para no tener que revisar cuatro pantallas.
 */

import { daysSince, getQuoteFunnelStage } from "./quote-stages.js";
import { buildUpcomingReminders, reminderWhenLabel } from "./reminders.js";
import { declarationDueDate, pendingDeclarationMonth } from "./tax-mx.js";
import { formatCurrency } from "./utils.js";

// Días que se le dan a un cobro antes de considerarlo atrasado.
export const CHARGE_GRACE_DAYS = 8;

// Una cotización enviada sin respuesta después de estos días se enfrió.
export const COLD_DAYS = 7;

// Cuando varias cosas vencen el mismo día, este es el orden de importancia.
const KIND_WEIGHT = { sat: 0, charge: 1, reminder: 2, quote: 3 };

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

export function monthName(month) {
  return MONTHS[Number(String(month).slice(5, 7)) - 1] || "";
}

/** Lo que falta por cobrar de un ingreso, sin depender de que venga calculado. */
export function remainingOf(income) {
  const total = Number(income?.totalAmount || 0);
  const paid = Number(income?.paidAmount || 0);
  const remaining =
    income?.remainingAmount !== undefined && income?.remainingAmount !== null
      ? Number(income.remainingAmount || 0)
      : total - paid;
  return Math.max(0, remaining);
}

/** Badge corto: cabe en el cuadro de la izquierda de cada línea. */
function dayBadge(days) {
  const value = Math.abs(Math.round(days));
  return value > 99 ? "99+" : `${value}d`;
}

function flagFor(sort) {
  if (sort < 0) return "hot";
  if (sort <= 7) return "warm";
  return "";
}

function daysBetween(fromIso, toIso) {
  const start = Date.parse(`${String(fromIso).slice(0, 10)}T12:00:00`);
  const end = Date.parse(`${String(toIso).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86400000);
}

function dueLabel(days) {
  if (days === 0) return "vence hoy";
  if (days === 1) return "vence mañana";
  if (days < 0) return `venció hace ${Math.abs(days)} días`;
  return `faltan ${days} días`;
}

/** Cobros con saldo, del más atrasado al más reciente. */
function chargeTasks(incomes, today) {
  return incomes
    .filter((income) => remainingOf(income) > 0)
    .map((income) => {
      const age = daysSince(income.date, today);
      const sort = CHARGE_GRACE_DAYS - age;
      const left = remainingOf(income);

      return {
        id: `charge-${income.id}`,
        kind: "charge",
        sort,
        flag: flagFor(sort),
        level: dayBadge(age),
        title: `Por cobrar · ${income.client || "Sin cliente"}`,
        note: `${income.concept || "Sin concepto"} · faltan ${formatCurrency(left)}`,
        action: { label: "Cobrar", href: "income.html?scope=morfo" },
      };
    });
}

/** La declaración mensual que todavía está abierta. */
function satTask(summary, today) {
  if (!summary || summary.taxesToPay <= 0) return [];

  const dueDate = declarationDueDate(summary.month);
  const days = daysBetween(today, dueDate);
  const sort = days;

  return [
    {
      id: `sat-${summary.month}`,
      kind: "sat",
      sort,
      flag: flagFor(sort),
      level: "17",
      title: `Declaración de ${monthName(summary.month)}`,
      note: `Aparta ${formatCurrency(summary.taxesToPay)} · ${dueLabel(days)}`,
      action: {
        label: "Ver",
        href: `dinero.html?scope=morfo&month=${summary.month}`,
      },
    },
  ];
}

/** Cotizaciones enviadas o en prospecto que llevan días sin respuesta. */
function quoteTasks(quotes, today) {
  return quotes
    .filter((quote) =>
      ["prospect", "sent"].includes(getQuoteFunnelStage(quote).key),
    )
    .map((quote) => {
      const age = daysSince(quote.date, today);
      return { quote, age, sort: COLD_DAYS - age };
    })
    .filter((row) => row.sort < 0)
    .map(({ quote, age, sort }) => ({
      id: `quote-${quote.id}`,
      kind: "quote",
      sort,
      flag: flagFor(sort),
      level: dayBadge(age),
      title: `${quote.client || "Sin cliente"} no contesta`,
      note: `Cotización de ${formatCurrency(quote.total)} · ${age} días sin respuesta`,
      action: {
        label: "Seguir",
        href: `quotes.html?scope=morfo&quote=${encodeURIComponent(quote.id)}`,
      },
    }));
}

/** Recordatorios de Morfo configurados en Ajustes. */
function reminderTasks(reminders, today) {
  return buildUpcomingReminders(reminders, today).map((row) => ({
    id: `reminder-${row.reminder.id}-${row.date}`,
    kind: "reminder",
    sort: row.days,
    flag: flagFor(row.days),
    level: String(row.reminder.day || ""),
    title: row.reminder.name || "Recordatorio",
    note: row.reminder.amount
      ? `${formatCurrency(row.reminder.amount)} · ${reminderWhenLabel(row.days)}`
      : reminderWhenLabel(row.days),
    action: { label: "Ya lo hice", reminder: row.reminder.id, date: row.date },
  }));
}

/**
 * La lista completa, ya ordenada: primero lo vencido y, a igualdad de días,
 * primero el SAT.
 */
export function buildMorfoTasks({
  incomes = [],
  quotes = [],
  reminders = [],
  taxSummary = null,
  today,
}) {
  return [
    ...satTask(taxSummary, today),
    ...chargeTasks(incomes, today),
    ...quoteTasks(quotes, today),
    ...reminderTasks(reminders, today),
  ].sort(
    (a, b) => a.sort - b.sort || KIND_WEIGHT[a.kind] - KIND_WEIGHT[b.kind],
  );
}

export { pendingDeclarationMonth };
