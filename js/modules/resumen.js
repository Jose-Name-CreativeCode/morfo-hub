import { protectPage } from "../services/auth.js";
import {
  deleteExpenseRecord,
  getExpensesCollection,
  saveExpenseRecord,
} from "../services/expenses-service.js";
import {
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
  isOtherPayer,
  periodForDate,
  periodIncomeId,
  periodKey,
  periodLabel,
  periodNoun,
  periodRange,
  shiftPeriod,
} from "../finance-periods.js";
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
    form: { category: "", method: null, payer: "" },
  };

  const $ = (id) => document.getElementById(id);
  const backdrop = $("rs-backdrop");
  const expenseSheet = $("rs-expense-sheet");
  const detailSheet = $("rs-detail-sheet");
  const incomeSheet = $("rs-income-sheet");
  const sheets = [expenseSheet, detailSheet, incomeSheet];

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

  function renderSummary(summary) {
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
    $("rs-spent-value").textContent = money(summary.spent);

    const fill = $("rs-bar-fill");
    fill.style.width = `${Math.min(summary.percent, 100)}%`;
    fill.classList.toggle("is-hot", summary.percent >= 85);

    $("rs-bar-note").textContent =
      summary.available > 0
        ? `Llevas gastado el ${summary.percent}% de lo que tienes ${noun}`
        : `Toca “Entró” para escribir cuánto tienes ${noun}`;

    const split = $("rs-split");
    split.replaceChildren();
    const addChip = (label, amount) => {
      const chip = el("span", "rs-split-chip", `${label} `);
      chip.appendChild(el("b", "", amount));
      split.appendChild(chip);
    };

    if (carriesLeftover(scope) && summary.carryIn !== 0) {
      addChip(
        summary.carryIn > 0 ? "Sobró de antes" : "Faltó de antes",
        `${summary.carryIn > 0 ? "+" : "−"}${money(Math.abs(summary.carryIn))}`,
      );
    }

    if (scope === "personal") {
      addChip("Pagaste tú", money(summary.spent));
      addChip("Pagó papá", money(summary.paidByOther));
    } else {
      addChip("Efectivo y transferencia", money(summary.cashAndTransfer));
      addChip("Tarjeta", money(summary.credit));
    }
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

    $("rs-moves-count").textContent =
      `${visible.length} ${visible.length === 1 ? "gasto" : "gastos"}`;
    $("rs-filter-note").hidden = !state.category;
    $("rs-filter-name").textContent = state.category;

    if (!visible.length) {
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
    visible.forEach((expense) => {
      const date = String(expense.date || "").slice(0, 10);
      if (date !== currentDay) {
        currentDay = date;
        container.appendChild(el("div", "rs-day", dayLabel(date)));
      }

      const button = el("button", "rs-move");
      button.type = "button";

      const dot = el("span", "rs-dot", (expense.category || "?").charAt(0));
      dot.setAttribute("aria-hidden", "true");

      const text = el("span", "rs-move-text");
      text.appendChild(el("strong", "", expense.concept || "Sin concepto"));
      const meta = el(
        "small",
        "",
        `${expense.category || "Sin categoría"} · ${expenseMethodLabel(expense)}`,
      );
      if (scope === "personal" && isOtherPayer(expense)) {
        meta.appendChild(el("span", "rs-tag", "Papá"));
      }
      text.appendChild(meta);

      const amount = el("span", "rs-move-amount", `−${money(expense.amount)}`);

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

  function render() {
    const summary = currentSummary();
    renderPeriod();
    renderSummary(summary);
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

    const methods = paymentOptions();
    if (
      form.method &&
      !methods.some((option) => option.key === form.method.key)
    ) {
      methods.unshift(form.method);
    }
    renderChips($("rs-method-chips"), methods, form.method?.key, (option) => {
      form.method = option;
      renderExpenseChips();
    });

    const payers = scopeConfig.payers || [];
    $("rs-payer-field").hidden = !payers.length;
    renderChips(
      $("rs-payer-chips"),
      payers.map((payer) => ({ key: payer.value, label: payer.label })),
      form.payer,
      (option) => {
        form.payer = option.key;
        renderExpenseChips();
      },
    );
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

  function openExpenseForm(expense = null) {
    state.editingId = expense?.id || null;
    state.form = {
      category: expense?.category || "",
      method: expense ? methodOptionFor(expense) : null,
      payer: expense
        ? isOtherPayer(expense)
          ? "Pago papá"
          : "Pago mío"
        : "Pago mío",
    };

    $("rs-expense-title").textContent = expense
      ? "Editar gasto"
      : "Nuevo gasto";
    $("rs-expense-submit").textContent = expense
      ? "Guardar cambios"
      : "Guardar gasto";
    $("rs-amount").value = expense ? String(expense.amount ?? "") : "";
    fitAmountInput($("rs-amount"));
    $("rs-concept").value = expense?.concept || "";
    $("rs-date").value = expense?.date || defaultDateForPeriod();
    $("rs-expense-error").textContent = "";
    renderExpenseChips();
    openSheet(expenseSheet, $("rs-amount"));
  }

  /** Hoy si cae en el periodo que se está viendo; si no, su primer día. */
  function defaultDateForPeriod() {
    const { start, end } = periodRange(state.period);
    return today >= start && today <= end ? today : start;
  }

  function openDetail(expenseId) {
    const expense = state.expenses.find(
      (item) => String(item.id) === String(expenseId),
    );
    if (!expense) return;
    state.detailId = expense.id;

    $("rs-detail-title").textContent = expense.concept || "Gasto";
    $("rs-detail-amount").textContent = `−${money(expense.amount)}`;

    const list = $("rs-detail-list");
    list.replaceChildren();
    const rows = [
      ["Fecha", dayLabel(String(expense.date || "").slice(0, 10))],
      ["Categoría", expense.category || "Sin categoría"],
      ["Pagado con", expenseMethodLabel(expense)],
    ];
    if (scope === "personal") {
      rows.push(["Quién pagó", isOtherPayer(expense) ? "Papá" : "Yo"]);
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

  /* ---------- Acciones ---------- */

  expenseSheet.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { form } = state;
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
        payer: scope === "personal" ? form.payer : existing.payer || "",
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
    const expense = state.expenses.find(
      (item) => String(item.id) === String(state.detailId),
    );
    if (expense) openExpenseForm(expense);
  });

  $("rs-detail-delete").addEventListener("click", async () => {
    const expense = state.expenses.find(
      (item) => String(item.id) === String(state.detailId),
    );
    if (!expense) return;

    const confirmed = await askConfirm({
      title: "Eliminar gasto",
      message: `¿Eliminar “${expense.concept || "este gasto"}” por ${money(expense.amount)}?`,
      confirmText: "Eliminar",
    });
    if (!confirmed) return;

    try {
      await deleteExpenseRecord(expense.id);
      await loadData();
      closeSheets();
      render();
      showToast("Gasto eliminado.", { type: "success" });
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

  ["rs-amount", "rs-income-amount"].forEach((id) => {
    $(id).addEventListener("input", (event) => fitAmountInput(event.target));
  });

  $("rs-income-btn").addEventListener("click", openIncomeForm);
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
