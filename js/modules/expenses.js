import { protectPage } from "../services/auth.js";
import {
  deleteExpenseRecord,
  getExpensesCollection,
  saveExpenseRecord,
} from "../services/expenses-service.js";
import {
  askConfirm,
  formatCurrency,
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
  const clearFiltersBtn = document.getElementById("clear-expense-filters");
  const exportExcelBtn = document.getElementById("export-expense-excel");

  let editingExpenseId = null;
  let currentExpenses = [];

  function resetForm() {
    expenseForm.reset();
    editingExpenseId = null;
    submitButton.textContent = "Guardar gasto";
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

  function getFilteredExpenses() {
    let expenses = [...currentExpenses];

    const selectedYear = filterYearSelect ? filterYearSelect.value : "";
    const selectedMonth = filterMonthSelect ? filterMonthSelect.value : "";

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

    return expenses.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }

  function renderExpenses() {
    const expenses = getFilteredExpenses();
    expenseTableBody.replaceChildren();

    if (expenses.length === 0) {
      expenseTableBody.appendChild(
        createEmptyStateRow("No hay gastos registrados.", 8),
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
    const editButtons = document.querySelectorAll(".edit-btn");
    const deleteButtons = document.querySelectorAll(".delete-btn");

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
      renderExpenses();
    });
  }

  if (exportExcelBtn) {
    exportExcelBtn.addEventListener("click", exportFilteredExpensesToExcel);
  }

  window.addEventListener("focus", async () => {
    currentExpenses = await getExpensesCollection();
    loadYearOptions();
    renderExpenses();
  });

  try {
    currentExpenses = await getExpensesCollection();
    loadYearOptions();
    renderExpenses();
  } finally {
    setPageLoading(false);
  }
});
