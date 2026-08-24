import { protectPage } from "../services/auth.js";
import { getAccountsCollection } from "../services/accounts-service.js";
import {
  getExpensesCollection,
  saveExpenseRecord,
} from "../services/expenses-service.js";
import {
  getIncomeCollection,
  saveIncomeRecord,
} from "../services/income-service.js";
import {
  SCOPES,
  getActiveScope,
  getScopeConfig,
  recordMatchesScope,
  withScopeParam,
} from "../scopes.js";
import {
  formatCurrency,
  formatDate,
  getTodayISO,
  setButtonLoading,
  setPageLoading,
  showToast,
} from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  setPageLoading(true);
  await protectPage();

  const initialScope = getActiveScope();
  const form = document.getElementById("quick-movement-form");
  const amountInput = document.getElementById("movement-amount");
  const scopeSelect = document.getElementById("movement-scope");
  const categorySelect = document.getElementById("movement-category");
  const accountSelect = document.getElementById("movement-account");
  const feed = document.getElementById("movement-feed");
  let accounts = [];
  let incomes = [];
  let expenses = [];
  let activeFilter = "all";

  function selectedScope() {
    return initialScope === "resumen" ? scopeSelect.value : initialScope;
  }

  function selectedType() {
    return form.elements["movement-type"].value;
  }

  function createId(prefix) {
    return globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function fillSimpleSelect(select, values, placeholder) {
    const previous = select.value;
    select.replaceChildren();
    const option = document.createElement("option");
    option.value = "";
    option.textContent = placeholder;
    select.appendChild(option);
    values.forEach((value) => {
      const item = document.createElement("option");
      item.value = typeof value === "string" ? value : value.value;
      item.textContent = typeof value === "string" ? value : value.label;
      select.appendChild(item);
    });
    if ([...select.options].some((item) => item.value === previous))
      select.value = previous;
  }

  function refreshFormOptions() {
    const scope = selectedScope();
    const config = getScopeConfig(scope);
    const type = selectedType();
    const categories =
      type === "income"
        ? [
            "Sueldo / Quincena",
            "Cliente / Proyecto",
            "Venta",
            "Reembolso",
            "Otro ingreso",
          ]
        : config.expenseCategories;
    fillSimpleSelect(categorySelect, categories, "Selecciona una categoría");

    const visibleAccounts = accounts.filter(
      (account) => account.scope === scope && account.isActive !== false,
    );
    fillSimpleSelect(
      accountSelect,
      visibleAccounts.map((account) => ({
        value: account.id,
        label: `${account.name}${account.institution ? ` · ${account.institution}` : ""}`,
      })),
      "Sin cuenta asignada",
    );
    document.getElementById("account-help").textContent = visibleAccounts.length
      ? "Esto permite calcular el saldo de cada cuenta."
      : "Puedes guardar ahora y configurar tus cuentas después.";
  }

  function syncTypeUi() {
    const isIncome = selectedType() === "income";
    document.getElementById("income-source-group").hidden = !isIncome;
    document.getElementById("income-status-group").hidden = !isIncome;
    document.querySelectorAll(".movement-type-option").forEach((label) => {
      label.classList.toggle("active", label.querySelector("input").checked);
    });
    refreshFormOptions();
  }

  function renderFeed() {
    const scope = selectedScope();
    const rows = [
      ...incomes
        .filter((item) => recordMatchesScope(item, scope))
        .map((item) => ({
          ...item,
          type: "income",
          amountValue: Number(item.paidAmount || item.totalAmount || 0),
        })),
      ...expenses
        .filter((item) => recordMatchesScope(item, scope))
        .map((item) => ({
          ...item,
          type: "expense",
          amountValue: Number(item.amount || 0),
        })),
    ]
      .filter((item) => activeFilter === "all" || item.type === activeFilter)
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .slice(0, 30);

    feed.replaceChildren();
    document.getElementById("movement-list-subtitle").textContent =
      `Espacio ${SCOPES[scope]?.label || scope}`;
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "empty-message";
      empty.textContent = "No hay movimientos en esta vista.";
      feed.appendChild(empty);
      return;
    }

    rows.forEach((item) => {
      const account = accounts.find((entry) => entry.id === item.accountId);
      const row = document.createElement("article");
      row.className = "movement-feed-row";
      row.innerHTML = `<span class="transaction-icon ${item.type}">${item.type === "income" ? "+" : "−"}</span><div class="movement-feed-main"><strong>${item.concept || item.client || "Movimiento"}</strong><small>${item.category || (item.type === "income" ? "Ingreso" : "Gasto")} · ${account?.name || item.paymentMethod || "Sin cuenta"}</small></div><div class="movement-feed-meta"><b class="${item.type === "income" ? "amount-positive" : "amount-negative"}">${item.type === "income" ? "+" : "−"}${formatCurrency(item.amountValue)}</b><small>${formatDate(item.date)}</small></div>`;
      feed.appendChild(row);
    });
  }

  async function reloadCollections() {
    [incomes, expenses, accounts] = await Promise.all([
      getIncomeCollection(),
      getExpensesCollection(),
      getAccountsCollection(),
    ]);
  }

  function resetForm() {
    const preservedScope = selectedScope();
    form.reset();
    form.elements["movement-type"].value = "expense";
    document.getElementById("movement-date").value = getTodayISO();
    if (initialScope === "resumen") scopeSelect.value = preservedScope;
    syncTypeUi();
    amountInput.focus();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    const type = selectedType();
    const scope = selectedScope();
    const amount = Number(amountInput.value || 0);
    const date = document.getElementById("movement-date").value;
    const concept = document.getElementById("movement-concept").value.trim();
    const category = categorySelect.value;
    const accountId = accountSelect.value;
    const account = accounts.find((item) => item.id === accountId);
    const notes = document.getElementById("movement-notes").value.trim();

    if (!scope || !date || !concept || !category || amount <= 0) {
      showToast("Completa monto, fecha, concepto y categoría.", {
        type: "error",
      });
      return;
    }

    setButtonLoading(button, true, "Guardando...");
    try {
      if (type === "expense") {
        await saveExpenseRecord({
          id: createId("exp"),
          scope,
          accountId,
          date,
          concept,
          category,
          amount,
          paymentMethod: account?.name || "Sin cuenta",
          invoice: "No",
          notes,
        });
      } else {
        const received = document.getElementById("movement-received").checked;
        const source =
          document.getElementById("movement-source").value.trim() || category;
        await saveIncomeRecord({
          id: createId("inc"),
          scope,
          accountId,
          client: source,
          date,
          concept,
          totalAmount: amount,
          paidAmount: received ? amount : 0,
          remainingAmount: received ? 0 : amount,
          paymentStatus: received ? "Pagado" : "Pendiente",
          paymentMethod: account?.name || "Sin cuenta",
          invoiceRequired: "No",
          notes,
        });
      }
      await reloadCollections();
      renderFeed();
      resetForm();
      showToast("Movimiento guardado.", { type: "success" });
    } catch (error) {
      showToast(error.message || "No se pudo guardar el movimiento.", {
        type: "error",
      });
    } finally {
      setButtonLoading(button, false);
    }
  });

  document
    .querySelectorAll('input[name="movement-type"]')
    .forEach((input) => input.addEventListener("change", syncTypeUi));
  scopeSelect.addEventListener("change", () => {
    refreshFormOptions();
    renderFeed();
  });
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      document
        .querySelectorAll("[data-filter]")
        .forEach((item) => item.classList.toggle("active", item === button));
      renderFeed();
    });
  });

  try {
    if (initialScope === "resumen") {
      document.getElementById("movement-scope-group").hidden = false;
      fillSimpleSelect(
        scopeSelect,
        ["personal", "casa", "morfo"].map((scope) => ({
          value: scope,
          label: SCOPES[scope].label,
        })),
        "Selecciona un espacio",
      );
      scopeSelect.value = "personal";
    }
    document.getElementById("quick-settings-link").href = withScopeParam(
      "finance-settings.html",
      initialScope === "resumen" ? "personal" : initialScope,
    );
    document.getElementById("movement-date").value = getTodayISO();
    await reloadCollections();
    syncTypeUi();
    renderFeed();
  } finally {
    setPageLoading(false);
  }
});
