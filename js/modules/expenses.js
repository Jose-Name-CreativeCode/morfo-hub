import { protectPage } from "../services/auth.js";
import {
  deleteExpenseRecord,
  getExpensesCollection,
  saveExpenseRecord,
} from "../services/expenses-service.js";
import {
  fillSelectOptions,
  getActiveScope,
  getScopeConfig,
  recordMatchesScope,
} from "../scopes.js";
import {
  appendRowActions,
  askConfirm,
  bindRowActions,
  createEmptyStateRow,
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

  const filterYearSelect = document.getElementById("filter-expense-year");
  const filterMonthSelect = document.getElementById("filter-expense-month");
  const filterCategorySelect = document.getElementById(
    "filter-expense-category",
  );
  const filterMethodSelect = document.getElementById("filter-expense-method");
  const clearFiltersBtn = document.getElementById("clear-expense-filters");
  const exportExcelBtn = document.getElementById("export-expense-excel");
  const expenseCounters = {
    total: document.getElementById("expense-total"),
    topCategory: document.getElementById("expense-top-category"),
    invoiced: document.getElementById("expense-invoiced"),
    count: document.getElementById("expense-count"),
  };
  const detailModal = document.getElementById("expense-detail-modal");
  const detailOverlay = document.getElementById("expense-detail-overlay");
  const detailCloseButton = document.getElementById("expense-detail-close");
  const detailTitle = document.getElementById("expense-detail-title");
  const detailMeta = document.getElementById("expense-detail-meta");
  const detailAmount = document.getElementById("expense-detail-amount");
  const detailCategory = document.getElementById("expense-detail-category");
  const detailMethod = document.getElementById("expense-detail-method");
  const detailInvoice = document.getElementById("expense-detail-invoice");
  const detailNotes = document.getElementById("expense-detail-notes");

  let editingExpenseId = null;
  let currentExpenses = [];

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

  function createRecordId() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    return `exp-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function applyExpenseFormDefaults() {
    document.getElementById("expense-date").value = getTodayISO();
    document.getElementById("expense-payment-method").value =
      scopeConfig.paymentMethods[0] || "";
    document.getElementById("expense-invoice").value = "no";
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
          normalizeText(expense.paymentMethod) === normalizeText(selectedMethod),
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
    const byCategory = expenses.reduce((acc, expense) => {
      const category = expense.category || "Sin categoría";
      acc[category] = (acc[category] || 0) + Number(expense.amount || 0);
      return acc;
    }, {});
    const topCategory =
      Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

    expenseCounters.total.textContent = formatCurrency(total);
    expenseCounters.topCategory.textContent = topCategory;
    expenseCounters.invoiced.textContent = String(invoiced.length);
    expenseCounters.count.textContent = String(expenses.length);
  }

  function renderExpenses() {
    const expenses = getFilteredExpenses();
    updateExpenseCounters(expenses);
    expenseTableBody.replaceChildren();

    if (expenses.length === 0) {
      expenseTableBody.appendChild(
        createEmptyStateRow("No hay gastos registrados.", getTableColumnCount()),
      );
      return;
    }

    expenses.forEach((expense) => {
      const row = document.createElement("tr");
      row.appendChild(createTableCell(expense.date || "-"));
      row.appendChild(createTableCell(expense.concept || "-"));
      row.appendChild(createTableCell(expense.category || "-"));
      row.appendChild(createTableCell(formatCurrency(expense.amount)));
      row.appendChild(createTableCell(expense.paymentMethod || "-"));

      if (scopeConfig.showInvoice) {
        row.appendChild(createTableCell(expense.invoice || "-"));
      }

      appendRowActions(row, expense.id, { onDetail: true });

      expenseTableBody.appendChild(row);
    });
  }

  function fillForm(expense) {
    document.getElementById("expense-date").value = expense.date || "";
    document.getElementById("expense-concept").value = expense.concept || "";
    document.getElementById("expense-category").value = expense.category || "";
    document.getElementById("expense-amount").value = expense.amount || 0;
    document.getElementById("expense-payment-method").value =
      expense.paymentMethod || "";
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

  bindRowActions(expenseTableBody, {
    onDetail: (expenseId) => openExpenseDetail(expenseId),
    onEdit: (expenseId) => handleEdit(expenseId),
    onDelete: (expenseId) => handleDelete(expenseId),
  });

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
    const invoice = document.getElementById("expense-invoice").value;
    const notes = document.getElementById("expense-notes").value.trim();

    if (
      !date ||
      !concept ||
      !category ||
      !amount ||
      !paymentMethod ||
      !invoice
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
        date,
        concept,
        category,
        amount: Number(amount),
        paymentMethod,
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
    filterYearSelect.addEventListener("change", renderExpenses);
  }

  if (filterMonthSelect) {
    filterMonthSelect.addEventListener("change", renderExpenses);
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      if (filterYearSelect) filterYearSelect.value = "";
      if (filterMonthSelect) filterMonthSelect.value = "";
      if (filterCategorySelect) filterCategorySelect.value = "";
      if (filterMethodSelect) filterMethodSelect.value = "";
      renderExpenses();
    });
  }

  if (filterCategorySelect) {
    filterCategorySelect.addEventListener("change", renderExpenses);
  }

  if (filterMethodSelect) {
    filterMethodSelect.addEventListener("change", renderExpenses);
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
    loadYearOptions();
    loadDynamicFilterOptions();
    renderExpenses();
  });

  try {
    applyScopeToUi();
    resetForm();
    applyExpensePrefillFromUrl();
    await refreshExpensesCollection();
    loadYearOptions();
    loadDynamicFilterOptions();
    renderExpenses();
  } finally {
    setPageLoading(false);
  }
});
