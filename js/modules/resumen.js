import { protectPage } from "../services/auth.js";
import {
  deleteExpenseRecord,
  getExpensesCollection,
  saveExpenseRecord,
} from "../services/expenses-service.js";
import {
  deleteIncomeRecord,
  getIncomeCollection,
  saveIncomeRecord,
} from "../services/income-service.js";
import {
  getSettingsRecord,
  saveSettingsRecord,
} from "../services/settings-service.js";
import { exportExpensesToExcel } from "../services/expenses-excel.js";
import {
  getActiveScope,
  getFinanceConfig,
  getScopeConfig,
  recordMatchesScope,
  withScopeParam,
} from "../scopes.js";
import {
  buildPeriodSummary,
  isCardExpense,
  isDateInPeriod,
  periodForDate,
  periodKey,
  periodLabel,
  periodNoun,
  periodRange,
  shiftPeriod,
} from "../finance-periods.js";
import {
  HISTORY_MONTHS,
  averageMonthlyCost,
  buildCostHistory,
  buildMonthCost,
  isFixedExpense,
  shiftMonth,
} from "../casa-costs.js";
import {
  CARD_PAYMENT_KIND,
  FUNDED_BY_ME,
  FUNDED_BY_PAPA,
  REIMBURSEMENT_KIND,
  buildDebtSummary,
  buildPapaDebt,
  fundedBy,
  isCardPayment,
  isNuExpense,
  isReimbursement,
} from "../card-ledger.js";
import {
  REMINDER_KINDS,
  buildUpcomingReminders,
  markReminderDone,
  reminderWhenLabel,
} from "../reminders.js";
import {
  askConfirm,
  getTodayISO,
  setButtonLoading,
  setPageLoading,
  showToast,
} from "../utils.js";

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

function money(amount) {
  const value = Number(amount || 0);
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Monto corto para etiquetas chicas: $44k, $5.5k, $369. */
function compactMoney(amount) {
  const value = Number(amount || 0);
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }
  return `$${Math.round(value)}`;
}

