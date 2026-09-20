import { protectPage } from "../services/auth.js";
import {
  getQuotesCollection,
  saveQuoteRecord,
} from "../services/quotes-service.js";
import { getIncomeCollection } from "../services/income-service.js";
import { getExpensesCollection } from "../services/expenses-service.js";
import {
  getSettingsRecord,
  saveSettingsRecord,
} from "../services/settings-service.js";
import { getActiveScope, getFinanceConfig, withScopeParam } from "../scopes.js";
import {
  QUOTE_STAGES,
  daysSince,
  getQuoteFunnelStage,
} from "../quote-stages.js";
import { markReminderDone } from "../reminders.js";
import {
  buildMonthlyTaxSummary,
  declarationDueDate,
  pendingDeclarationMonth,
} from "../tax-mx.js";
import {
  COLD_DAYS,
  buildMorfoTasks,
  monthName,
  remainingOf,
} from "../morfo-tasks.js";
import {
  formatCurrency,
  getTodayISO,
  setPageLoading,
  showToast,
} from "../utils.js";

// Cuántas líneas se muestran antes de resumir el resto en una nota.
const MAX_TASKS = 6;
const MAX_DEALS = 8;

// Etapas que siguen vivas: son las que se listan debajo del embudo.
const OPEN_STAGES = ["prospect", "sent", "advance"];

// En las barras el nombre va en una columna angosta, así que se acorta.
const STAGE_SHORT = {
  prospect: "Prospecto",
  sent: "Enviada",
  advance: "Anticipo",
  paid: "Pagado",
};

