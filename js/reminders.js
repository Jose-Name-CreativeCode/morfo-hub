/**
 * Recordatorios de pagos y trámites que se repiten.
 *
 * Cada recordatorio dice qué día toca y cada cuándo; al marcarlo como hecho se
 * guarda el periodo para no volver a pedirlo. Viven en la configuración del
 * espacio (Ajustes), así que Personal, Casa y Morfo tienen los suyos.
 *
 * En Casa la misma lista es el presupuesto: un gasto sin día no avisa, sólo
 * cuenta para lo que cuesta la casa al mes.
 */

export const REMINDER_KINDS = {
  EXPENSE: "gasto",
  CARD_PAYMENT: "pago",
  TASK: "tramite",
};

export const REMINDER_FREQUENCIES = {
  DAILY: "diario",
  WEEKLY: "semanal",
  BIWEEKLY: "quincenal",
  MONTHLY: "mensual",
  BIMONTHLY: "bimestral",
  FOUR_MONTHLY: "cuatrimestral",
  BIANNUAL: "semestral",
  ANNUAL: "anual",
};

// Cuántas veces al mes se paga, en promedio, según la frecuencia. Un año
// tiene 365 días y 52 semanas: un mes promedia 30.4 días y 4.33 semanas.
const TIMES_PER_MONTH = {
  diario: 365 / 12,
  semanal: 52 / 12,
  quincenal: 2,
  mensual: 1,
  bimestral: 1 / 2,
  cuatrimestral: 1 / 4,
  semestral: 1 / 6,
  anual: 1 / 12,
};

// Cada cuántos meses se repite lo que cae en meses concretos.
const MONTH_STEP = { bimestral: 2, cuatrimestral: 4, semestral: 6, anual: 12 };

const MONTH_NAMES = [
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

// Cuántos días antes aparece y cuánto tiempo sigue visible si ya venció.
const DAYS_AHEAD = 10;
const DAYS_OVERDUE = 15;

function pad(value) {
  return String(value).padStart(2, "0");
}

function toIso(year, month, day) {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return `${year}-${pad(month + 1)}-${pad(Math.min(day, lastDay))}`;
}

function daysBetween(fromIso, toIsoDate) {
  const [y1, m1, d1] = fromIso.split("-").map(Number);
  const [y2, m2, d2] = toIsoDate.split("-").map(Number);
  const start = Date.UTC(y1, m1 - 1, d1);
  const end = Date.UTC(y2, m2 - 1, d2);
  return Math.round((end - start) / 86400000);
}

/** Meses (0-11) en los que aplica un recordatorio. */
function activeMonths(reminder) {
  const step = MONTH_STEP[reminder.frequency];
  if (!step) return [...Array(12).keys()];

  const first = Number(reminder.month ?? 0) % 12;
  return Array.from(
    { length: 12 / step },
    (_, index) => (first + index * step) % 12,
  );
}

// Lo que se paga cada día, cada semana o cada 15 días no cae en una fecha
// fija del mes: sólo cuenta para el presupuesto.
const UNDATED_FREQUENCIES = [
  REMINDER_FREQUENCIES.DAILY,
  REMINDER_FREQUENCIES.WEEKLY,
  REMINDER_FREQUENCIES.BIWEEKLY,
];

export function hasFixedDay(frequency) {
  return !UNDATED_FREQUENCIES.includes(frequency);
}

/** Si avisa en "Próximos pagos": necesita un día fijo en el mes. */
export function hasDueDate(reminder) {
  return Number(reminder?.day) >= 1 && hasFixedDay(reminder?.frequency);
}

/** Lo que cuesta al mes, en promedio: lo bimestral cuenta la mitad. */
export function monthlyAmount(reminder) {
  if (reminder?.kind === REMINDER_KINDS.TASK) return 0;
  const times = TIMES_PER_MONTH[reminder?.frequency] ?? 1;
  return Number(reminder?.amount || 0) * times;
}

export function occurrenceKey(date) {
  return String(date).slice(0, 7);
}

export function isDone(reminder, date) {
  return Boolean(reminder?.done?.[occurrenceKey(date)]);
}

/** Fechas en las que toca un recordatorio, entre dos meses alrededor de hoy. */
function occurrences(reminder, today) {
  const [year, month] = today.split("-").map(Number);
  const months = activeMonths(reminder);
  const dates = [];

  for (let offset = -2; offset <= 2; offset += 1) {
    const cursor = new Date(year, month - 1 + offset, 1);
    if (!months.includes(cursor.getMonth())) continue;
    dates.push(
      toIso(cursor.getFullYear(), cursor.getMonth(), Number(reminder.day || 1)),
    );
  }

  return dates;
}

/**
 * Lo que toca pagar o hacer pronto, más lo vencido que sigue sin marcarse.
 * Se ordena por fecha: primero lo vencido.
 */
export function buildUpcomingReminders(reminders = [], today) {
  const rows = [];

  reminders.filter(hasDueDate).forEach((reminder) => {
    occurrences(reminder, today).forEach((date) => {
      if (isDone(reminder, date)) return;

      const days = daysBetween(today, date);
      if (days > DAYS_AHEAD || days < -DAYS_OVERDUE) return;

      rows.push({
        reminder,
        date,
        days,
        status: days < 0 ? "vencido" : days === 0 ? "hoy" : "proximo",
      });
    });
  });

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export function reminderWhenLabel(days) {
  if (days === 0) return "hoy";
  if (days === 1) return "mañana";
  if (days === -1) return "venció ayer";
  if (days < 0) return `venció hace ${Math.abs(days)} días`;
  return `en ${days} días`;
}

function joinNames(names) {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

export function reminderScheduleLabel(reminder) {
  const { frequency } = reminder;
  if (frequency === REMINDER_FREQUENCIES.DAILY) return "Cada día";
  if (frequency === REMINDER_FREQUENCIES.WEEKLY) return "Cada semana";
  if (frequency === REMINDER_FREQUENCIES.BIWEEKLY) return "Cada 15 días";

  const dated = hasDueDate(reminder);
  const day = `día ${reminder.day}`;
  if (frequency === REMINDER_FREQUENCIES.MONTHLY || !MONTH_STEP[frequency]) {
    return dated ? `Cada mes, ${day}` : "Cada mes";
  }

  const every = {
    bimestral: "Cada 2 meses",
    cuatrimestral: "Cada 4 meses",
    semestral: "Cada 6 meses",
    anual: "Cada año",
  }[frequency];
  if (!dated) return every;

  const months = activeMonths(reminder).map((month) => MONTH_NAMES[month]);
  if (frequency === REMINDER_FREQUENCIES.BIMONTHLY) {
    return `${every}, ${day}, desde ${months[0]}`;
  }
  if (frequency === REMINDER_FREQUENCIES.BIANNUAL) {
    return `${every}, ${day} de ${months[0]} y de ${months[1]}`;
  }
  return `${every}, ${day} de ${joinNames(months)}`;
}

export function markReminderDone(reminders, reminderId, date, done = true) {
  return reminders.map((reminder) => {
    if (String(reminder.id) !== String(reminderId)) return reminder;

    const marks = { ...(reminder.done || {}) };
    if (done) marks[occurrenceKey(date)] = true;
    else delete marks[occurrenceKey(date)];

    return { ...reminder, done: marks };
  });
}
