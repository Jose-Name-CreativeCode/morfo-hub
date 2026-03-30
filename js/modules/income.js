document.addEventListener("DOMContentLoaded", () => {
  console.log("income.js cargado correctamente");

  const incomeForm = document.querySelector("form");
  const incomeTableBody = document.querySelector(".table tbody");
  const submitButton = incomeForm.querySelector(".btn-primary");
  const clientSelect = document.getElementById("income-client");

  const filterYearSelect = document.getElementById("filter-income-year");
  const filterMonthSelect = document.getElementById("filter-income-month");
  const clearFiltersBtn = document.getElementById("clear-income-filters");
  const exportExcelBtn = document.getElementById("export-income-excel");

  const STORAGE_KEY = "morfo_income";
  const CLIENTS_KEY = "morfo_clients";

  let editingIncomeId = null;

  function getIncomes() {
    const incomes = localStorage.getItem(STORAGE_KEY);
    return incomes ? JSON.parse(incomes) : [];
  }

  function saveIncomes(incomes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(incomes));
  }

  function getClients() {
    const clients = localStorage.getItem(CLIENTS_KEY);
    return clients ? JSON.parse(clients) : [];
  }

  function formatCurrency(amount) {
    return Number(amount || 0).toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
    });
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function normalizePaymentStatus(status) {
    const normalized = normalizeText(status);

    if (normalized === "parcial" || normalized === "pago parcial") {
      return "Pago parcial";
    }

    if (normalized === "pagado" || normalized === "pagada total") {
      return "Pagado";
    }

    if (
      normalized === "pendiente" ||
      normalized === "no pagada" ||
      normalized === "no_pagada"
    ) {
      return "Pendiente";
    }

    return status || "";
  }

  function getPendingAmount(income) {
    const total = Number(income.totalAmount || 0);
    const paid = Number(income.paidAmount || 0);
    return Math.max(total - paid, 0);
  }

  function getPaymentStatusBadge(status) {
    const label = normalizePaymentStatus(status);
    const normalized = normalizeText(label);

    let background = "#fee2e2";
    let textColor = "#991b1b";

    if (normalized === "pagado") {
      background = "#dcfce7";
      textColor = "#166534";
    } else if (normalized === "pago parcial" || normalized === "parcial") {
      background = "#fef3c7";
      textColor = "#92400e";
    } else if (normalized === "pendiente") {
      background = "#fee2e2";
      textColor = "#991b1b";
    }

    return `
      <span
        style="
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 0.85rem;
          font-weight: 700;
          background: ${background};
          color: ${textColor};
          min-width: 110px;
        "
      >
        ${label || "-"}
      </span>
    `;
  }

  function loadClientOptions() {
    const clients = getClients();

    clientSelect.innerHTML = `<option value="">Selecciona un cliente</option>`;

    if (clients.length === 0) {
      clientSelect.innerHTML += `<option value="" disabled>No hay clientes registrados</option>`;
      return;
    }

    clients.forEach((client) => {
      const option = document.createElement("option");
      option.value = client.name;
      option.textContent = client.name;
      clientSelect.appendChild(option);
    });
  }

  function loadYearOptions() {
    if (!filterYearSelect) return;

    const incomes = getIncomes();
    const years = [
      ...new Set(
        incomes
          .map((income) => (income.date ? income.date.split("-")[0] : ""))
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

  function resetForm() {
    incomeForm.reset();
    editingIncomeId = null;
    submitButton.textContent = "Guardar ingreso";
  }

  function getFilteredIncomes() {
    let incomes = getIncomes();

    const selectedYear = filterYearSelect ? filterYearSelect.value : "";
    const selectedMonth = filterMonthSelect ? filterMonthSelect.value : "";

    if (selectedYear) {
      incomes = incomes.filter(
        (income) => income.date && income.date.startsWith(`${selectedYear}-`),
      );
    }

    if (selectedMonth) {
      incomes = incomes.filter((income) => {
        if (!income.date) return false;
        const parts = income.date.split("-");
        return parts[1] === selectedMonth;
      });
    }

    return incomes.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }

  function renderIncomes() {
    const incomes = getFilteredIncomes();
    incomeTableBody.innerHTML = "";

    if (incomes.length === 0) {
      incomeTableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center;">No hay ingresos registrados.</td>
        </tr>
      `;
      return;
    }

    incomes.forEach((income) => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${income.client || "-"}</td>
        <td>${income.date || "-"}</td>
        <td>${income.concept || "-"}</td>
        <td>${formatCurrency(income.totalAmount)}</td>
        <td>${formatCurrency(income.paidAmount)}</td>
        <td>${getPaymentStatusBadge(income.paymentStatus)}</td>
        <td>${income.invoiceRequired || "-"}</td>
        <td>
          <button type="button" class="edit-btn" data-id="${income.id}">Editar</button>
        </td>
        <td>
          <button type="button" class="delete-btn" data-id="${income.id}">Eliminar</button>
        </td>
      `;

      incomeTableBody.appendChild(row);
    });

    addTableEvents();
  }

  function fillForm(income) {
    document.getElementById("income-client").value = income.client || "";
    document.getElementById("income-date").value = income.date || "";
    document.getElementById("income-concept").value = income.concept || "";
    document.getElementById("income-amount").value = income.totalAmount || 0;
    document.getElementById("income-payment-status").value =
      normalizePaymentStatus(income.paymentStatus);
    document.getElementById("income-paid-amount").value =
      income.paidAmount || 0;
    document.getElementById("income-payment-method").value =
      income.paymentMethod || "";
    document.getElementById("income-invoice").value =
      income.invoiceRequired === "Sí" ? "yes" : "no";
    document.getElementById("income-notes").value = income.notes || "";

    editingIncomeId = income.id;
    submitButton.textContent = "Actualizar ingreso";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEdit(incomeId) {
    const incomes = getIncomes();
    const incomeToEdit = incomes.find((income) => income.id === incomeId);

    if (!incomeToEdit) return;
    fillForm(incomeToEdit);
  }

  function handleDelete(incomeId) {
    const confirmed = confirm("¿Seguro que quieres eliminar este ingreso?");
    if (!confirmed) return;

    let incomes = getIncomes();
    incomes = incomes.filter((income) => income.id !== incomeId);
    saveIncomes(incomes);

    if (editingIncomeId === incomeId) {
      resetForm();
    }

    loadYearOptions();
    renderIncomes();
  }

  function addTableEvents() {
    const editButtons = document.querySelectorAll(".edit-btn");
    const deleteButtons = document.querySelectorAll(".delete-btn");

    editButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const incomeId = Number(button.dataset.id);
        handleEdit(incomeId);
      });
    });

    deleteButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const incomeId = Number(button.dataset.id);
        handleDelete(incomeId);
      });
    });
  }

  async function exportFilteredIncomesToExcel() {
    const incomes = getFilteredIncomes();

    if (incomes.length === 0) {
      alert("No hay ingresos en el filtro seleccionado para exportar.");
      return;
    }

    if (typeof ExcelJS === "undefined" || typeof saveAs === "undefined") {
      alert("No se cargaron las librerías para exportar el Excel.");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Ingresos", {
      views: [{ state: "frozen", ySplit: 4 }],
    });

    const year = filterYearSelect?.value || "Todos";
    const month = filterMonthSelect?.value || "Todos";

    const totalMonto = incomes.reduce(
      (sum, income) => sum + Number(income.totalAmount || 0),
      0,
    );

    const totalPagado = incomes.reduce(
      (sum, income) => sum + Number(income.paidAmount || 0),
      0,
    );

    const totalSaldo = incomes.reduce(
      (sum, income) => sum + Number(getPendingAmount(income)),
      0,
    );

    worksheet.mergeCells("A1:J1");
    worksheet.getCell("A1").value = "REPORTE DE INGRESOS";
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
      fgColor: { argb: "FF4F7CC4" },
    };
    worksheet.getRow(1).height = 28;

    worksheet.mergeCells("A2:J2");
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
      fgColor: { argb: "FFEFF6FF" },
    };

    const headers = [
      "Cliente",
      "Fecha",
      "Concepto",
      "Monto total",
      "Pagado",
      "Saldo",
      "Estatus",
      "Factura",
      "Método de pago",
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
        fgColor: { argb: "FF5678A6" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };
    });

    incomes.forEach((income) => {
      const saldo = getPendingAmount(income);

      const row = worksheet.addRow([
        income.client || "-",
        income.date || "-",
        income.concept || "-",
        Number(income.totalAmount || 0),
        Number(income.paidAmount || 0),
        Number(saldo || 0),
        normalizePaymentStatus(income.paymentStatus) || "-",
        income.invoiceRequired || "-",
        income.paymentMethod || "-",
        income.notes || "",
      ]);

      row.eachCell((cell, colNumber) => {
        cell.alignment = {
          vertical: "middle",
          wrapText: true,
          horizontal: colNumber >= 4 && colNumber <= 6 ? "right" : "left",
        };

        cell.border = {
          top: { style: "thin", color: { argb: "FFE2E8F0" } },
          left: { style: "thin", color: { argb: "FFE2E8F0" } },
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });

      row.getCell(4).numFmt = "$#,##0.00";
      row.getCell(5).numFmt = "$#,##0.00";
      row.getCell(6).numFmt = "$#,##0.00";

      const statusCell = row.getCell(7);
      const statusText = normalizeText(statusCell.value);

      if (statusText.includes("pagado")) {
        statusCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFD1FAE5" },
        };
      } else if (statusText.includes("parcial")) {
        statusCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEF3C7" },
        };
      } else {
        statusCell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEE2E2" },
        };
      }
    });

    worksheet.addRow([]);

    const totalRow = worksheet.addRow([
      "",
      "",
      "TOTALES",
      totalMonto,
      totalPagado,
      totalSaldo,
      "",
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
        fgColor: { argb: "FFD9EAF7" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FF94A3B8" } },
        left: { style: "thin", color: { argb: "FF94A3B8" } },
        bottom: { style: "thin", color: { argb: "FF94A3B8" } },
        right: { style: "thin", color: { argb: "FF94A3B8" } },
      };
    });

    totalRow.getCell(4).numFmt = "$#,##0.00";
    totalRow.getCell(5).numFmt = "$#,##0.00";
    totalRow.getCell(6).numFmt = "$#,##0.00";

    worksheet.columns = [
      { width: 22 },
      { width: 14 },
      { width: 30 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 12 },
      { width: 18 },
      { width: 40 },
    ];

    worksheet.autoFilter = {
      from: "A4",
      to: "J4",
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `ingresos_${year}_${month}.xlsx`;

    saveAs(
      new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      fileName,
    );
  }

  incomeForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const client = document.getElementById("income-client").value;
    const date = document.getElementById("income-date").value;
    const concept = document.getElementById("income-concept").value.trim();
    const totalAmount = document.getElementById("income-amount").value;
    const paymentStatus = document.getElementById(
      "income-payment-status",
    ).value;
    const paidAmount = document.getElementById("income-paid-amount").value || 0;
    const paymentMethod = document.getElementById(
      "income-payment-method",
    ).value;
    const invoiceRequired = document.getElementById("income-invoice").value;
    const notes = document.getElementById("income-notes").value.trim();

    if (
      !client ||
      !date ||
      !concept ||
      !totalAmount ||
      !paymentStatus ||
      !paymentMethod ||
      !invoiceRequired
    ) {
      alert("Por favor, completa todos los campos obligatorios.");
      return;
    }

    const incomes = getIncomes();

    if (editingIncomeId) {
      const updatedIncomes = incomes.map((income) =>
        income.id === editingIncomeId
          ? {
              ...income,
              client,
              date,
              concept,
              totalAmount: Number(totalAmount),
              paymentStatus,
              paidAmount: Number(paidAmount),
              paymentMethod,
              invoiceRequired: invoiceRequired === "yes" ? "Sí" : "No",
              notes,
            }
          : income,
      );

      saveIncomes(updatedIncomes);
    } else {
      const newIncome = {
        id: Date.now(),
        client,
        date,
        concept,
        totalAmount: Number(totalAmount),
        paymentStatus,
        paidAmount: Number(paidAmount),
        paymentMethod,
        invoiceRequired: invoiceRequired === "yes" ? "Sí" : "No",
        notes,
      };

      incomes.push(newIncome);
      saveIncomes(incomes);
    }

    resetForm();
    loadClientOptions();
    loadYearOptions();
    renderIncomes();
  });

  if (filterYearSelect) {
    filterYearSelect.addEventListener("change", renderIncomes);
  }

  if (filterMonthSelect) {
    filterMonthSelect.addEventListener("change", renderIncomes);
  }

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      if (filterYearSelect) filterYearSelect.value = "";
      if (filterMonthSelect) filterMonthSelect.value = "";
      renderIncomes();
    });
  }

  if (exportExcelBtn) {
    exportExcelBtn.addEventListener("click", exportFilteredIncomesToExcel);
  }

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      loadYearOptions();
      renderIncomes();
    }

    if (event.key === CLIENTS_KEY) {
      loadClientOptions();
    }
  });

  window.addEventListener("focus", () => {
    loadClientOptions();
    loadYearOptions();
    renderIncomes();
  });

  loadClientOptions();
  loadYearOptions();
  renderIncomes();
});