const DEFAULT_PARTNERS = [
  { key: "jose", name: "Jose", share: 50 },
  { key: "vero", name: "Vero", share: 50 },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function monthOf(isoDate) {
  return String(isoDate || "").slice(0, 7);
}

function daysInMonth(month) {
  const [year, index] = month.split("-").map(Number);
  return new Date(year, index, 0).getDate();
}

function longMonthLabel(month) {
  return `${monthName(month)} ${month.slice(0, 4)}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const scope = getActiveScope();

  // El tablero es sólo de Morfo; Personal y Casa tienen su propio Resumen.
  if (scope !== "morfo") {
    window.location.replace(withScopeParam("resumen.html", scope));
    return;
  }

  setPageLoading(true);
  const user = await protectPage();
  if (!user) return;

  const today = getTodayISO();
  const month = monthOf(today);
  const taxMonth = pendingDeclarationMonth(today);

  const state = {
    quotes: [],
    incomes: [],
    expenses: [],
    settings: {},
    partners: DEFAULT_PARTNERS,
    reminders: [],
    stageFilter: "",
    sheetQuoteId: null,
  };

  const $ = (id) => document.getElementById(id);
  const backdrop = $("tb-backdrop");
  const sheet = $("tb-sheet");

  async function loadData() {
    const [quotes, incomes, expenses, settings] = await Promise.all([
      getQuotesCollection(),
      getIncomeCollection(),
      getExpensesCollection(),
      getSettingsRecord(),
    ]);

    const isMorfo = (record) => String(record.scope || "morfo") === "morfo";
    state.quotes = quotes;
    state.incomes = incomes.filter(isMorfo);
    state.expenses = expenses.filter(isMorfo);
    state.settings = settings;

    const saved = settings?.finance?.morfo?.partners;
    state.partners =
      Array.isArray(saved) && saved.length ? saved : DEFAULT_PARTNERS;
    state.reminders = getFinanceConfig(settings, "morfo").reminders;
  }

  function summaryFor(targetMonth) {
    return buildMonthlyTaxSummary({
      incomes: state.incomes,
      expenses: state.expenses,
      month: targetMonth,
      partners: state.partners,
    });
  }

  function openQuotes() {
    return state.quotes.filter((quote) =>
      ["prospect", "sent"].includes(getQuoteFunnelStage(quote).key),
    );
  }

  /* ---------- 1. La frase de estado ---------- */

  function renderState(monthSummary) {
    const pending = state.incomes.reduce(
      (sum, income) => sum + remainingOf(income),
      0,
    );
    const taxes = summaryFor(taxMonth).taxesToPay;
    const dueMonth = monthOf(declarationDueDate(taxMonth));
    const pipeline = openQuotes().reduce(
      (sum, quote) => sum + Number(quote.total || 0),
      0,
    );

    $("tb-period").textContent = `Morfo · ${longMonthLabel(month)}`;

    const headline = $("tb-headline");
    headline.replaceChildren();

    const owed = el("b", "", formatCurrency(pending));
    const due = el("u", "", formatCurrency(taxes));

    if (pending > 0 && taxes > 0) {
      headline.append(
        "Te deben ",
        owed,
        " y debes ",
        due,
        ` de impuestos antes del 17 de ${monthName(dueMonth)}.`,
      );
    } else if (pending > 0) {
      headline.append(
        "Te deben ",
        owed,
        `. No hay impuestos por pagar de ${monthName(taxMonth)}.`,
      );
    } else if (taxes > 0) {
      headline.append(
        "Nadie te debe. Aparta ",
        due,
        ` de impuestos antes del 17 de ${monthName(dueMonth)}.`,
      );
    } else if (pipeline > 0) {
      headline.append(
        "Nadie te debe nada. Tienes ",
        el("b", "", formatCurrency(pipeline)),
        " en cotizaciones esperando respuesta.",
      );
    } else {
      headline.append(
        "Todo tranquilo: sin cobros abiertos ni impuestos por pagar.",
      );
    }

    $("tb-collected").textContent = formatCurrency(monthSummary.collected);
    $("tb-spent").textContent = formatCurrency(monthSummary.expensesTotal);
    $("tb-pipeline").textContent = formatCurrency(pipeline);
  }

  /* ---------- 2. El riel del mes ---------- */

  /** Un movimiento por día y dirección, para que el riel no se sature. */
  function railMovements() {
    const byKey = new Map();

    const add = (date, direction, amount, label) => {
      const day = Number(String(date).slice(8, 10));
      if (!day || !amount) return;

      const key = `${day}-${direction}`;
      const row = byKey.get(key) || { day, direction, amount: 0, labels: [] };
      row.amount += Number(amount);
      if (label) row.labels.push(label);
      byKey.set(key, row);
    };

    state.incomes
      .filter((income) => monthOf(income.date) === month)
      .forEach((income) =>
        add(income.date, "in", income.paidAmount, income.client),
      );
    state.expenses
      .filter((expense) => monthOf(expense.date) === month)
      .forEach((expense) =>
        add(expense.date, "out", expense.amount, expense.category),
      );

    return [...byKey.values()].sort((a, b) => a.day - b.day);
  }

  function renderRail() {
    const rail = $("tb-rail");
    rail.replaceChildren();

    const total = daysInMonth(month);
    const movements = railMovements();
    const max = Math.max(...movements.map((row) => row.amount), 1);
    const at = (day) => `${((day - 0.5) / total) * 100}%`;

    $("tb-rail-range").textContent = `1 → ${total} ${monthName(month)}`;
    rail.appendChild(el("span", "tb-rail-axis"));

    // Sólo los tres días de mayor movimiento llevan el número, y una sola vez
    // por día, para que las etiquetas no se encimen.
    const byDay = new Map();
    movements.forEach((row) =>
      byDay.set(row.day, (byDay.get(row.day) || 0) + row.amount),
    );
    const labelled = new Set(
      [...byDay.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([day]) => day),
    );
    const drawn = new Set();

    movements.forEach((row) => {
      const height = Math.max(9, (row.amount / max) * 26);
      const tick = el("span", `tb-tick is-${row.direction}`);
      tick.style.left = at(row.day);
      tick.title = `${row.day} · ${formatCurrency(row.amount)}${
        row.labels.length ? ` · ${row.labels.join(", ")}` : ""
      }`;

      const bar = el("i");
      bar.style.height = `${height}px`;
      tick.appendChild(bar);

      if (labelled.has(row.day) && !drawn.has(row.day)) {
        drawn.add(row.day);
        tick.appendChild(el("b", "", String(row.day)));
      }

      rail.appendChild(tick);
    });

    // El 17 sólo se marca si es el que de verdad importa: el de la declaración
    // que sigue abierta. Si ya pasó, la fecha vive en el bloque de impuestos.
    if (monthOf(declarationDueDate(taxMonth)) === month) {
      const due = el("span", "tb-rail-due");
      due.style.left = at(17);
      rail.appendChild(due);
    }

    if (monthOf(today) === month) {
      const now = el("span", "tb-rail-today");
      now.style.left = at(Number(today.slice(8, 10)));
      rail.appendChild(now);
    }

    const biggest = movements.reduce(
      (best, row) => (row.amount > (best?.amount || 0) ? row : best),
      null,
    );
    $("tb-rail-note").textContent = biggest
      ? `${movements.length} ${movements.length === 1 ? "día con movimiento" : "días con movimiento"} · el mayor fue ${formatCurrency(biggest.amount)} el día ${biggest.day}`
      : "Todavía no hay movimientos este mes.";
  }

  /* ---------- 3. Qué sigue ---------- */

  function renderTasks() {
    const container = $("tb-tasks");
    container.replaceChildren();

    const tasks = buildMorfoTasks({
      incomes: state.incomes,
      quotes: state.quotes,
      reminders: state.reminders,
      taxSummary: summaryFor(taxMonth),
      today,
    });

    $("tb-tasks-count").textContent = tasks.length
      ? `${tasks.length} ${tasks.length === 1 ? "pendiente" : "pendientes"}`
      : "";

    if (!tasks.length) {
      container.appendChild(
        el("p", "tb-empty", "Nada pendiente. Todo al día."),
      );
      $("tb-tasks-note").textContent = "";
      return;
    }

    tasks.slice(0, MAX_TASKS).forEach((task) => {
      const row = el("div", "tb-task");
      row.appendChild(
        el("span", `tb-flag is-${task.flag || "calm"}`, task.level),
      );

      const text = el("span", "tb-task-text");
      text.append(el("b", "", task.title), el("span", "", task.note));
      row.appendChild(text);

      if (task.action.href) {
        const link = el("a", "tb-task-do", task.action.label);
        link.href = task.action.href;
        row.appendChild(link);
      } else {
        const button = el("button", "tb-task-do", task.action.label);
        button.type = "button";
        button.addEventListener("click", () =>
          completeReminder(task.action.reminder, task.action.date, task.title),
        );
        row.appendChild(button);
      }

      container.appendChild(row);
    });

    const rest = tasks.length - MAX_TASKS;
    $("tb-tasks-note").textContent =
      rest > 0 ? `Y ${rest} ${rest === 1 ? "cosa más" : "cosas más"}.` : "";
  }

  /** Guarda que un recordatorio ya se cumplió este periodo. */
  async function completeReminder(reminderId, date, title) {
    try {
      const reminders = markReminderDone(state.reminders, reminderId, date);
      state.settings = await saveSettingsRecord({
        ...state.settings,
        finance: {
          ...(state.settings.finance || {}),
          morfo: { ...(state.settings.finance?.morfo || {}), reminders },
        },
      });
      state.reminders = reminders;
      render();
      showToast(`“${title}” marcado como hecho.`, { type: "success" });
    } catch (error) {
      console.error("No se pudo marcar el recordatorio:", error);
      showToast(error?.message || "No se pudo guardar.", { type: "error" });
    }
  }

  /* ---------- 4. Embudo ---------- */

  function renderFunnel() {
    const container = $("tb-funnel");
    container.replaceChildren();

    const rows = QUOTE_STAGES.map((stage) => {
      const quotes = state.quotes.filter(
        (quote) => getQuoteFunnelStage(quote).key === stage.key,
      );
      return {
        stage,
        quotes,
        total: quotes.reduce((sum, quote) => sum + Number(quote.total || 0), 0),
      };
    });

    const max = Math.max(...rows.map((row) => row.total), 1);
    const counted = rows.reduce((sum, row) => sum + row.quotes.length, 0);
    $("tb-funnel-count").textContent =
      `${counted} ${counted === 1 ? "cotización" : "cotizaciones"}`;

    rows.forEach(({ stage, quotes, total }) => {
      const button = el("button", "tb-stage");
      button.type = "button";
      button.classList.toggle("is-on", state.stageFilter === stage.key);
      button.setAttribute(
        "aria-pressed",
        String(state.stageFilter === stage.key),
      );

      button.appendChild(el("span", "", STAGE_SHORT[stage.key] || stage.label));

      const bar = el("span", "tb-stage-bar");
      const fill = el("i");
      fill.style.width = `${(total / max) * 100}%`;
      bar.append(fill, el("em", "", String(quotes.length)));
      button.appendChild(bar);

      button.appendChild(el("strong", "", formatCurrency(total)));
      button.addEventListener("click", () => {
        state.stageFilter = state.stageFilter === stage.key ? "" : stage.key;
        renderFunnel();
        renderDeals();
      });

      container.appendChild(button);
    });
  }

  function renderDeals() {
    const container = $("tb-deals");
    container.replaceChildren();

    const stages = state.stageFilter ? [state.stageFilter] : OPEN_STAGES;
    const deals = state.quotes
      .filter((quote) => stages.includes(getQuoteFunnelStage(quote).key))
      .sort((a, b) => Number(b.total || 0) - Number(a.total || 0));

    if (!deals.length) {
      container.appendChild(
        el(
          "p",
          "tb-empty",
          state.stageFilter
            ? "No hay cotizaciones en esta etapa."
            : "No hay cotizaciones abiertas.",
        ),
      );
      return;
    }

    deals.slice(0, MAX_DEALS).forEach((quote) => {
      const stage = getQuoteFunnelStage(quote);
      const age = daysSince(quote.date, today);
      const isCold =
        age > COLD_DAYS && ["prospect", "sent"].includes(stage.key);

      const button = el("button", "tb-deal");
      button.type = "button";

      const left = el("span");
      left.append(
        el("b", "", quote.client || "Sin cliente"),
        el("span", "", quote.title || stage.label),
      );
      button.appendChild(left);

      const right = el("span", "tb-deal-right");
      right.append(
        el("strong", "", formatCurrency(quote.total)),
        el(
          "em",
          isCold ? "is-cold" : "",
          isCold ? `${age} días sin respuesta` : stage.label,
        ),
      );
      button.appendChild(right);

      button.addEventListener("click", () => openSheet(quote.id));
      container.appendChild(button);
    });

    const rest = deals.length - MAX_DEALS;
    if (rest > 0) {
      const link = el(
        "a",
        "tb-link",
        `Ver las ${rest} restantes en Cotizaciones`,
      );
      link.href = "quotes.html?scope=morfo";
      container.appendChild(link);
    }
  }

  /* ---------- 5. Impuestos y reparto ---------- */

  function renderTax() {
    const data = summaryFor(taxMonth);
    const dueDate = declarationDueDate(taxMonth);

    $("tb-tax-month").textContent = longMonthLabel(taxMonth);

    const container = $("tb-tax");
    container.replaceChildren();

    [
      ["IVA cobrado", formatCurrency(data.ivaCharged)],
      ["IVA de tus gastos", `− ${formatCurrency(data.ivaCredit)}`],
      [
        `ISR RESICO ${(data.isrRate * 100).toFixed(2)}%`,
        formatCurrency(data.isrTotal),
      ],
      ["Retenido por clientes", `− ${formatCurrency(data.withheld)}`],
      ["Aparta", formatCurrency(data.taxesToPay)],
    ].forEach(([label, value], index, list) => {
      const row = el("div", index === list.length - 1 ? "is-total" : "");
      row.append(el("span", "", label), el("strong", "", value));
      container.appendChild(row);
    });

    const deadline = `Se declara antes del 17 de ${monthName(monthOf(dueDate))}.`;
    $("tb-tax-note").textContent = data.collectedPlain
      ? `${deadline} Los ${formatCurrency(data.collectedPlain)} sin factura no entran en el cálculo; confirma siempre con tu contador.`
      : `${deadline} Estimado sobre lo cobrado y facturado; confirma con tu contador.`;
  }

  function renderSplit(monthSummary) {
    $("tb-split-month").textContent = longMonthLabel(month);

    const bar = $("tb-split");
    const legend = $("tb-split-legend");
    bar.replaceChildren();
    legend.replaceChildren();

    const totals = monthSummary.partnerTotals;
    const sum = totals.reduce((acc, partner) => acc + partner.amount, 0);

    if (sum <= 0) {
      legend.appendChild(
        el("p", "tb-empty", "Todavía no hay cobros que repartir este mes."),
      );
      return;
    }

    totals.forEach((partner) => {
      const percent = (partner.amount / sum) * 100;

      const piece = el("i", "", `${partner.name} ${Math.round(percent)}%`);
      piece.style.flex = String(Math.max(percent, 0.01));
      bar.appendChild(piece);

      const row = el("span");
      row.append(
        el("b", "", partner.name),
        el("strong", "", formatCurrency(partner.amount)),
      );
      legend.appendChild(row);
    });
  }

  function render() {
    const monthSummary = summaryFor(month);
    renderState(monthSummary);
    renderRail();
    renderTasks();
    renderFunnel();
    renderDeals();
    renderTax();
    renderSplit(monthSummary);
  }

  /* ---------- Ficha de la cotización ---------- */

  function closeSheet() {
    sheet.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove("rs-sheet-open");
    state.sheetQuoteId = null;
  }

  function openSheet(quoteId) {
    const quote = state.quotes.find(
      (item) => String(item.id) === String(quoteId),
    );
    if (!quote) return;

    state.sheetQuoteId = quote.id;
    const stage = getQuoteFunnelStage(quote);

    $("tb-sheet-title").textContent = quote.client || "Cotización";
    $("tb-sheet-meta").textContent =
      `${quote.publicId || ""} · ${quote.title || ""}`;
    $("tb-sheet-amount").textContent = formatCurrency(quote.total);

    const list = $("tb-sheet-list");
    list.replaceChildren();
    [
      ["Etapa", stage.label],
      ["Fecha", quote.date || "-"],
      ["Sin respuesta", `${daysSince(quote.date, today)} días`],
      ["Servicio", quote.serviceType || "-"],
    ].forEach(([label, value]) => {
      const row = el("div");
      row.append(el("dt", "", label), el("dd", "", value));
      list.appendChild(row);
    });

    renderStageActions(quote, stage);
    $("tb-sheet-open").href =
      `quotes.html?scope=morfo&quote=${encodeURIComponent(quote.id)}`;

    backdrop.hidden = false;
    sheet.hidden = false;
    document.body.classList.add("rs-sheet-open");
  }

  /**
   * Sólo los cambios de etapa que no mueven dinero. Aprobar y cobrar sigue en
   * la ficha de la cotización, donde ya se crea el cobro.
   */
  function renderStageActions(quote, stage) {
    const picker = $("tb-stage-picker");
    picker.replaceChildren();

    const actions = [];
    if (stage.key === "prospect")
      actions.push(["Marcar como enviada", "enviada"]);
    if (stage.key === "sent")
      actions.push(["Regresar a prospecto", "borrador"]);
    if (stage.key !== "paid") actions.push(["Archivar", "archivada"]);

    actions.forEach(([label, status]) => {
      const button = el("button", "tb-chip", label);
      button.type = "button";
      button.addEventListener("click", () => changeStatus(quote, status));
      picker.appendChild(button);
    });
  }

  async function changeStatus(quote, status) {
    try {
      await saveQuoteRecord({ ...quote, status });
      await loadData();
      closeSheet();
      render();
      showToast(
        status === "archivada"
          ? "Cotización archivada."
          : `Cotización marcada como ${status}.`,
        { type: "success" },
      );
    } catch (error) {
      console.error("No se pudo cambiar la etapa:", error);
      showToast(error?.message || "No se pudo cambiar la etapa.", {
        type: "error",
      });
    }
  }

  $("tb-sheet-close").addEventListener("click", closeSheet);
  backdrop.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !backdrop.hidden) closeSheet();
  });

  window.addEventListener("focus", async () => {
    if (!backdrop.hidden) return;
    try {
      await loadData();
      render();
    } catch (error) {
      console.warn("No se pudo actualizar el tablero:", error);
    }
  });

  try {
    await loadData();
    render();
  } catch (error) {
    console.error("No se pudo cargar el tablero:", error);
    showToast(error?.message || "No se pudo cargar la información.", {
      type: "error",
      duration: 5000,
    });
  } finally {
    setPageLoading(false);
  }
});
