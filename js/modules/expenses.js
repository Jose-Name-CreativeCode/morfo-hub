import { protectPage } from "../services/auth.js";
import {
  deleteExpenseRecord,
  getExpensesCollection,
  saveExpenseRecord,
} from "../services/expenses-service.js";
import {
  askConfirm,
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

  function applyExpenseFormDefaults() {
    document.getElementById("expense-date").value = getTodayISO();
    document.getElementById("expense-payment-method").value = "Tarjeta";
    document.getElementById("expense-invoice").value = "no";
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

  function createCell(text) {
    const cell = document.createElement("td");
    cell.textContent = text;
    return cell;
  }

  function createEmptyStateRow(message, columns) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = columns;
    cell.style.textAlign = "center";
    cell.textContent = message;
    row.appendChild(cell);
    return row;
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
        createEmptyStateRow("No hay gastos registrados.", 9),
      );
      return;
    }

    expenses.forEach((expense) => {
      const row = document.createElement("tr");
      row.appendChild(createCell(expense.date || "-"));
      row.appendChild(createCell(expense.concept || "-"));
      row.appendChild(createCell(expense.category || "-"));
      row.appendChild(createCell(formatCurrency(expense.amount)));
      row.appendChild(createCell(expense.paymentMethod || "-"));
      row.appendChild(createCell(expense.invoice || "-"));

      const detailCell = document.createElement("td");
      const detailButton = document.createElement("button");
      detailButton.type = "button";
      detailButton.className = "pdf-btn expense-detail-btn";
      detailButton.dataset.id = String(expense.id);
      detailButton.textContent = "Ver";
      detailCell.appendChild(detailButton);
      row.appendChild(detailCell);

      const editCell = document.createElement("td");
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "edit-btn";
      editButton.dataset.id = String(expense.id);
      editButton.textContent = "Editar";
      editCell.appendChild(editButton);
      row.appendChild(editCell);

      const deleteCell = document.createElement("td");
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-btn";
      deleteButton.dataset.id = String(expense.id);
      deleteButton.textContent = "Eliminar";
      deleteCell.appendChild(deleteButton);
      row.appendChild(deleteCell);

      expenseTableBody.appendChild(row);
    });

    addTableEvents();
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

  function addTableEvents() {
    const detailButtons = document.querySelectorAll(".expense-detail-btn");
    const editButtons = document.querySelectorAll(".edit-btn");
    const deleteButtons = document.querySelectorAll(".delete-btn");

    detailButtons.forEach((button) => {
      button.addEventListener("click", () => {
        openExpenseDetail(button.dataset.id);
      });
    });

    editButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const expenseId = button.dataset.id;
        handleEdit(expenseId);
      });
    });

    deleteButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const expenseId = button.dataset.id;
        await handleDelete(expenseId);
      });
    });
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
        id: editingExpenseId,
        date,
        concept,
        category,
        amount: Number(amount),
        paymentMethod,
        invoice: invoice === "yes" ? "Sí" : "No",
        notes,
      });

      if (editingExpenseId) {
        currentExpenses = currentExpenses.map((expense) =>
          String(expense.id) === String(editingExpenseId)
            ? savedExpense
            : expense,
        );
      } else {
        currentExpenses = [savedExpense, ...currentExpenses];
      }

      resetForm();
      loadYearOptions();
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

  detailCloseButton.addEventListener("click", closeExpenseDetail);
  detailOverlay.addEventListener("click", closeExpenseDetail);

  window.addEventListener("focus", async () => {
    currentExpenses = await getExpensesCollection();
    loadYearOptions();
    loadDynamicFilterOptions();
    renderExpenses();
  });

  try {
    resetForm();
    applyExpensePrefillFromUrl();
    currentExpenses = await getExpensesCollection();
    loadYearOptions();
    loadDynamicFilterOptions();
    renderExpenses();
  } finally {
    setPageLoading(false);
  }
});
