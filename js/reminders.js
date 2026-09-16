/**
 * Recordatorios de pagos y trámites que se repiten.
 *
 * Cada recordatorio dice qué día toca y cada cuándo; al marcarlo como hecho se
 * guarda el periodo para no volver a pedirlo. Viven en la configuración del
 * espacio (Ajustes), así que Personal, Casa y Morfo tienen los suyos.
 */

export const REMINDER_KINDS = {
  EXPENSE: "gasto",
  CARD_PAYMENT: "pago",
  TASK: "tramite",
};

export const REMINDER_FREQUENCIES = {
  MONTHLY: "mensual",
  BIANNUAL: "semestral",
  ANNUAL: "anual",
};

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
  if (reminder.frequency === REMINDER_FREQUENCIES.MONTHLY) {
    return [...Array(12).keys()];
  }

  const first = Number(reminder.month ?? 0);
  if (reminder.frequency === REMINDER_FREQUENCIES.BIANNUAL) {
    return [first % 12, (first + 6) % 12];
  }
  return [first % 12];
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

  reminders.forEach((reminder) => {
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

export function reminderScheduleLabel(reminder) {
  const months = [
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
  const day = `día ${reminder.day}`;

  if (reminder.frequency === REMINDER_FREQUENCIES.MONTHLY) {
    return `Cada mes, ${day}`;
  }

  const first = Number(reminder.month ?? 0) % 12;
  if (reminder.frequency === REMINDER_FREQUENCIES.BIANNUAL) {
    return `Cada 6 meses, ${day} de ${months[first]} y de ${months[(first + 6) % 12]}`;
  }
  return `Cada año, ${day} de ${months[first]}`;
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