function parseAmount(text) {
  const value = Number(String(text || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function createId() {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `exp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function fitAmountInput(input) {
  const length = Math.max(1, (input.value || input.placeholder || "").length);
  input.style.width = `${length + 0.2}ch`;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

document.addEventListener("DOMContentLoaded", async () => {
  const scope = getActiveScope();
  const scopeConfig = getScopeConfig(scope);

  // Morfo conserva sus páginas de siempre.
  if (scopeConfig.homeKey !== "resumen") {
    window.location.replace(withScopeParam("dashboard.html", scope));
    return;
  }

  setPageLoading(true);
  const user = await protectPage();
  if (!user) return;

  const today = getTodayISO();
  const state = {
    period: periodForDate(scope, today),
    category: "",
    expenses: [],
    incomes: [],
    paymentMethods: [],
    categories: [],
    fixedCategories: [],
    reminders: [],
    pendingReminder: null,
    editingId: null,
    detailId: null,
    form: {
      type: "gasto",
      category: "",
      method: null,
      fundedBy: "",
      fundedTouched: false,
    },
    detailKind: "gasto",
  };

  const $ = (id) => document.getElementById(id);
  const backdrop = $("rs-backdrop");
  const expenseSheet = $("rs-expense-sheet");
  const detailSheet = $("rs-detail-sheet");
  const sheets = [expenseSheet, detailSheet];
  // En Casa se lleva lo que Jose pone por papá; en Personal, su tarjeta Nu.
  const tracksPapaDebt = scope === "casa";
  // En Personal el número grande es la deuda: gastos con tarjeta menos pagos.
  const tracksDebt = scope === "personal";

  document.title = `Morfo Hub | ${scopeConfig.label}`;

  /* ---------- Datos ---------- */

  async function loadData() {
    const [expenses, incomes, settings] = await Promise.all([
      getExpensesCollection(),
      getIncomeCollection(),
      getSettingsRecord(),
    ]);
    const finance = getFinanceConfig(settings, scope);
    state.expenses = expenses.filter((item) => recordMatchesScope(item, scope));
    state.incomes = incomes.filter((item) => recordMatchesScope(item, scope));
    state.paymentMethods = finance.paymentMethods;
    state.categories = finance.categories;
    state.fixedCategories = finance.fixedCategories;
    state.reminders = finance.reminders;
    state.settings = settings;
  }

  /** Opciones de "Pagado con": las formas de pago configuradas en Ajustes. */
  function paymentOptions() {
    return state.paymentMethods.map((method) => ({
      key: `method:${method.name}`,
      label: method.name,
      accountId: "",
      paymentMethod: method.name,
    }));
  }

  function expenseMethodLabel(expense) {
    return expense.paymentMethod || "Sin método";
  }

  /* ---------- Render ---------- */

  function renderPeriod() {
    const { period } = state;
    $("rs-period-kicker").textContent = `${scopeConfig.label} · ${period.year}`;
    $("rs-period-title").textContent = periodLabel(period);
    $("rs-excel").textContent = `Descargar Excel de ${periodNoun(period)}`;
  }

  function setSplitChips(title, chips) {
    $("rs-split-title").textContent = title;
    const split = $("rs-split");
    split.replaceChildren();
    chips.forEach(([label, amount]) => {
      const chip = el("span", "rs-split-chip", `${label} `);
      chip.appendChild(el("b", "", amount));
      split.appendChild(chip);
    });
  }

  function currentDebt() {
    return buildDebtSummary({
      expenses: state.expenses,
      payments: state.incomes.filter(isCardPayment),
      period: state.period,
      paymentMethods: state.paymentMethods,
    });
  }

  /** Nombre del mes que se está viendo, en minúsculas: "octubre". */
  function monthWord() {
    return periodLabel(state.period).toLowerCase();
  }

  /**
   * Personal: arriba lo que debes en la tarjeta sumando todo lo registrado;
   * abajo, con su título, lo que gastaste en el mes que estás viendo.
   */
  function renderDebtSummary() {
    const debt = currentDebt();
    const owes = debt.debt > 0.005;
    const leftValue = $("rs-left-value");

    $("rs-left-label").textContent = owes
      ? "Debes en tu tarjeta"
      : debt.debt < -0.005
        ? "Tienes a favor en tu tarjeta"
        : "No debes nada en tu tarjeta";
    leftValue.textContent = money(Math.abs(debt.debt));
    leftValue.classList.toggle("is-negative", owes);
    leftValue.classList.toggle("is-positive", !owes);

    // Totales de todo lo registrado, para que la resta cuadre con la deuda.
    $("rs-pair").hidden = false;
    $("rs-spent-value").textContent = `−${money(debt.charged)}`;
    $("rs-paid-value").textContent = `+${money(debt.paid)}`;

    $("rs-bar").classList.remove("is-split");
    const fill = $("rs-bar-fill");
    fill.style.width = `${debt.percentPaid}%`;
    fill.classList.add("is-good");
    $("rs-bar-note").textContent =
      debt.charged > 0
        ? `Llevas pagado el ${debt.percentPaid}% de todo lo que has gastado con tarjeta`
        : "Aún no tienes gastos con tarjeta";

    setSplitChips(`En ${monthWord()}`, [
      ["Gastaste", money(debt.spentInPeriod)],
      ["Con tarjeta", money(debt.cardInPeriod)],
      ["En efectivo", money(debt.cashInPeriod)],
    ]);
  }

  function currentMonthCost() {
    return buildMonthCost(
      state.expenses,
      periodKey(state.period),
      state.fixedCategories,
    );
  }

  /** Casa: cuánto gastó la casa en el mes, lo fijo contra lo variable. */
  function renderCasaSummary() {
    const cost = currentMonthCost();
    const short = SHORT_MONTHS[state.period.month];
    const lastDay = Number(periodRange(state.period).end.slice(8, 10));

    $("rs-left-label").textContent = `La casa gastó en ${monthWord()}`;
    const leftValue = $("rs-left-value");
    leftValue.textContent = money(cost.total);
    leftValue.classList.remove("is-negative", "is-positive");
    $("rs-pair").hidden = true;

    // La barra se parte en dos: lo fijo lleno y lo variable más claro.
    $("rs-bar").classList.toggle("is-split", cost.total > 0);
    const fill = $("rs-bar-fill");
    fill.classList.remove("is-good", "is-hot");
    fill.style.width =
      cost.total > 0 ? `${(cost.fixed / cost.total) * 100}%` : "0%";

    const note = $("rs-bar-note");
    note.replaceChildren();
    if (cost.total > 0) {
      note.append(
        el("span", "rs-legend is-fixed", `Fijos ${money(cost.fixed)}`),
        el(
          "span",
          "rs-legend is-variable",
          `Variables ${money(cost.variable)}`,
        ),
      );
    } else {
      note.textContent = `Aún no hay gastos en ${monthWord()}.`;
    }

    setSplitChips("Por quincena", [
      [`1–15 ${short}`, money(cost.firstHalf)],
      [`16–${lastDay} ${short}`, money(cost.secondHalf)],
    ]);
  }

  function renderSummary() {
    if (tracksDebt) renderDebtSummary();
    else renderCasaSummary();
  }

  /** Nombres de meses en una frase: "julio, agosto y septiembre". */
  function monthList(months) {
    const names = months.map((month) => {
      const [year, index] = month.split("-").map(Number);
      return periodLabel({ year, month: index - 1, half: 0 }).toLowerCase();
    });
    if (names.length < 2) return names.join("");
    return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
  }

  /**
   * Casa: los últimos meses en barras y el promedio de los que ya cerraron,
   * que es el número para saber cuánto cabe un pago nuevo.
   */
  function renderCasaCosts() {
    const section = $("rs-costs");
    section.hidden = tracksDebt;
    if (tracksDebt) return;

    const viewed = periodKey(state.period);
    const running = today.slice(0, 7);
    // La gráfica se queda quieta en los últimos meses y sólo marca el que se
    // ve; si se navega fuera de esos meses, se recorre para seguir mostrándolo.
    const windowStart = shiftMonth(running, 1 - HISTORY_MONTHS);
    const end = viewed >= windowStart && viewed <= running ? running : viewed;
    const history = buildCostHistory(
      state.expenses,
      end,
      state.fixedCategories,
    );
    const max = Math.max(...history.map((row) => row.total), 1);

    const chart = $("rs-cost-chart");
    chart.replaceChildren();

    history.forEach((row) => {
      const [year, month] = row.month.split("-").map(Number);
      const name = periodLabel({ year, month: month - 1, half: 0 });

      const button = el("button", "rs-cost-col");
      button.type = "button";
      button.classList.toggle("is-current", row.month === viewed);
      // El mes en curso todavía no termina: se dibuja punteado.
      button.classList.toggle("is-running", row.month === running);
      button.setAttribute("aria-label", `${name}: ${money(row.total)}`);
      button.setAttribute("aria-pressed", String(row.month === viewed));

      const stack = el("span", "rs-cost-stack");
      stack.style.height = `${(row.total / max) * 100}%`;
      const variable = el("i", "is-variable");
      variable.style.flexGrow = String(row.variable);
      const fixed = el("i", "is-fixed");
      fixed.style.flexGrow = String(row.fixed);
      stack.append(variable, fixed);

      const track = el("span", "rs-cost-track");
      track.appendChild(stack);

      button.append(
        el("span", "rs-cost-value", row.total ? compactMoney(row.total) : "—"),
        track,
        el("span", "rs-cost-month", SHORT_MONTHS[month - 1]),
      );
      button.addEventListener("click", () => {
        state.period = { ...state.period, year, month: month - 1, half: 0 };
        state.category = "";
        render();
      });
      chart.appendChild(button);
    });

    const average = averageMonthlyCost(
      state.expenses,
      today,
      state.fixedCategories,
    );
    $("rs-avg-total").textContent = average.count
      ? money(average.average)
      : "—";
    $("rs-avg-fixed").textContent = average.count
      ? money(average.fixedAverage)
      : "—";
    $("rs-avg-note").textContent = average.count
      ? `Sale de ${monthList(average.months)}. El mes en curso no cuenta porque aún no termina.`
      : "Cuando cierre el primer mes con gastos, aquí verás el promedio.";
  }

  function renderCategories(expenses) {
    const container = $("rs-cats");
    container.replaceChildren();

    const totals = new Map();
    expenses.forEach((expense) => {
      const name = expense.category || "Otro";
      totals.set(name, (totals.get(name) || 0) + Number(expense.amount || 0));
    });
    const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);

    if (!rows.length) {
      container.appendChild(el("p", "rs-empty", "Sin gastos en este periodo"));
      return;
    }

    const max = rows[0][1] || 1;
    rows.forEach(([name, total]) => {
      const button = el("button", "rs-cat");
      button.type = "button";
      button.classList.toggle("is-active", state.category === name);
      button.setAttribute("aria-pressed", String(state.category === name));

      const row = el("span", "rs-cat-row");
      const label = el("span", "", name);
      if (
        !tracksDebt &&
        isFixedExpense({ category: name }, state.fixedCategories)
      ) {
        label.appendChild(el("span", "rs-tag is-fixed", "Fijo"));
      }
      row.append(label, el("strong", "", money(total)));

      const bar = el("span", "rs-bar rs-bar-thin");
      const fill = el("i");
      fill.style.width = `${Math.max(4, (total / max) * 100)}%`;
      bar.appendChild(fill);

      button.append(row, bar);
      button.addEventListener("click", () => {
        state.category = state.category === name ? "" : name;
        render();
      });
      container.appendChild(button);
    });
  }

  function dayLabel(isoDate) {
    const [year, month, day] = isoDate.split("-").map(Number);
    const base = `${day} ${SHORT_MONTHS[month - 1]}`;
    const yesterday = new Date(`${today}T12:00:00`);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    if (isoDate === today) return `Hoy, ${base}`;
    if (isoDate === yesterdayIso) return `Ayer, ${base}`;
    return year === state.period.year ? base : `${base} ${year}`;
  }

  function renderMovements(expenses) {
    const container = $("rs-moves");
    container.replaceChildren();

    const visible = expenses
      .filter(
        (expense) =>
          !state.category || (expense.category || "Otro") === state.category,
      )
      .sort(
        (a, b) =>
          String(b.date).localeCompare(String(a.date)) ||
          Number(b.updatedAtMs || 0) - Number(a.updatedAtMs || 0),
      );

    // Los pagos de tarjeta van en la lista en verde; no tienen categoría.
    const payments = state.category
      ? []
      : tracksDebt
        ? currentDebt().payments
        : state.incomes.filter(
            (income) =>
              isReimbursement(income) &&
              isDateInPeriod(income.date, state.period),
          );
    const items = [
      ...visible.map((record) => ({ kind: "gasto", record })),
      ...payments.map((record) => ({ kind: "pago", record })),
    ].sort(
      (a, b) =>
        String(b.record.date).localeCompare(String(a.record.date)) ||
        Number(b.record.updatedAtMs || 0) - Number(a.record.updatedAtMs || 0),
    );

    $("rs-moves-count").textContent = [
      `${visible.length} ${visible.length === 1 ? "gasto" : "gastos"}`,
      payments.length
        ? `${payments.length} ${payments.length === 1 ? "pago" : "pagos"}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
    $("rs-filter-note").hidden = !state.category;
    $("rs-filter-name").textContent = state.category;

    if (!items.length) {
      container.appendChild(
        el(
          "p",
          "rs-empty",
          state.category
            ? "No hay gastos en esta categoría"
            : `Aún no hay gastos ${periodNoun(state.period)}`,
        ),
      );
      return;
    }

    let currentDay = "";
    items.forEach(({ kind, record: expense }) => {
      const date = String(expense.date || "").slice(0, 10);
      if (date !== currentDay) {
        currentDay = date;
        container.appendChild(el("div", "rs-day", dayLabel(date)));
      }

      const button = el("button", "rs-move");
      button.type = "button";

      if (kind === "pago") {
        const dot = el("span", "rs-dot is-payment", "+");
        dot.setAttribute("aria-hidden", "true");
        const text = el("span", "rs-move-text");
        text.appendChild(el("strong", "", expense.concept || "Pago"));
        text.appendChild(
          el(
            "small",
            "",
            `${tracksDebt ? "Pago" : "Pago de papá"} · ${expense.paymentMethod || "Tarjeta"}`,
          ),
        );
        button.append(
          dot,
          text,
          el(
            "span",
            "rs-move-amount is-payment",
            `+${money(expense.paidAmount)}`,
          ),
        );
        button.addEventListener("click", () => openDetail(expense.id, "pago"));
        container.appendChild(button);
        return;
      }

      const dot = el("span", "rs-dot", (expense.category || "?").charAt(0));
      dot.setAttribute("aria-hidden", "true");

      const text = el("span", "rs-move-text");
      text.appendChild(el("strong", "", expense.concept || "Sin concepto"));
      const meta = el(
        "small",
        "",
        `${expense.category || "Sin categoría"} · ${expenseMethodLabel(expense)}`,
      );
      if (tracksPapaDebt && fundedBy(expense) === FUNDED_BY_ME) {
        meta.appendChild(el("span", "rs-tag", "Pago Manolo"));
      }
      text.appendChild(meta);

      const amount = el(
        "span",
        "rs-move-amount is-expense",
        `−${money(expense.amount)}`,
      );

      button.append(dot, text, amount);
      button.addEventListener("click", () => openDetail(expense.id));
      container.appendChild(button);
    });
  }

  function currentSummary() {
    return buildPeriodSummary({
      scope,
      period: state.period,
      incomes: state.incomes,
      expenses: state.expenses,
      paymentMethods: state.paymentMethods,
    });
  }

  function renderPapaDebt() {
    const section = $("rs-debt");
    section.hidden = !tracksPapaDebt;
    if (!tracksPapaDebt) return;

    const reimbursements = state.incomes.filter(isReimbursement);
    const debt = buildPapaDebt({
      expenses: state.expenses,
      reimbursements,
      paymentMethods: state.paymentMethods,
    });

    $("rs-debt-label").textContent =
      debt.balance >= 0 ? "Pendiente de cobrar" : "Papá te adelantó";
    $("rs-debt-value").textContent = money(Math.abs(debt.balance));
    $("rs-debt-status").textContent =
      debt.balance === 0
        ? "Están a mano"
        : `Gasto Nu Casa ${money(debt.frontedTotal)} · Abono a tarjeta Nu Casa ${money(debt.repaid)}`;
    $("rs-debt-status").classList.toggle("is-ok", debt.balance === 0);
  }

  function methodOptionByName(name) {
    return (
      paymentOptions().find(
        (option) =>
          option.paymentMethod.toLowerCase() ===
          String(name || "").toLowerCase(),
      ) || null
    );
  }

  /** Guarda que un recordatorio ya se cumplió este periodo. */
  async function completeReminder(reminderId, date) {
    const reminders = markReminderDone(state.reminders, reminderId, date);
    state.settings = await saveSettingsRecord({
      ...state.settings,
      finance: {
        ...(state.settings.finance || {}),
        [scope]: { ...(state.settings.finance?.[scope] || {}), reminders },
      },
    });
    state.reminders = reminders;
  }

  async function handleReminder(row) {
    const { reminder, date } = row;

    if (reminder.kind === REMINDER_KINDS.TASK) {
      await completeReminder(reminder.id, date);
      render();
      showToast(`“${reminder.name}” marcado como hecho.`, { type: "success" });
      return;
    }

    // En Casa no hay pagos de tarjeta: lo que se paga es un gasto de la casa.
    const isPago = tracksDebt && reminder.kind === REMINDER_KINDS.CARD_PAYMENT;
    const method = methodOptionByName(reminder.method);

    // Si falta el monto, la forma de pago o la categoría, se abre el
    // formulario ya lleno para completarlo.
    if (
      !Number(reminder.amount) ||
      !method ||
      (!isPago && !reminder.category)
    ) {
      state.pendingReminder = { id: reminder.id, date };
      openExpenseForm(null, isPago ? "pago" : "gasto");
      $("rs-amount").value = reminder.amount ? String(reminder.amount) : "";
      fitAmountInput($("rs-amount"));
      $("rs-concept").value = reminder.name;
      $("rs-date").value = date;
      if (method) {
        state.form.method = method;
        state.form.fundedBy = reminder.fundedBy || defaultFundedBy(method);
      }
      if (reminder.category) state.form.category = reminder.category;
      applyFormType();
      return;
    }

    try {
      if (isPago) {
        await saveIncomeRecord({
          id: createId(),
          kind: CARD_PAYMENT_KIND,
          scope,
          date,
          concept: reminder.name,
          paymentMethod: method.paymentMethod,
          paymentStatus: "Pagado",
          totalAmount: Number(reminder.amount),
          paidAmount: Number(reminder.amount),
          remainingAmount: 0,
        });
      } else {
        await saveExpenseRecord({
          id: createId(),
          scope,
          date,
          concept: reminder.name,
          category: reminder.category || "Otro",
          amount: Number(reminder.amount),
          paymentMethod: method.paymentMethod,
          accountId: "",
          ...(tracksPapaDebt
            ? { fundedBy: reminder.fundedBy || defaultFundedBy(method) }
            : {}),
          invoice: "No",
          notes: "",
        });
      }

      await completeReminder(reminder.id, date);
      await loadData();
      state.period = periodForDate(scope, date);
      render();
      showToast(`“${reminder.name}” registrado.`, { type: "success" });
    } catch (error) {
      console.error("No se pudo registrar el recordatorio:", error);
      showToast(error?.message || "No se pudo registrar.", { type: "error" });
    }
  }

  function renderReminders() {
    const section = $("rs-reminders");
    const container = $("rs-reminder-list");
    const rows = buildUpcomingReminders(state.reminders, today);

    section.hidden = !rows.length;
    container.replaceChildren();

    rows.forEach((row) => {
      const item = el("div", "rs-reminder");
      const text = el("div", "rs-reminder-text");
      text.appendChild(el("strong", "", row.reminder.name));

      const when = el("small", "", `${dayLabel(row.date)} · `);
      const status = el(
        "span",
        `rs-reminder-when is-${row.status}`,
        reminderWhenLabel(row.days),
      );
      when.appendChild(status);
      if (Number(row.reminder.amount)) {
        when.appendChild(el("span", "", ` · ${money(row.reminder.amount)}`));
      }
      text.appendChild(when);

      const action = el(
        "button",
        "rs-btn rs-btn-soft rs-btn-sm",
        row.reminder.kind === REMINDER_KINDS.TASK
          ? "Ya lo hice"
          : "Ya lo pagué",
      );
      action.type = "button";
      action.addEventListener("click", () => handleReminder(row));

      item.append(text, action);
      container.appendChild(item);
    });
  }

  function render() {
    const summary = currentSummary();
    renderPeriod();
    renderSummary();
    renderCasaCosts();
    renderReminders();
    renderPapaDebt();
    renderCategories(summary.expenses);
    renderMovements(summary.expenses);
  }

  /* ---------- Hojas (ventanas) ---------- */

  let lastFocus = null;

  function openSheet(sheet, focusTarget) {
    lastFocus = document.activeElement;
    sheets.forEach((item) => {
      item.hidden = item !== sheet;
    });
    backdrop.hidden = false;
    document.body.classList.add("rs-sheet-open");
    requestAnimationFrame(() => {
      focusTarget?.focus();
      // Un monto ya escrito queda seleccionado para reemplazarlo de una vez.
      if (focusTarget instanceof HTMLInputElement && focusTarget.value) {
        focusTarget.select();
      }
    });
  }

  function closeSheets() {
    sheets.forEach((item) => {
      item.hidden = true;
    });
    backdrop.hidden = true;
    document.body.classList.remove("rs-sheet-open");
    state.editingId = null;
    state.detailId = null;
    state.pendingReminder = null;
    lastFocus?.focus?.();
  }

  function renderChips(container, options, selectedKey, onPick) {
    container.replaceChildren();
    options.forEach((option) => {
      const chip = el("button", "rs-chip", option.label);
      chip.type = "button";
      const isOn = option.key === selectedKey;
      chip.classList.toggle("is-active", isOn);
      chip.setAttribute("aria-pressed", String(isOn));
      chip.addEventListener("click", () => onPick(option));
      container.appendChild(chip);
    });
  }

  function renderExpenseChips() {
    const { form } = state;

    const categories = [...state.categories];
    if (form.category && !categories.includes(form.category)) {
      categories.unshift(form.category);
    }
    renderChips(
      $("rs-category-chips"),
      categories.map((name) => ({ key: name, label: name })),
      form.category,
      (option) => {
        form.category = option.key;
        renderExpenseChips();
      },
    );

    const isPago = form.type === "pago";
    $("rs-category-field").hidden = isPago;
    const methods = isPago ? paymentTargets() : paymentOptions();
    if (
      form.method &&
      !methods.some((option) => option.key === form.method.key)
    ) {
      methods.unshift(form.method);
    }
    renderChips($("rs-method-chips"), methods, form.method?.key, (option) => {
      form.method = option;
      // Mientras no lo cambien a mano: con la Nu el dinero es de Jose.
      if (!form.fundedTouched) form.fundedBy = defaultFundedBy(option);
      renderExpenseChips();
    });

    $("rs-funded-field").hidden = !tracksPapaDebt || isPago;
    renderChips(
      $("rs-funded-chips"),
      [
        { key: FUNDED_BY_PAPA, label: "Papá" },
        { key: FUNDED_BY_ME, label: "Manolo" },
      ],
      form.fundedBy,
      (option) => {
        form.fundedBy = option.key;
        form.fundedTouched = true;
        renderExpenseChips();
      },
    );
  }

  /** Con qué se registra un pago: tarjetas en Personal; efectivo o transferencia en Casa. */
  function paymentTargets() {
    return paymentOptions().filter((option) => {
      const isCard = isCardExpense(
        { paymentMethod: option.paymentMethod },
        state.paymentMethods,
      );
      return tracksDebt ? isCard : !isCard;
    });
  }

  /** Cómo se llama y qué pide un "Pago" en cada espacio. */
  const paymentCopy = tracksDebt
    ? {
        toggle: "Pago",
        title: "pago",
        methodLabel: "¿A qué tarjeta?",
        methodError: "Elige a qué tarjeta pagaste.",
        conceptPrefix: "Pago a",
        kind: CARD_PAYMENT_KIND,
        savedToast: "Pago guardado.",
      }
    : {
        toggle: "Pago de papá",
        title: "pago de papá",
        methodLabel: "¿Cómo te lo dio?",
        methodError: "Elige cómo te lo dio.",
        conceptPrefix: "Papá me pagó en",
        kind: REIMBURSEMENT_KIND,
        savedToast: "Pago de papá guardado.",
      };

  function applyFormType() {
    const { form } = state;
    const isPago = form.type === "pago";
    const isEditing = Boolean(state.editingId);

    document.querySelectorAll("[data-rs-type]").forEach((button) => {
      const isOn = button.dataset.rsType === form.type;
      button.classList.toggle("is-active", isOn);
      button.setAttribute("aria-pressed", String(isOn));
    });
    $("rs-expense-title").textContent = `${isEditing ? "Editar" : "Nuevo"} ${
      isPago ? paymentCopy.title : "gasto"
    }`;
    $("rs-expense-submit").textContent = isEditing
      ? "Guardar cambios"
      : isPago
        ? "Guardar pago"
        : "Guardar gasto";
    $("rs-method-label").textContent = isPago
      ? paymentCopy.methodLabel
      : "Pagado con";
    $("rs-concept-label").textContent = isPago ? "Nota (opcional)" : "Qué fue";
    $("rs-concept").placeholder = isPago
      ? `Ej. ${paymentCopy.conceptPrefix} efectivo`
      : "Ej. Walmart";
    renderExpenseChips();
  }

  function defaultFundedBy(methodOption) {
    if (!methodOption) return FUNDED_BY_PAPA;
    return isNuExpense({ paymentMethod: methodOption.paymentMethod })
      ? FUNDED_BY_ME
      : FUNDED_BY_PAPA;
  }

  function methodOptionFor(expense) {
    const options = paymentOptions();
    return (
      options.find(
        (option) => option.accountId && option.accountId === expense.accountId,
      ) ||
      options.find(
        (option) => option.paymentMethod === expense.paymentMethod,
      ) ||
      (expense.paymentMethod
        ? {
            key: `method:${expense.paymentMethod}`,
            label: expense.paymentMethod,
            accountId: expense.accountId || "",
            paymentMethod: expense.paymentMethod,
          }
        : null)
    );
  }

  function openExpenseForm(expense = null, type = "gasto") {
    const isPago = type === "pago";
    state.editingId = expense?.id || null;
    state.form = {
      type,
      category: isPago ? "" : expense?.category || "",
      method: expense ? methodOptionFor(expense) : null,
      fundedBy: expense ? fundedBy(expense) : FUNDED_BY_PAPA,
      fundedTouched: Boolean(expense?.fundedBy),
    };

    const amount = isPago ? expense?.paidAmount : expense?.amount;
    $("rs-type-toggle").hidden = Boolean(expense);
    $("rs-amount").value = expense ? String(amount ?? "") : "";
    fitAmountInput($("rs-amount"));
    $("rs-concept").value = expense?.concept || "";
    $("rs-date").value = expense?.date || defaultDateForPeriod();
    $("rs-expense-error").textContent = "";
    applyFormType();
    openSheet(expenseSheet, $("rs-amount"));
  }

  /** Hoy si cae en el periodo que se está viendo; si no, su primer día. */
  function defaultDateForPeriod() {
    const { start, end } = periodRange(state.period);
    return today >= start && today <= end ? today : start;
  }

  function detailRecord() {
    const source = state.detailKind === "pago" ? state.incomes : state.expenses;
    return source.find((item) => String(item.id) === String(state.detailId));
  }

  function openDetail(recordId, kind = "gasto") {
    state.detailId = recordId;
    state.detailKind = kind;
    const expense = detailRecord();
    if (!expense) return;

    const isPago = kind === "pago";
    const amountNode = $("rs-detail-amount");
    amountNode.textContent = isPago
      ? `+${money(expense.paidAmount)}`
      : `−${money(expense.amount)}`;
    amountNode.classList.toggle("is-payment", isPago);
    amountNode.classList.toggle("is-expense", !isPago);
    $("rs-detail-title").textContent =
      expense.concept || (isPago ? "Pago" : "Gasto");

    const list = $("rs-detail-list");
    list.replaceChildren();
    const rows = isPago
      ? [
          ["Fecha", dayLabel(String(expense.date || "").slice(0, 10))],
          [
            tracksDebt ? "Pagado a" : "Te lo dio en",
            expense.paymentMethod || "Tarjeta",
          ],
          ["Tipo", tracksDebt ? "Pago de tarjeta" : "Pago de papá"],
        ]
      : [
          ["Fecha", dayLabel(String(expense.date || "").slice(0, 10))],
          ["Categoría", expense.category || "Sin categoría"],
          ["Pagado con", expenseMethodLabel(expense)],
        ];
    if (tracksPapaDebt && !isPago) {
      rows.push([
        "Dinero de",
        fundedBy(expense) === FUNDED_BY_ME ? "Manolo" : "Papá",
      ]);
    }
    if (expense.notes) rows.push(["Nota", expense.notes]);

    rows.forEach(([label, value]) => {
      const row = el("div");
      row.append(el("dt", "", label), el("dd", "", value));
      list.appendChild(row);
    });

    openSheet(detailSheet, $("rs-detail-edit"));
  }

  /* ---------- Acciones ---------- */

  document.querySelector('[data-rs-type="pago"]').textContent =
    paymentCopy.toggle;

  document.querySelectorAll("[data-rs-type]").forEach((button) => {
    button.addEventListener("click", () => {
      const { form } = state;
      form.type = button.dataset.rsType;
      // Un pago sólo puede ir a una tarjeta: si lo elegido no lo es, se usa la primera.
      if (
        form.type === "pago" &&
        !paymentTargets().some((option) => option.key === form.method?.key)
      ) {
        form.method = paymentTargets()[0] || null;
      }
      applyFormType();
    });
  });

  async function savePayment() {
    const { form } = state;
    const amount = parseAmount($("rs-amount").value);
    const date = $("rs-date").value;
    const errorBox = $("rs-expense-error");

    errorBox.textContent = !amount
      ? "Escribe el monto."
      : !form.method
        ? paymentCopy.methodError
        : !date
          ? "Elige la fecha."
          : "";
    if (errorBox.textContent) return;

    const button = $("rs-expense-submit");
    const existing =
      state.incomes.find(
        (item) => String(item.id) === String(state.editingId),
      ) || {};
    const wasEditing = Boolean(state.editingId);
    setButtonLoading(button, true, "Guardando...");

    try {
      await saveIncomeRecord({
        ...existing,
        id: existing.id || createId(),
        kind: paymentCopy.kind,
        scope,
        date,
        concept:
          $("rs-concept").value.trim() ||
          `${paymentCopy.conceptPrefix} ${form.method.label.toLowerCase()}`,
        paymentMethod: form.method.paymentMethod,
        accountId: form.method.accountId || "",
        paymentStatus: "Pagado",
        totalAmount: amount,
        paidAmount: amount,
        remainingAmount: 0,
      });
      if (state.pendingReminder) {
        await completeReminder(
          state.pendingReminder.id,
          state.pendingReminder.date,
        );
        state.pendingReminder = null;
      }
      await loadData();
      state.period = periodForDate(scope, date);
      state.category = "";
      closeSheets();
      render();
      showToast(wasEditing ? "Cambios guardados." : paymentCopy.savedToast, {
        type: "success",
      });
    } catch (saveError) {
      console.error("No se pudo guardar el pago:", saveError);
      errorBox.textContent =
        saveError?.message || "No se pudo guardar. Intenta de nuevo.";
    } finally {
      setButtonLoading(button, false);
    }
  }

  expenseSheet.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { form } = state;
    if (form.type === "pago") {
      await savePayment();
      return;
    }
    const amount = parseAmount($("rs-amount").value);
    const concept = $("rs-concept").value.trim();
    const date = $("rs-date").value;
    const errorBox = $("rs-expense-error");

    const error = !amount
      ? "Escribe el monto."
      : !concept
        ? "Escribe qué fue el gasto."
        : !form.category
          ? "Elige una categoría."
          : !form.method
            ? "Elige con qué pagaste."
            : !date
              ? "Elige la fecha."
              : "";

    errorBox.textContent = error;
    if (error) return;

    const button = $("rs-expense-submit");
    const existing =
      state.expenses.find(
        (item) => String(item.id) === String(state.editingId),
      ) || {};
    const wasEditing = Boolean(state.editingId);
    setButtonLoading(button, true, "Guardando...");

    try {
      await saveExpenseRecord({
        ...existing,
        id: existing.id || createId(),
        scope,
        date,
        concept,
        category: form.category,
        amount,
        paymentMethod: form.method.paymentMethod,
        accountId: form.method.accountId || "",
        ...(tracksPapaDebt
          ? { fundedBy: form.fundedBy || FUNDED_BY_PAPA }
          : {}),
        invoice: existing.invoice || "No",
        notes: existing.notes || "",
      });
      if (state.pendingReminder) {
        await completeReminder(
          state.pendingReminder.id,
          state.pendingReminder.date,
        );
        state.pendingReminder = null;
      }
      await loadData();
      state.period = periodForDate(scope, date);
      state.category = "";
      closeSheets();
      render();
      showToast(wasEditing ? "Cambios guardados." : "Gasto guardado.", {
        type: "success",
      });
    } catch (saveError) {
      console.error("No se pudo guardar el gasto:", saveError);
      errorBox.textContent =
        saveError?.message ||
        "No se pudo guardar. Revisa tu conexión e intenta de nuevo.";
    } finally {
      setButtonLoading(button, false);
    }
  });

  $("rs-detail-edit").addEventListener("click", () => {
    const record = detailRecord();
    if (record) openExpenseForm(record, state.detailKind);
  });

  $("rs-detail-delete").addEventListener("click", async () => {
    const expense = detailRecord();
    if (!expense) return;
    const isPago = state.detailKind === "pago";

    const confirmed = await askConfirm({
      title: isPago ? "Eliminar pago" : "Eliminar gasto",
      message: `¿Eliminar “${expense.concept || (isPago ? "este pago" : "este gasto")}” por ${money(isPago ? expense.paidAmount : expense.amount)}?`,
      confirmText: "Eliminar",
    });
    if (!confirmed) return;

    try {
      if (isPago) {
        await deleteIncomeRecord(expense.id);
      } else {
        await deleteExpenseRecord(expense.id);
      }
      await loadData();
      closeSheets();
      render();
      showToast(isPago ? "Pago eliminado." : "Gasto eliminado.", {
        type: "success",
      });
    } catch (deleteError) {
      console.error("No se pudo eliminar el gasto:", deleteError);
      showToast(deleteError?.message || "No se pudo eliminar el gasto.", {
        type: "error",
      });
    }
  });

  document.querySelectorAll("[data-rs-add]").forEach((button) => {
    button.addEventListener("click", () => openExpenseForm());
  });
  document.querySelectorAll("[data-rs-close]").forEach((button) => {
    button.addEventListener("click", closeSheets);
  });
  backdrop.addEventListener("click", closeSheets);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !backdrop.hidden) closeSheets();
  });

  $("rs-amount").addEventListener("input", (event) =>
    fitAmountInput(event.target),
  );

  // El botón sirve para gastos y para pagos en los dos espacios.
  document.querySelectorAll("[data-rs-add]").forEach((button) => {
    button.textContent = "+ Agregar";
  });
  $("rs-prev").addEventListener("click", () => {
    state.period = shiftPeriod(state.period, -1);
    state.category = "";
    render();
  });
  $("rs-next").addEventListener("click", () => {
    state.period = shiftPeriod(state.period, 1);
    state.category = "";
    render();
  });
  $("rs-clear-filter").addEventListener("click", () => {
    state.category = "";
    render();
  });

  $("rs-excel").addEventListener("click", async () => {
    const { expenses } = currentSummary();
    if (!expenses.length) {
      showToast(`No hay gastos ${periodNoun(state.period)} para descargar.`, {
        type: "info",
      });
      return;
    }

    const exported = await exportExpensesToExcel(expenses, {
      subtitle: `${scopeConfig.label} · ${periodLabel(state.period)} ${state.period.year}`,
      fileName: `gastos_${scope}_${periodKey(state.period)}.xlsx`,
    });
    if (!exported) {
      showToast("No se cargaron las librerías para exportar el Excel.", {
        type: "error",
      });
    }
  });

  window.addEventListener("focus", async () => {
    if (!backdrop.hidden) return;
    try {
      await loadData();
      render();
    } catch (refreshError) {
      console.warn("No se pudo actualizar el resumen:", refreshError);
    }
  });

  try {
    await loadData();
    render();
    if (new URLSearchParams(window.location.search).get("nuevo") === "1") {
      openExpenseForm();
    }
  } catch (loadError) {
    console.error("No se pudo cargar el resumen:", loadError);
    showToast(loadError?.message || "No se pudo cargar la información.", {
      type: "error",
      duration: 5000,
    });
  } finally {
    setPageLoading(false);
  }
});
