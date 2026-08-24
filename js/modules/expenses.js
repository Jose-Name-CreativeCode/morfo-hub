import { protectPage } from "../services/auth.js";
import {
  deleteExpenseRecord,
  getExpensesCollection,
  saveExpenseRecord,
} from "../services/expenses-service.js";
import { getAccountsCollection } from "../services/accounts-service.js";
import {
  fillSelectOptions,
  getActiveScope,
  getScopeConfig,
  recordMatchesScope,
} from "../scopes.js";
import { computeCasaBalance } from "../casa-ledger.js";
import {
  getIncomeCollection,
  saveIncomeRecord,
} from "../services/income-service.js";
import {
  appendRowActions,
  askConfirm,
  bindRowActions,
  createEmptyStateRow,
  createSelectCell,
  createTableCell,
  formatCurrency,
  formatDate,
  getTodayISO,
  normalizeText,
  setButtonLoading,
  setPageLoading,
  showToast,
} from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  setPageLoading(true);
  await protectPage();

  const expenseForm = document.querySelector("form");
  const expenseTableBody = document.querySelector(".table tbody");
  const submitButton = expenseForm.querySelector(".btn-primary");
  const accountSelect = document.getElementById("expense-account");
  const payerSelect = document.getElementById("expense-payer");

  const filterYearSelect = document.getElementById("filter-expense-year");
  const filterMonthSelect = document.getElementById("filter-expense-month");
  const filterCategorySelect = document.getElementById(
    "filter-expense-category",
  );
  const filterMethodSelect = document.getElementById("filter-expense-method");
  const filterPayerSelect = document.getElementById("filter-expense-payer");
  const clearFiltersBtn = document.getElementById("clear-expense-filters");
  const exportExcelBtn = document.getElementById("export-expense-excel");
  const expenseCounters = {
    total: document.getElementById("expense-total"),
    invoiced: document.getElementById("expense-invoiced"),
    count: document.getElementById("expense-count"),
  };
  const selectAllCheckbox = document.getElementById("select-all-expenses");
  const bulkBar = document.getElementById("expense-bulk-bar");
  const bulkCountLabel = document.getElementById("expense-bulk-count");
  const bulkDeleteButton = document.getElementById("expense-bulk-delete");
  const bulkClearButton = document.getElementById("expense-bulk-clear");
  const detailModal = document.getElementById("expense-detail-modal");
  const detailOverlay = document.getElementById("expense-detail-overlay");
  const detailCloseButton = document.getElementById("expense-detail-close");
  const detailTitle = document.getElementById("expense-detail-title");
  const detailMeta = document.getElementById("expense-detail-meta");
  const detailAmount = document.getElementById("expense-detail-amount");
  const detailCategory = document.getElementById("expense-detail-category");
  const detailMethod = document.getElementById("expense-detail-method");
  const detailPayer = document.getElementById("expense-detail-payer");
  const detailInvoice = document.getElementById("expense-detail-invoice");
  const detailNotes = document.getElementById("expense-detail-notes");

  let editingExpenseId = null;
  let currentExpenses = [];
  let currentAccounts = [];
  let casaIncomesCache = [];
  let scopeIncomeTotal = 0;
  let scopeChartInstance = null;
  const selectedExpenseIds = new Set();

  const activeScope = getActiveScope();
  const scopeConfig = getScopeConfig(activeScope);

  /**
   * Adapta el formulario y la tabla al espacio activo: categorías, métodos de
   * pago y, cuando no aplica (Personal y Casa), oculta todo lo de facturación.
   */
  function applyScopeToUi() {
    document.body.dataset.scope = activeScope;

    fillSelectOptions(
      document.getElementById("expense-category"),
      scopeConfig.expenseCategories,
      "Selecciona una categoría",
    );
    fillSelectOptions(
      document.getElementById("expense-payment-method"),
      scopeConfig.paymentMethods,
      "Selecciona una opción",
    );

    document.querySelectorAll("[data-invoice-only]").forEach((element) => {
      element.hidden = !scopeConfig.showInvoice;
    });

    document.querySelectorAll("[data-casa-only]").forEach((element) => {
      element.hidden = activeScope !== "casa";
    });

    document.querySelectorAll("[data-personal-only]").forEach((element) => {
      element.hidden = activeScope !== "personal";
    });

    if (!scopeConfig.showInvoice) {
      document.getElementById("expense-invoice").value = "no";
    }

    renderScopePresets();
  }

  /** Atajos de captura: en Personal y Casa son las tarjetas que sí se usan. */
  function renderScopePresets() {
    const presetsContainer = document.getElementById("expense-presets");
    if (!presetsContainer || scopeConfig.showInvoice) return;

    presetsContainer.replaceChildren();

    scopeConfig.paymentMethods.forEach((method) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "preset-chip";
      chip.textContent = method;
      chip.addEventListener("click", () => {
        document.getElementById("expense-payment-method").value = method;
      });
      presetsContainer.appendChild(chip);
    });
  }

  function getTableColumnCount() {
    return document.querySelectorAll(".table thead th:not([hidden])").length;
  }

  /** Carga únicamente ingresos confirmados. Las reglas no alteran el saldo. */
  async function syncCasaLedger() {
    if (activeScope !== "casa") return;

    casaIncomesCache = (await getIncomeCollection()).filter((income) =>
      recordMatchesScope(income, "casa"),
    );

    renderCasaLedger();
  }

  /** Recalcula el saldo con los gastos actuales; no vuelve a pedir ingresos. */
  function renderCasaLedger() {
    if (activeScope !== "casa") return;

    const { balance, totalIncome, settledExpenses, pendingExpenses } =
      computeCasaBalance(casaIncomesCache, currentExpenses);

    document.getElementById("casa-balance-grid").hidden = false;
    document.getElementById("casa-income-panel").hidden = false;
    document.getElementById("casa-balance").textContent =
      formatCurrency(balance);
    document.getElementById("casa-income-total").textContent =
      formatCurrency(totalIncome);
    document.getElementById("casa-settled-total").textContent =
      formatCurrency(settledExpenses);
    document.getElementById("casa-pending-total").textContent =
      formatCurrency(pendingExpenses);

    const list = document.getElementById("casa-income-list");
    list.replaceChildren();

    const recentIncomes = [...casaIncomesCache]
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .slice(0, 6);

    if (recentIncomes.length === 0) {
      const empty = document.createElement("p");
      empty.className = "section-subtitle section-subtitle-compact";
      empty.textContent = "Todavía no hay quincenas registradas.";
      list.appendChild(empty);
      return;
    }

    recentIncomes.forEach((income) => {
      list.appendChild(buildCasaIncomeCard(income));
    });
  }

  /** Tarjeta de un ingreso de Casa confirmado. */
  function buildCasaIncomeCard(income) {
    const card = document.createElement("article");
    card.className = "card casa-income-card";

    const label = document.createElement("span");
    label.className = "casa-income-card-label";
    label.textContent = "Ingreso";

    const amount = document.createElement("div");
    amount.className = "casa-income-card-amount";
    amount.textContent = formatCurrency(income.paidAmount || 0);

    const date = document.createElement("div");
    date.className = "casa-income-card-date";
    date.textContent = formatDate(income.date);

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "casa-income-card-edit-btn";
    editButton.textContent = "Editar";
    editButton.addEventListener("click", () => {
      startCasaIncomeEdit(card, income);
    });

    card.appendChild(label);
    card.appendChild(amount);
    card.appendChild(date);
    card.appendChild(editButton);

    return card;
  }

  function startCasaIncomeEdit(card, income) {
    card.replaceChildren();

    const label = document.createElement("span");
    label.className = "casa-income-card-label";
    label.textContent = "Ingreso";

    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.01";
    input.min = "0";
    input.value = income.paidAmount || 0;
    input.className = "casa-income-card-input";

    const date = document.createElement("div");
    date.className = "casa-income-card-date";
    date.textContent = formatDate(income.date);

    const actions = document.createElement("div");
    actions.className = "casa-income-card-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "btn-primary";
    saveButton.textContent = "Guardar";
    saveButton.addEventListener("click", async () => {
      const newAmount = Number(input.value || 0);
      setButtonLoading(saveButton, true, "Guardando...");

      try {
        const updated = await saveIncomeRecord({
          ...income,
          totalAmount: newAmount,
          paidAmount: newAmount,
          remainingAmount: 0,
        });

        casaIncomesCache = casaIncomesCache.map((item) =>
          String(item.id) === String(updated.id) ? updated : item,
        );
        renderCasaLedger();
        showToast("Quincena actualizada.", { type: "success" });
      } catch (error) {
        console.error("No se pudo actualizar la quincena:", error);
        showToast(error?.message || "No se pudo actualizar la quincena.", {
          type: "error",
          duration: 4200,
        });
        setButtonLoading(saveButton, false);
      }
    });

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "casa-income-card-edit-btn";
    cancelButton.textContent = "Cancelar";
    cancelButton.addEventListener("click", () => {
      card.replaceWith(buildCasaIncomeCard(income));
    });

    actions.appendChild(saveButton);
    actions.appendChild(cancelButton);

    card.appendChild(label);
    card.appendChild(input);
    card.appendChild(date);
    card.appendChild(actions);
    input.focus();
  }

  /**
   * Total de ingresos del espacio activo. En Morfo esta página no muestra
   * gráfica (ya tiene su propio dashboard), así que no aplica.
   */
  async function refreshScopeIncomeTotal() {
    if (activeScope === "morfo") return;

    if (activeScope === "casa") {
      scopeIncomeTotal = casaIncomesCache.reduce(
        (sum, income) => sum + Number(income.paidAmount || 0),
        0,
      );
      return;
    }

    const scopeIncomes = (await getIncomeCollection()).filter((income) =>
      recordMatchesScope(income, activeScope),
    );
    scopeIncomeTotal = scopeIncomes.reduce(
      (sum, income) =>
        sum + Number(income.paidAmount || income.totalAmount || 0),
      0,
    );
  }

  /** Ingresos vs. gastos, solo con los datos del espacio activo. */
  function renderScopeFinanceChart() {
    if (activeScope === "morfo") return;

    const panel = document.getElementById("scope-chart-panel");
    const canvas = document.getElementById("scopeFinanceChart");
    if (!panel || !canvas || typeof Chart === "undefined") return;

    panel.hidden = false;

    const totalExpenses = currentExpenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0,
    );

    if (scopeChartInstance) {
      scopeChartInstance.destroy();
    }

    scopeChartInstance = new Chart(canvas, {
      type: "pie",
      data: {
        labels: ["Ingresos", "Gastos"],
        datasets: [
          {
            data: [scopeIncomeTotal, totalExpenses],
            backgroundColor: ["#98db6b", "#ff8a8a"],
            borderColor: "#1f1f1f",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "bottom",
            labels: { color: "#f3f3f3", padding: 16 },
          },
        },
      },
    });
  }

  function createRecordId() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    return `exp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  async function loadAccountOptions() {
    currentAccounts = (await getAccountsCollection(activeScope)).filter(
      (account) => account.isActive !== false,
    );
    const previous = accountSelect.value;
    accountSelect.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Sin cuenta asignada";
    accountSelect.appendChild(empty);
    currentAccounts.forEach((account) => {
      const option = document.createElement("option");
      option.value = account.id;
      option.textContent = account.name;
      accountSelect.appendChild(option);
    });
    if (currentAccounts.some((account) => account.id === previous)) {
      accountSelect.value = previous;
    }
  }

  function applyExpenseFormDefaults() {
    document.getElementById("expense-date").value = getTodayISO();
    document.getElementById("expense-payment-method").value =
      scopeConfig.paymentMethods[0] || "";
    document.getElementById("expense-invoice").value = "no";
    if (payerSelect) payerSelect.value = "";
  }

  function applyExpensePreset(preset) {
    const methodSelect = document.getElementById("expense-payment-method");
    const invoiceSelect = document.getElementById("expense-invoice");

    if (preset === "card-basic") {
      methodSelect.value = "Tarjeta";
      invoiceSelect.value = "no";
      return;
    }

    if (preset === "bank-invoice") {
      methodSelect.value = "Transferencia";
      invoiceSelect.value = "yes";
      return;
    }

    if (preset === "cash-basic") {
      methodSelect.value = "Efectivo";
      invoiceSelect.value = "no";
    }
  }

  async function refreshExpensesCollection() {
    const allExpenses = await getExpensesCollection();
    currentExpenses = allExpenses.filter((expense) =>
      recordMatchesScope(expense, activeScope),
    );
    pruneSelection();
  }

  /** Selección para borrado masivo: quita ids que ya no existen. */
  function pruneSelection() {
    const validIds = new Set(
      currentExpenses.map((expense) => String(expense.id)),
    );
    [...selectedExpenseIds].forEach((id) => {
      if (!validIds.has(id)) selectedExpenseIds.delete(id);
    });
  }

  function renderBulkBar() {
    if (!bulkBar) return;

    const count = selectedExpenseIds.size;
    bulkBar.hidden = count === 0;

    if (bulkCountLabel) {
      bulkCountLabel.textContent = `${count} seleccionado${count === 1 ? "" : "s"}`;
    }
  }

  function clearSelection() {
    selectedExpenseIds.clear();
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
    renderBulkBar();
  }

  function resetForm() {
    expenseForm.reset();
    editingExpenseId = null;
    submitButton.textContent = "Guardar gasto";
    applyExpenseFormDefaults();
  }

  function applyExpensePrefillFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const concept = params.get("concept");
    const category = params.get("category");
    const amount = params.get("amount");
    const method = params.get("method");
    const invoice = params.get("invoice");
    const isQuickMode = params.get("quick") === "1";

    if (concept) document.getElementById("expense-concept").value = concept;
    if (category) document.getElementById("expense-category").value = category;
    if (amount) document.getElementById("expense-amount").value = amount;
    if (method) {
      document.getElementById("expense-payment-method").value = method;
    }
    if (invoice === "yes" || invoice === "no") {
      document.getElementById("expense-invoice").value = invoice;
    }

    if (isQuickMode) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.getElementById("expense-concept").focus();
    }
  }

  function loadYearOptions() {
    if (!filterYearSelect) return;

    const years = [
      ...new Set(
        currentExpenses
          .map((expense) => (expense.date ? expense.date.split("-")[0] : ""))
          .filter(Boolean),
      ),
    ].sort((a, b) => Number(b) - Number(a));

    const currentValue = filterYearSelect.value;

    filterYearSelect.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "Todos";
    filterYearSelect.appendChild(allOption);

    years.forEach((year) => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      filterYearSelect.appendChild(option);
    });

    filterYearSelect.value = years.includes(currentValue) ? currentValue : "";
  }

  function loadDynamicFilterOptions() {
    const selects = [
      {
        element: filterCategorySelect,
        values: currentExpenses.map((expense) => expense.category),
        label: "Todas",
      },
      {
        element: filterMethodSelect,
        values: currentExpenses.map((expense) => expense.paymentMethod),
        label: "Todos",
      },
    ];

    selects.forEach(({ element, values, label }) => {
      if (!element) return;

      const currentValue = element.value;
      const uniqueValues = [...new Set(values.filter(Boolean))].sort((a, b) =>
        String(a).localeCompare(String(b), "es-MX"),
      );

      element.replaceChildren();

      const allOption = document.createElement("option");
      allOption.value = "";
      allOption.textContent = label;
      element.appendChild(allOption);

      uniqueValues.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        element.appendChild(option);
      });

      element.value = uniqueValues.includes(currentValue) ? currentValue : "";
    });
  }

  function getFilteredExpenses() {
    let expenses = [...currentExpenses];

    const selectedYear = filterYearSelect ? filterYearSelect.value : "";
    const selectedMonth = filterMonthSelect ? filterMonthSelect.value : "";
    const selectedCategory = filterCategorySelect
      ? filterCategorySelect.value
      : "";
    const selectedMethod = filterMethodSelect ? filterMethodSelect.value : "";
    const selectedPayer = filterPayerSelect ? filterPayerSelect.value : "";

    if (selectedYear) {
      expenses = expenses.filter(
        (expense) =>
          expense.date && expense.date.startsWith(`${selectedYear}-`),
      );
    }

    if (selectedMonth) {
      expenses = expenses.filter((expense) => {
        if (!expense.date) return false;
        const parts = expense.date.split("-");
        return parts[1] === selectedMonth;
      });
    }

    if (selectedCategory) {
      expenses = expenses.filter(
        (expense) =>
          normalizeText(expense.category) === normalizeText(selectedCategory),
      );
    }

    if (selectedMethod) {
      expenses = expenses.filter(
        (expense) =>
          normalizeText(expense.paymentMethod) ===
          normalizeText(selectedMethod),
      );
    }

    if (selectedPayer) {
      expenses = expenses.filter(
        (expense) =>
          normalizeText(expense.payer) === normalizeText(selectedPayer),
      );
    }

    return expenses.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }

  function updateExpenseCounters(expenses) {
    const total = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0,
    );
    const invoiced = expenses.filter((expense) => expense.invoice === "Sí");

    expenseCounters.total.textContent = formatCurrency(total);
    expenseCounters.invoiced.textContent = String(invoiced.length);
    expenseCounters.count.textContent = String(expenses.length);

    if (activeScope === "casa") {
      const cashTotal = expenses
        .filter((expense) => isCasaCashExpense(expense))
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
      const creditTotal = expenses
        .filter((expense) => isCasaCreditExpense(expense))
        .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

      document.getElementById("casa-cash-total").textContent =
        formatCurrency(cashTotal);
      document.getElementById("casa-credit-total").textContent =
        formatCurrency(creditTotal);
    }
  }

  function getExpenseAccount(expense) {
    return currentAccounts.find(
      (account) => String(account.id) === String(expense.accountId || ""),
    );
  }

  function isCasaCashExpense(expense) {
    const account = getExpenseAccount(expense);
    if (account) return account.type === "cash";
    return normalizeText(expense.paymentMethod) === "efectivo";
  }

  function isCasaCreditExpense(expense) {
    const account = getExpenseAccount(expense);
    if (account) return account.type === "credit";

    return ["nu", "tarjeta", "tarjeta de credito", "credito", "amex"].includes(
      normalizeText(expense.paymentMethod),
    );
  }

  function renderExpenses() {
    const expenses = getFilteredExpenses();
    updateExpenseCounters(expenses);
    expenseTableBody.replaceChildren();
    renderCasaLedger();
    renderScopeFinanceChart();

    if (expenses.length === 0) {
      expenseTableBody.appendChild(
        createEmptyStateRow(
          "No hay gastos registrados.",
          getTableColumnCount(),
        ),
      );
      if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
      }
      renderBulkBar();
      return;
    }

    expenses.forEach((expense) => {
      const id = String(expense.id);
      const row = document.createElement("tr");

      const selectCell = createSelectCell(id);
      selectCell.querySelector("input").checked = selectedExpenseIds.has(id);
      row.appendChild(selectCell);

      row.appendChild(createTableCell(expense.date || "-"));
      row.appendChild(createTableCell(expense.concept || "-"));
      row.appendChild(createTableCell(expense.category || "-"));
      row.appendChild(createTableCell(formatCurrency(expense.amount)));
      row.appendChild(createTableCell(expense.paymentMethod || "-"));

      if (activeScope === "personal") {
        row.appendChild(createTableCell(expense.payer || "Sin asignar"));
      }

      if (scopeConfig.showInvoice) {
        row.appendChild(createTableCell(expense.invoice || "-"));
      }

      appendRowActions(row, expense.id, { onDetail: true });

      expenseTableBody.appendChild(row);
    });

    if (selectAllCheckbox) {
      const allSelected = expenses.every((expense) =>
        selectedExpenseIds.has(String(expense.id)),
      );
      const someSelected = expenses.some((expense) =>
        selectedExpenseIds.has(String(expense.id)),
      );
      selectAllCheckbox.checked = allSelected;
      selectAllCheckbox.indeterminate = someSelected && !allSelected;
    }

    renderBulkBar();
  }

  function fillForm(expense) {
    document.getElementById("expense-date").value = expense.date || "";
    document.getElementById("expense-concept").value = expense.concept || "";
    document.getElementById("expense-category").value = expense.category || "";
    document.getElementById("expense-amount").value = expense.amount || 0;
    document.getElementById("expense-payment-method").value =
      expense.paymentMethod || "";
    if (payerSelect) payerSelect.value = expense.payer || "";
    accountSelect.value = expense.accountId || "";
    document.getElementById("expense-invoice").value =
      expense.invoice === "Sí" ? "yes" : "no";
    document.getElementById("expense-notes").value = expense.notes || "";

    editingExpenseId = expense.id;
    submitButton.textContent = "Actualizar gasto";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEdit(expenseId) {
    const expenseToEdit = currentExpenses.find(
      (expense) => String(expense.id) === String(expenseId),
    );

    if (!expenseToEdit) return;
    fillForm(expenseToEdit);
  }

  function openExpenseDetail(expenseId) {
    const expense = currentExpenses.find(
      (item) => String(item.id) === String(expenseId),
    );
    if (!expense) return;

    detailTitle.textContent = expense.concept || "Gasto";
    detailMeta.textContent = `${formatDate(expense.date)} · ${expense.category || "-"}`;
    detailAmount.textContent = formatCurrency(expense.amount || 0);
    detailCategory.textContent = expense.category || "-";
    detailMethod.textContent = expense.paymentMethod || "-";
    if (detailPayer) detailPayer.textContent = expense.payer || "Sin asignar";
    detailInvoice.textContent = expense.invoice || "-";
    detailNotes.textContent = expense.notes || "Sin observaciones.";

    detailModal.classList.add("open");
    detailOverlay.classList.add("open");
  }

  function closeExpenseDetail() {
    detailModal.classList.remove("open");
    detailOverlay.classList.remove("open");
  }

  async function handleDelete(expenseId) {
    const confirmed = await askConfirm({
      title: "Eliminar gasto",
      message: "¿Seguro que quieres eliminar este gasto?",
      confirmText: "Eliminar",
    });
    if (!confirmed) return;

    try {
      await deleteExpenseRecord(expenseId);

      if (String(editingExpenseId) === String(expenseId)) {
        resetForm();
      }

      currentExpenses = currentExpenses.filter(
        (expense) => String(expense.id) !== String(expenseId),
      );
      selectedExpenseIds.delete(String(expenseId));
      loadYearOptions();
      renderExpenses();
      showToast("Gasto eliminado correctamente.", { type: "success" });
    } catch (error) {
      console.error("No se pudo eliminar el gasto:", error);
      showToast(
        error?.message ||
          "No se pudo eliminar el gasto. Revisa permisos o conexión.",
        { type: "error", duration: 5000 },
      );
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedExpenseIds];
    if (ids.length === 0) return;

    const confirmed = await askConfirm({
      title: "Eliminar gastos seleccionados",
      message: `¿Seguro que quieres eliminar ${ids.length} gasto${ids.length === 1 ? "" : "s"}? Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
    });
    if (!confirmed) return;

    const wasEditingSelected = ids.includes(String(editingExpenseId));
    setButtonLoading(bulkDeleteButton, true, "Eliminando...");

    try {
      for (const id of ids) {
        await deleteExpenseRecord(id);
      }

      currentExpenses = currentExpenses.filter(
        (expense) => !selectedExpenseIds.has(String(expense.id)),
      );
      clearSelection();

      if (wasEditingSelected) {
        resetForm();
      }

      loadYearOptions();
      loadDynamicFilterOptions();
      renderExpenses();
      showToast(
        `${ids.length} gasto${ids.length === 1 ? "" : "s"} eliminado${ids.length === 1 ? "" : "s"}.`,
        { type: "success" },
      );
    } catch (error) {
      console.error("No se pudieron eliminar los gastos seleccionados:", error);
      showToast(
        error?.message ||
          "No se pudieron eliminar algunos gastos. Revisa permisos o conexión.",
        { type: "error", duration: 5000 },
      );
      await refreshExpensesCollection();
      loadYearOptions();
      loadDynamicFilterOptions();
      renderExpenses();
    } finally {
      setButtonLoading(bulkDeleteButton, false);
    }
  }

  bindRowActions(expenseTableBody, {
    onDetail: (expenseId) => openExpenseDetail(expenseId),
    onEdit: (expenseId) => handleEdit(expenseId),
    onDelete: (expenseId) => handleDelete(expenseId),
  });

  expenseTableBody.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-row-select]");
    if (!checkbox) return;

    const id = checkbox.dataset.id;
    if (checkbox.checked) {
      selectedExpenseIds.add(id);
    } else {
      selectedExpenseIds.delete(id);
    }

    if (selectAllCheckbox) {
      const rowCheckboxes = [
        ...expenseTableBody.querySelectorAll("[data-row-select]"),
      ];
      const allChecked =
        rowCheckboxes.length > 0 && rowCheckboxes.every((cb) => cb.checked);
      const someChecked = rowCheckboxes.some((cb) => cb.checked);
      selectAllCheckbox.checked = allChecked;
      selectAllCheckbox.indeterminate = someChecked && !allChecked;
    }

    renderBulkBar();
  });

  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", () => {
      const rowCheckboxes = [
        ...expenseTableBody.querySelectorAll("[data-row-select]"),
      ];

      rowCheckboxes.forEach((checkbox) => {
        checkbox.checked = selectAllCheckbox.checked;
        if (selectAllCheckbox.checked) {
          selectedExpenseIds.add(checkbox.dataset.id);
        } else {
          selectedExpenseIds.delete(checkbox.dataset.id);
        }
      });

      selectAllCheckbox.indeterminate = false;
      renderBulkBar();
    });
  }

  if (bulkDeleteButton) {
    bulkDeleteButton.addEventListener("click", handleBulkDelete);
  }

  if (bulkClearButton) {
    bulkClearButton.addEventListener("click", clearSelection);
  }

  async function exportFilteredExpensesToExcel() {
    const expenses = getFilteredExpenses();

    if (expenses.length === 0) {
      showToast("No hay gastos en el filtro seleccionado para exportar.", {
        type: "info",
      });
      return;
    }

    if (typeof ExcelJS === "undefined" || typeof saveAs === "undefined") {
      showToast("No se cargaron las librerías para exportar el Excel.", {
        type: "error",
      });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Gastos", {
      views: [{ state: "frozen", ySplit: 4 }],
    });

    const year = filterYearSelect?.value || "Todos";
    const month = filterMonthSelect?.value || "Todos";

    const totalGastos = expenses.reduce(
      (sum, expense) => sum + Number(expense.amount || 0),
      0,
    );

    worksheet.mergeCells("A1:F1");
    worksheet.getCell("A1").value = "REPORTE DE GASTOS";
    worksheet.getCell("A1").font = {
      size: 18,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    worksheet.getCell("A1").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    worksheet.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFB91C1C" },
    };
    worksheet.getRow(1).height = 28;

    worksheet.mergeCells("A2:F2");
    worksheet.getCell("A2").value =
      `Filtro aplicado → Año: ${year} | Mes: ${month}`;
    worksheet.getCell("A2").font = {
      italic: true,
      color: { argb: "FF334155" },
    };
    worksheet.getCell("A2").alignment = {
      horizontal: "center",
      vertical: "middle",
    };
    worksheet.getCell("A2").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFEF2F2" },
    };

    const headers = [
      "Fecha",
      "Concepto",
      "Categoría",
      "Monto",
      "Método de pago",
      "Factura",
      "Observaciones",
    ];

    worksheet.addRow([]);
    const headerRow = worksheet.addRow(headers);

    headerRow.eachCell((cell) => {
      cell.font = {
        bold: true,
        color: { argb: "FFFFFFFF" },
      };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFDC2626" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });

    expenses.forEach((expense) => {
      const row = worksheet.addRow([
        expense.date || "-",
        expense.concept || "-",
        expense.category || "-",
        Number(expense.amount || 0),
        expense.paymentMethod || "-",
        expense.invoice || "-",
        expense.notes || "",
      ]);

      row.eachCell((cell, colNumber) => {
        cell.alignment = {
          vertical: "middle",
          wrapText: true,
          horizontal: colNumber === 4 ? "right" : "left",
        };

        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });

      row.getCell(4).numFmt = "$#,##0.00";
    });

    worksheet.addRow([]);

    const totalRow = worksheet.addRow([
      "",
      "",
      "TOTAL GASTOS",
      totalGastos,
      "",
      "",
      "",
    ]);

    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFEE2E2" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FF94A3B8" } },
        left: { style: "thin", color: { argb: "FF94A3B8" } },
        bottom: { style: "thin", color: { argb: "FF94A3B8" } },
        right: { style: "thin", color: { argb: "FF94A3B8" } },
      };
    });

    totalRow.getCell(4).numFmt = "$#,##0.00";

    worksheet.columns = [
      { width: 14 },
      { width: 30 },
      { width: 22 },
      { width: 16 },
      { width: 18 },
      { width: 12 },
      { width: 40 },
    ];

    worksheet.autoFilter = {
      from: "A4",
      to: "G4",
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `gastos_${year}_${month}.xlsx`;

    saveAs(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      fileName,
    );
  }

  expenseForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const date = document.getElementById("expense-date").value;
    const concept = document.getElementById("expense-concept").value.trim();
    const category = document.getElementById("expense-category").value;
    const amount = document.getElementById("expense-amount").value;
    const paymentMethod = document.getElementById(
      "expense-payment-method",
    ).value;
    const accountId = accountSelect.value;
    const payer = payerSelect?.value || "";
    const invoice = document.getElementById("expense-invoice").value;
    const notes = document.getElementById("expense-notes").value.trim();

    if (
      !date ||
      !concept ||
      !category ||
      !amount ||
      !paymentMethod ||
      !invoice ||
      (activeScope === "personal" && !payer)
    ) {
      showToast("Por favor, completa todos los campos obligatorios.", {
        type: "error",
      });
      return;
    }

    const existingExpense =
      currentExpenses.find(
        (expense) => String(expense.id) === String(editingExpenseId),
      ) || {};

    setButtonLoading(
      submitButton,
      true,
      editingExpenseId ? "Actualizando..." : "Guardando...",
    );

    try {
      const savedExpense = await saveExpenseRecord({
        ...existingExpense,
        id: editingExpenseId || existingExpense.id || createRecordId(),
        scope: activeScope,
        accountId,
        date,
        concept,
        category,
        amount: Number(amount),
        paymentMethod,
        payer: activeScope === "personal" ? payer : "",
        invoice: invoice === "yes" ? "Sí" : "No",
        notes,
      });

      if (savedExpense) {
        await refreshExpensesCollection();
      }

      resetForm();
      loadYearOptions();
      loadDynamicFilterOptions();
      renderExpenses();
      showToast("Gasto guardado correctamente.", { type: "success" });
    } catch (error) {
      console.error("No se pudo guardar el gasto:", error);
      showToast(
        error?.message ||
          "No se pudo guardar el gasto. Revisa permisos o conexión.",
        { type: "error", duration: 5000 },
      );
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  if (filterYearSelect) {
    filterYearSelect.addEventListener("change", () => {
      clearSelection();
      renderExpenses();
    });
  }

  if (filterMonthSelect) {
    filterMonthSelect.addEventListener("change", () => {
      clearSelection();
      renderExpenses();
    });
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      if (filterYearSelect) filterYearSelect.value = "";
      if (filterMonthSelect) filterMonthSelect.value = "";
      if (filterCategorySelect) filterCategorySelect.value = "";
      if (filterMethodSelect) filterMethodSelect.value = "";
      if (filterPayerSelect) filterPayerSelect.value = "";
      clearSelection();
      renderExpenses();
    });
  }

  if (filterCategorySelect) {
    filterCategorySelect.addEventListener("change", () => {
      clearSelection();
      renderExpenses();
    });
  }

  if (filterMethodSelect) {
    filterMethodSelect.addEventListener("change", () => {
      clearSelection();
      renderExpenses();
    });
  }

  if (filterPayerSelect) {
    filterPayerSelect.addEventListener("change", () => {
      clearSelection();
      renderExpenses();
    });
  }

  if (exportExcelBtn) {
    exportExcelBtn.addEventListener("click", exportFilteredExpensesToExcel);
  }

  document.querySelectorAll("[data-expense-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      applyExpensePreset(button.dataset.expensePreset);
      showToast("Yo apliqué un atajo de captura para este gasto.", {
        type: "info",
        duration: 2200,
      });
    });
  });

  detailCloseButton.addEventListener("click", closeExpenseDetail);
  detailOverlay.addEventListener("click", closeExpenseDetail);

  window.addEventListener("focus", async () => {
    await refreshExpensesCollection();
    await loadAccountOptions();
    await syncCasaLedger();
    await refreshScopeIncomeTotal();
    loadYearOptions();
    loadDynamicFilterOptions();
    renderExpenses();
  });

  try {
    applyScopeToUi();
    resetForm();
    applyExpensePrefillFromUrl();
    await refreshExpensesCollection();
    await loadAccountOptions();
    await syncCasaLedger();
    await refreshScopeIncomeTotal();
    loadYearOptions();
    loadDynamicFilterOptions();
    renderExpenses();
  } finally {
    setPageLoading(false);
  }
});
