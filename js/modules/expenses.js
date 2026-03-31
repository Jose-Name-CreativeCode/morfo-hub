import { protectPage } from "../services/auth.js";
import { STORAGE_KEYS, getData, saveData } from "../services/storage.js";
import { formatCurrency } from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  await protectPage();

  const expenseForm = document.querySelector("form");
  const expenseTableBody = document.querySelector(".table tbody");
  const submitButton = expenseForm.querySelector(".btn-primary");

  const filterYearSelect = document.getElementById("filter-expense-year");
  const filterMonthSelect = document.getElementById("filter-expense-month");
  const clearFiltersBtn = document.getElementById("clear-expense-filters");
  const exportExcelBtn = document.getElementById("export-expense-excel");

  const STORAGE_KEY = STORAGE_KEYS.EXPENSES;
  let editingExpenseId = null;

  function getExpenses() {
    return getData(STORAGE_KEY, []);
  }

  function saveExpenses(expenses) {
    saveData(STORAGE_KEY, expenses);
  }

  function resetForm() {
    expenseForm.reset();
    editingExpenseId = null;
    submitButton.textContent = "Guardar gasto";
  }

  function loadYearOptions() {
    if (!filterYearSelect) return;

    const expenses = getExpenses();
    const years = [
      ...new Set(
        expenses
          .map((expense) => (expense.date ? expense.date.split("-")[0] : ""))
          .filter(Boolean),
      ),
    ].sort((a, b) => Number(b) - Number(a));

    const currentValue = filterYearSelect.value;

    filterYearSelect.innerHTML = `<option value="">Todos</option>`;

    years.forEach((year) => {
      const option = document.createElement("option");
      option.value = year;
      option.textContent = year;
      filterYearSelect.appendChild(option);
    });

    filterYearSelect.value = years.includes(currentValue) ? currentValue : "";
  }

  function getFilteredExpenses() {
    let expenses = getExpenses();

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
    expenseTableBody.innerHTML = "";

    if (expenses.length === 0) {
      expenseTableBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center;">No hay gastos registrados.</td>
        </tr>
      `;
      return;
    }

    expenses.forEach((expense) => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${expense.date || "-"}</td>
        <td>${expense.concept || "-"}</td>
        <td>${expense.category || "-"}</td>
        <td>${formatCurrency(expense.amount)}</td>
        <td>${expense.paymentMethod || "-"}</td>
        <td>${expense.invoice || "-"}</td>
        <td>
          <button type="button" class="edit-btn" data-id="${expense.id}">Editar</button>
        </td>
        <td>
          <button type="button" class="delete-btn" data-id="${expense.id}">Eliminar</button>
        </td>
      `;

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
    const expenses = getExpenses();
    const expenseToEdit = expenses.find((expense) => expense.id === expenseId);

    if (!expenseToEdit) return;
    fillForm(expenseToEdit);
  }

  function handleDelete(expenseId) {
    const confirmed = confirm("¿Seguro que quieres eliminar este gasto?");
    if (!confirmed) return;

    let expenses = getExpenses();
    expenses = expenses.filter((expense) => expense.id !== expenseId);
    saveExpenses(expenses);

    if (editingExpenseId === expenseId) {
      resetForm();
    }

    loadYearOptions();
    renderExpenses();
  }

  function addTableEvents() {
    const editButtons = document.querySelectorAll(".edit-btn");
    const deleteButtons = document.querySelectorAll(".delete-btn");

    editButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const expenseId = Number(button.dataset.id);
        handleEdit(expenseId);
      });
    });

    deleteButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const expenseId = Number(button.dataset.id);
        handleDelete(expenseId);
      });
    });
  }

  async function exportFilteredExpensesToExcel() {
    const expenses = getFilteredExpenses();

    if (expenses.length === 0) {
      alert("No hay gastos en el filtro seleccionado para exportar.");
      return;
    }

    if (typeof ExcelJS === "undefined" || typeof saveAs === "undefined") {
      alert("No se cargaron las librerías para exportar el Excel.");
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

  expenseForm.addEventListener("submit", (event) => {
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
      alert("Por favor, completa todos los campos obligatorios.");
      return;
    }

    const expenses = getExpenses();

    if (editingExpenseId) {
      const updatedExpenses = expenses.map((expense) =>
        expense.id === editingExpenseId
          ? {
              ...expense,
              date,
              concept,
              category,
              amount: Number(amount),
              paymentMethod,
              invoice: invoice === "yes" ? "Sí" : "No",
              notes,
            }
          : expense,
      );

      saveExpenses(updatedExpenses);
    } else {
      const newExpense = {
        id: Date.now(),
        date,
        concept,
        category,
        amount: Number(amount),
        paymentMethod,
        invoice: invoice === "yes" ? "Sí" : "No",
        notes,
      };

      expenses.push(newExpense);
      saveExpenses(expenses);
    }

    renderExpenses();
    resetForm();
    loadYearOptions();
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

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      loadYearOptions();
      renderExpenses();
    }
  });

  window.addEventListener("focus", () => {
    loadYearOptions();
    renderExpenses();
  });

  loadYearOptions();
  renderExpenses();
});
