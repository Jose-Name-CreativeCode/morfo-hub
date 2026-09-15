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
import { getAccountsCollection } from "../services/accounts-service.js";
import { exportExpensesToExcel } from "../services/expenses-excel.js";
import {
  getActiveScope,
  getScopeConfig,
  recordMatchesScope,
  withScopeParam,
} from "../scopes.js";
import {
  PERIOD_INCOME_KIND,
  buildPeriodSummary,
  carriesLeftover,
  periodForDate,
  periodIncomeId,
  periodKey,
  periodLabel,
  periodNoun,
  periodRange,
  shiftPeriod,
} from "../finance-periods.js";
import {
  CARD_PAYMENT_KIND,
  FUNDED_BY_ME,
  FUNDED_BY_PAPA,
  REIMBURSEMENT_KIND,
  buildDebtSummary,
  buildPapaDebt,
  fundedBy,
  isCardExpense,
  isCardPayment,
  isNuExpense,
  isReimbursement,
  shortDate,
} from "../card-ledger.js";
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
    accounts: [],
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
    moneyMode: "",
    moneyMethod: "",
  };

  const $ = (id) => document.getElementById(id);
  const backdrop = $("rs-backdrop");
  const expenseSheet = $("rs-expense-sheet");
  const detailSheet = $("rs-detail-sheet");
  const incomeSheet = $("rs-income-sheet");
  const moneySheet = $("rs-money-sheet");
  const sheets = [expenseSheet, detailSheet, incomeSheet, moneySheet];
  // En Casa se lleva lo que Jose pone por papá; en Personal, su tarjeta Nu.
  const tracksPapaDebt = scope === "casa";
  // En Personal el número grande es la deuda: gastos con tarjeta menos pagos.
  const tracksDebt = scope === "personal";

  document.title = `Morfo Hub | ${scopeConfig.label}`;

  /* ---------- Datos ---------- */

  async function loadData() {
    const [expenses, incomes, accounts] = await Promise.all([
      getExpensesCollection(),
      getIncomeCollection(),
      getAccountsCollection(scope),
    ]);
    state.expenses = expenses.filter((item) => recordMatchesScope(item, scope));
    state.incomes = incomes.filter((item) => recordMatchesScope(item, scope));
    state.accounts = accounts.filter((account) => account.isActive !== false);
  }

  /** Opciones de "Pagado con": las cuentas del espacio o, si no hay, los métodos base. */
  function paymentOptions() {
    if (state.accounts.length) {
      return state.accounts.map((account) => ({
        key: `account:${account.id}`,
        label: account.name,
        accountId: account.id,
        paymentMethod: account.name,
      }));
    }
    return scopeConfig.paymentMethods.map((method) => ({
      key: `method:${method}`,
      label: method,
      accountId: "",
      paymentMethod: method,
    }));
  }

  function expenseMethodLabel(expense) {
    const account = state.accounts.find(
      (item) => String(item.id) === String(expense.accountId || ""),
    );
    return account?.name || expense.paymentMethod || "Sin método";
  }

  /* ---------- Render ---------- */

  function renderPeriod() {
    const { period } = state;
    $("rs-period-kicker").textContent =
      `${scopeConfig.label} · ${period.half ? "quincena" : "mes"} · ${period.year}`;
    $("rs-period-title").textContent = periodLabel(period);
    $("rs-excel").textContent = `Descargar Excel de ${periodNoun(period)}`;
  }

  function setSplitChips(chips) {
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
      accounts: state.accounts,
    });
  }

  function renderDebtSummary() {
    const debt = currentDebt();
    const owes = debt.debt > 0.005;
    const leftValue = $("rs-left-value");

    $("rs-left-label").textContent = owes
      ? "Debes"
      : debt.debt < -0.005
        ? "Tienes a favor"
        : "No debes nada";
    leftValue.textContent = money(Math.abs(debt.debt));
    leftValue.classList.toggle("is-negative", owes);
    leftValue.classList.toggle("is-positive", !owes);

    // Totales de todo lo registrado, para que la resta cuadre con la deuda.
    $("rs-spent-label").textContent = "Gastado con tarjeta";
    $("rs-spent-value").textContent = `−${money(debt.charged)}`;
    $("rs-paid-value").textContent = `+${money(debt.paid)}`;

    const fill = $("rs-bar-fill");
    fill.style.width = `${debt.percentPaid}%`;
    fill.classList.remove("is-hot");
    fill.classList.add("is-good");
    $("rs-bar-note").textContent =
      debt.charged > 0
        ? `Llevas pagado el ${debt.percentPaid}% de lo que has gastado con tarjeta`
        : "Aún no tienes gastos con tarjeta";

    // Los chips sí son del periodo que se está viendo.
    setSplitChips([
      [`Gastaste ${periodNoun(state.period)}`, money(debt.spentInPeriod)],
      ["De eso, con tarjeta", money(debt.cardInPeriod)],
    ]);
  }

  function renderSummary(summary) {
    if (tracksDebt) {
      renderDebtSummary();
      return;
    }

    const noun = periodNoun(state.period);
    const leftValue = $("rs-left-value");

    $("rs-left-label").textContent = `Me queda ${noun}`;
    // Sin ningún monto escrito todavía, un saldo negativo sólo confundiría.
    const waitingForIncome = !summary.hasIncome && summary.carryIn === 0;
    leftValue.textContent = waitingForIncome ? "—" : money(summary.left);
    leftValue.classList.toggle(
      "is-negative",
      !waitingForIncome && summary.left < 0,
    );

    $("rs-income-value").textContent =
      summary.hasIncome || summary.income ? money(summary.income) : "Escribir";
    $("rs-spent-label").textContent =
      scope === "personal" ? "Gasté" : "Gastamos";
    $("rs-spent-value").textContent = `−${money(summary.spent)}`;

    const fill = $("rs-bar-fill");
    fill.style.width = `${Math.min(summary.percent, 100)}%`;
    fill.classList.toggle("is-hot", summary.percent >= 85);

    $("rs-bar-note").textContent =
      summary.available > 0
        ? `Llevas gastado el ${summary.percent}% de lo que tienes ${noun}`
        : `Toca “Entró” para escribir cuánto tienes ${noun}`;

    const chips = [];
    if (carriesLeftover(scope) && summary.carryIn !== 0) {
      chips.push([
        summary.carryIn > 0 ? "Sobró de antes" : "Faltó de antes",
        `${summary.carryIn > 0 ? "+" : "−"}${money(Math.abs(summary.carryIn))}`,
      ]);
    }
    chips.push(["Efectivo y transferencia", money(summary.cashAndTransfer)]);
    chips.push([scopeConfig.creditLabel || "Tarjeta", money(summary.credit)]);
    setSplitChips(chips);
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
      row.appendChild(el("span", "", name));
      row.appendChild(el("strong", "", money(total)));

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
    const payments =
      tracksDebt && !state.category ? currentDebt().payments : [];
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
          el("small", "", `Pago · ${expense.paymentMethod || "Tarjeta"}`),
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
      if (
        tracksPapaDebt &&
        fundedBy(expense, state.accounts) === FUNDED_BY_ME
      ) {
        meta.appendChild(el("span", "rs-tag", "Te lo repone papá"));
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
      accounts: state.accounts,
    });
  }

  function renderLedgerList(container, records, emptyText) {
    container.replaceChildren();
    const recent = [...records]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5);

    if (!recent.length) {
      container.appendChild(el("p", "rs-ledger-empty", emptyText));
      return;
    }

    recent.forEach((record) => {
      const row = el("div", "rs-ledger-row");
      const text = el("span", "", shortDate(record.date));
      if (record.paymentMethod) {
        text.appendChild(el("small", "", ` · ${record.paymentMethod}`));
      }
      const remove = el("button", "rs-ledger-remove", "×");
      remove.type = "button";
      remove.setAttribute(
        "aria-label",
        `Eliminar ${money(record.paidAmount)} del ${shortDate(record.date)}`,
      );
      remove.addEventListener("click", () => removeMoneyRecord(record));
      row.append(text, el("strong", "", money(record.paidAmount)), remove);
      container.appendChild(row);
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
      accounts: state.accounts,
    });

    $("rs-debt-label").textContent =
      debt.balance >= 0 ? "Papá te debe" : "Papá te adelantó";
    $("rs-debt-value").textContent = money(Math.abs(debt.balance));
    $("rs-debt-status").textContent =
      debt.balance === 0
        ? "Están a mano"
        : `Pusiste ${money(debt.frontedTotal)} · te ha dado ${money(debt.repaid)}`;
    $("rs-debt-status").classList.toggle("is-ok", debt.balance === 0);
    renderLedgerList(
      $("rs-debt-list"),
      reimbursements,
      "Aún no registras pagos de papá.",
    );
  }

  function render() {
    const summary = currentSummary();
    renderPeriod();
    renderSummary(summary);
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

    const categories = [...scopeConfig.expenseCategories];
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
    const methods = isPago ? cardOptions() : paymentOptions();
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
        { key: FUNDED_BY_ME, label: "Mío (me lo repone)" },
      ],
      form.fundedBy,
      (option) => {
        form.fundedBy = option.key;
        form.fundedTouched = true;
        renderExpenseChips();
      },
    );
  }

  /** Tarjetas a las que se les puede pagar. */
  function cardOptions() {
    return paymentOptions().filter((option) =>
      isCardExpense(
        { paymentMethod: option.paymentMethod, accountId: option.accountId },
        state.accounts,
      ),
    );
  }

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
      isPago ? "pago" : "gasto"
    }`;
    $("rs-expense-submit").textContent = isEditing
      ? "Guardar cambios"
      : isPago
        ? "Guardar pago"
        : "Guardar gasto";
    $("rs-method-label").textContent = isPago
      ? "¿A qué tarjeta?"
      : "Pagado con";
    $("rs-concept-label").textContent = isPago ? "Nota (opcional)" : "Qué fue";
    $("rs-concept").placeholder = isPago ? "Ej. Pago a Nu" : "Ej. Walmart";
    renderExpenseChips();
  }

  function defaultFundedBy(methodOption) {
    if (!methodOption) return FUNDED_BY_PAPA;
    return isNuExpense(
      {
        paymentMethod: methodOption.paymentMethod,
        accountId: methodOption.accountId,
      },
      state.accounts,
    )
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
      fundedBy: expense ? fundedBy(expense, state.accounts) : FUNDED_BY_PAPA,
      fundedTouched: Boolean(expense?.fundedBy),
    };

    const amount = isPago ? expense?.paidAmount : expense?.amount;
    $("rs-type-toggle").hidden = !tracksDebt || Boolean(expense);
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
          ["Pagado a", expense.paymentMethod || "Tarjeta"],
          ["Tipo", "Pago de tarjeta"],
        ]
      : [
          ["Fecha", dayLabel(String(expense.date || "").slice(0, 10))],
          ["Categoría", expense.category || "Sin categoría"],
          ["Pagado con", expenseMethodLabel(expense)],
        ];
    if (tracksPapaDebt && !isPago) {
      rows.push([
        "Dinero de",
        fundedBy(expense, state.accounts) === FUNDED_BY_ME
          ? "Tuyo (te lo repone papá)"
          : "Papá",
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

  function openIncomeForm() {
    const { period } = state;
    const summary = currentSummary();
    const label = periodLabel(period);

    $("rs-income-title").textContent = period.half
      ? `¿Cuánto entró del ${label}?`
      : `¿Cuánto entró en ${label.toLowerCase()}?`;
    $("rs-income-amount").value = summary.income ? String(summary.income) : "";
    fitAmountInput($("rs-income-amount"));
    $("rs-income-note").textContent = [
      `Es el dinero con el que cuentas ${periodNoun(period)} en ${scopeConfig.label}.`,
      "Si no lo cambias, el siguiente periodo usa este mismo monto.",
      carriesLeftover(scope)
        ? "Lo que sobre pasa a la siguiente quincena."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    openSheet(incomeSheet, $("rs-income-amount"));
  }

  const MONEY_METHODS = ["Efectivo", "Transferencia"];

  function renderMoneyMethodChips() {
    renderChips(
      $("rs-money-method-chips"),
      MONEY_METHODS.map((method) => ({ key: method, label: method })),
      state.moneyMethod,
      (option) => {
        state.moneyMethod = option.key;
        renderMoneyMethodChips();
      },
    );
  }

  /** Dinero que papá le devolvió a Jose (Casa). */
  function openMoneyForm() {
    const suggested = Math.max(
      0,
      buildPapaDebt({
        expenses: state.expenses,
        reimbursements: state.incomes.filter(isReimbursement),
        accounts: state.accounts,
      }).balance,
    );
    $("rs-money-title").textContent = "Papá me pagó";
    $("rs-money-note").textContent =
      "Baja lo que papá te debe. No cambia los gastos de Casa, que ya están contados.";
    state.moneyMethod = "Efectivo";
    renderMoneyMethodChips();
    $("rs-money-amount").value = suggested
      ? String(Math.round(suggested * 100) / 100)
      : "";
    fitAmountInput($("rs-money-amount"));
    $("rs-money-date").value = today;
    $("rs-money-error").textContent = "";
    openSheet(moneySheet, $("rs-money-amount"));
  }

  async function removeMoneyRecord(record) {
    const confirmed = await askConfirm({
      title: "Eliminar pago de papá",
      message: `¿Eliminar ${money(record.paidAmount)} del ${shortDate(record.date)}?`,
      confirmText: "Eliminar",
    });
    if (!confirmed) return;

    try {
      await deleteIncomeRecord(record.id);
      await loadData();
      render();
      showToast("Eliminado.", { type: "success" });
    } catch (deleteError) {
      console.error("No se pudo eliminar el registro:", deleteError);
      showToast(deleteError?.message || "No se pudo eliminar.", {
        type: "error",
      });
    }
  }

  /* ---------- Acciones ---------- */

  moneySheet.addEventListener("submit", async (event) => {
    event.preventDefault();
    const amount = parseAmount($("rs-money-amount").value);
    const date = $("rs-money-date").value;
    const errorBox = $("rs-money-error");

    errorBox.textContent = !amount
      ? "Escribe el monto."
      : !date
        ? "Elige la fecha."
        : "";
    if (errorBox.textContent) return;

    const button = $("rs-money-submit");
    setButtonLoading(button, true, "Guardando...");

    try {
      await saveIncomeRecord({
        id: createId(),
        kind: REIMBURSEMENT_KIND,
        scope,
        date,
        concept: "Papá me pagó",
        paymentMethod: state.moneyMethod,
        paymentStatus: "Pagado",
        totalAmount: amount,
        paidAmount: amount,
        remainingAmount: 0,
      });
      await loadData();
      closeSheets();
      render();
      showToast("Pago de papá guardado.", { type: "success" });
    } catch (saveError) {
      console.error("No se pudo guardar:", saveError);
      errorBox.textContent =
        saveError?.message || "No se pudo guardar. Intenta de nuevo.";
    } finally {
      setButtonLoading(button, false);
    }
  });

  $("rs-debt-add").addEventListener("click", () => openMoneyForm());

  document.querySelectorAll("[data-rs-type]").forEach((button) => {
    button.addEventListener("click", () => {
      const { form } = state;
      form.type = button.dataset.rsType;
      // Un pago sólo puede ir a una tarjeta: si lo elegido no lo es, se usa la primera.
      if (
        form.type === "pago" &&
        !cardOptions().some((option) => option.key === form.method?.key)
      ) {
        form.method = cardOptions()[0] || null;
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
        ? "Elige a qué tarjeta pagaste."
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
        kind: CARD_PAYMENT_KIND,
        scope,
        date,
        concept: $("rs-concept").value.trim() || `Pago a ${form.method.label}`,
        paymentMethod: form.method.paymentMethod,
        accountId: form.method.accountId || "",
        paymentStatus: "Pagado",
        totalAmount: amount,
        paidAmount: amount,
        remainingAmount: 0,
      });
      await loadData();
      state.period = periodForDate(scope, date);
      state.category = "";
      closeSheets();
      render();
      showToast(wasEditing ? "Cambios guardados." : "Pago guardado.", {
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

  incomeSheet.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { period } = state;
    const amount = parseAmount($("rs-income-amount").value);
    const button = $("rs-income-submit");
    setButtonLoading(button, true, "Guardando...");

    try {
      await saveIncomeRecord({
        id: periodIncomeId(scope, period, user.id),
        kind: PERIOD_INCOME_KIND,
        period: periodKey(period),
        scope,
        date: periodRange(period).start,
        concept: `Entró · ${periodLabel(period)}`,
        paymentStatus: "Pagado",
        totalAmount: amount,
        paidAmount: amount,
        remainingAmount: 0,
      });
      await loadData();
      closeSheets();
      render();
      showToast("Monto guardado.", { type: "success" });
    } catch (saveError) {
      console.error("No se pudo guardar el monto:", saveError);
      showToast(saveError?.message || "No se pudo guardar el monto.", {
        type: "error",
      });
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

  ["rs-amount", "rs-income-amount", "rs-money-amount"].forEach((id) => {
    $(id).addEventListener("input", (event) => fitAmountInput(event.target));
  });

  $("rs-income-btn").addEventListener("click", openIncomeForm);
  $("rs-income-btn").hidden = tracksDebt;
  $("rs-paid").hidden = !tracksDebt;
  if (tracksDebt) {
    document.querySelectorAll("[data-rs-add]").forEach((button) => {
      button.textContent = "+ Agregar";
    });
  }
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
