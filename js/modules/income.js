import { protectPage } from "../services/auth.js";
import { getClientsCollection } from "../services/clients-service.js";
import {
  deleteIncomeRecord,
  getIncomeCollection,
  saveIncomeRecord,
} from "../services/income-service.js";
import {
  askConfirm,
  formatCurrency,
  getTodayISO,
  normalizeText,
  setButtonLoading,
  setPageLoading,
  showToast,
} from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  setPageLoading(true);
  await protectPage();

  console.log("income.js cargado correctamente");

  const incomeForm = document.querySelector("form");
  const incomeTableBody = document.querySelector(".table tbody");
  const submitButton = incomeForm.querySelector(".btn-primary");
  const clientSelect = document.getElementById("income-client");

  const filterYearSelect = document.getElementById("filter-income-year");
  const filterMonthSelect = document.getElementById("filter-income-month");
  const filterClientSelect = document.getElementById("filter-income-client");
  const filterStatusSelect = document.getElementById("filter-income-status");
  const filterMethodSelect = document.getElementById("filter-income-method");
  const clearFiltersBtn = document.getElementById("clear-income-filters");
  const exportExcelBtn = document.getElementById("export-income-excel");
  const incomeCounters = {
    totalBilled: document.getElementById("income-total-billed"),
    totalPaid: document.getElementById("income-total-paid"),
    totalPending: document.getElementById("income-total-pending"),
    periodCount: document.getElementById("income-period-count"),
  };

  let editingIncomeId = null;
  let currentIncomes = [];
  let currentClients = [];

  function createRecordId() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }

    return `inc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function syncPaidAmountWithStatus() {
    const totalAmountInput = document.getElementById("income-amount");
    const paymentStatusSelect = document.getElementById("income-payment-status");
    const paidAmountInput = document.getElementById("income-paid-amount");

    const totalAmount = Number(totalAmountInput.value || 0);
    const paymentStatus = normalizeText(paymentStatusSelect.value);

    if (paymentStatus === "pagado") {
      paidAmountInput.value = totalAmount > 0 ? totalAmount.toFixed(2) : "";
      return;
    }

    if (paymentStatus === "pendiente") {
      paidAmountInput.value = "0";
    }
  }

  function applyIncomeFormDefaults() {
    document.getElementById("income-date").value = getTodayISO();
    document.getElementById("income-payment-status").value = "Pendiente";
    document.getElementById("income-payment-method").value = "Transferencia";
    document.getElementById("income-invoice").value = "no";
    document.getElementById("income-paid-amount").value = "0";
  }

  function applyIncomePreset(preset) {
    const paymentStatusSelect = document.getElementById("income-payment-status");
    const paymentMethodSelect = document.getElementById("income-payment-method");
    const invoiceSelect = document.getElementById("income-invoice");
    const totalAmountInput = document.getElementById("income-amount");
    const paidAmountInput = document.getElementById("income-paid-amount");
    const totalAmount = Number(totalAmountInput.value || 0);

    if (preset === "pending") {
      paymentStatusSelect.value = "Pendiente";
      paymentMethodSelect.value = "Transferencia";
      invoiceSelect.value = "no";
      paidAmountInput.value = "0";
      return;
    }

    if (preset === "partial") {
      paymentStatusSelect.value = "Pago parcial";
      paymentMethodSelect.value = "Transferencia";
      invoiceSelect.value = "no";
      paidAmountInput.value =
        totalAmount > 0 ? Number(totalAmount / 2).toFixed(2) : "";
      return;
    }

    if (preset === "paid") {
      paymentStatusSelect.value = "Pagado";
      paymentMethodSelect.value = "Transferencia";
      invoiceSelect.value = "no";
      paidAmountInput.value = totalAmount > 0 ? totalAmount.toFixed(2) : "";
    }
  }

  function normalizeDuplicateValue(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function getIncomeDuplicateKey(income) {
    if (income.quoteId) {
      return `quote:${normalizeDuplicateValue(income.quoteId)}`;
    }

    return [
      "manual",
      normalizeDuplicateValue(income.client),
      normalizeDuplicateValue(income.date),
      normalizeDuplicateValue(income.concept),
      Number(income.totalAmount || 0).toFixed(2),
      Number(income.paidAmount || 0).toFixed(2),
      normalizeDuplicateValue(income.paymentStatus),
      normalizeDuplicateValue(income.paymentMethod),
      normalizeDuplicateValue(income.invoiceRequired),
    ].join("|");
  }

  function findDuplicateIncomeIds(incomeId) {
    const targetIncome = currentIncomes.find(
      (income) => String(income.id) === String(incomeId),
    );

    if (!targetIncome) return [incomeId];

    const duplicateKey = getIncomeDuplicateKey(targetIncome);
    const duplicatedIncomes = currentIncomes.filter(
      (income) => getIncomeDuplicateKey(income) === duplicateKey,
    );

    return duplicatedIncomes.map((income) => income.id);
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

    const badge = document.createElement("span");
    badge.style.display = "inline-flex";
    badge.style.alignItems = "center";
    badge.style.justifyContent = "center";
    badge.style.padding = "6px 12px";
    badge.style.borderRadius = "999px";
    badge.style.fontSize = "0.85rem";
    badge.style.fontWeight = "700";
    badge.style.background = background;
    badge.style.color = textColor;
    badge.style.minWidth = "110px";
    badge.textContent = label || "-";
    return badge;
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

  async function loadClientOptions() {
    currentClients = await getClientsCollection();

    clientSelect.replaceChildren();

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "Selecciona un cliente";
    clientSelect.appendChild(placeholderOption);

    if (currentClients.length === 0) {
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.disabled = true;
      emptyOption.textContent = "No hay clientes registrados";
      clientSelect.appendChild(emptyOption);
      return;
    }

    currentClients.forEach((client) => {
      const option = document.createElement("option");
      option.value = client.name;
      option.textContent = client.name;
      clientSelect.appendChild(option);
    });
  }

  function loadYearOptions() {
    if (!filterYearSelect) return;

    const years = [
      ...new Set(
        currentIncomes
          .map((income) => (income.date ? income.date.split("-")[0] : ""))
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
        element: filterClientSelect,
        values: currentIncomes.map((income) => income.client),
        label: "Todos",
      },
      {
        element: filterMethodSelect,
        values: currentIncomes.map((income) => income.paymentMethod),
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

  function resetForm() {
    incomeForm.reset();
    editingIncomeId = null;
    submitButton.textContent = "Guardar ingreso";
    applyIncomeFormDefaults();
  }

  function applyIncomePrefillFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const client = params.get("client");
    const concept = params.get("concept");
    const amount = params.get("amount");
    const status = params.get("status");
    const paid = params.get("paid");
    const method = params.get("method");
    const invoice = params.get("invoice");
    const isQuickMode = params.get("quick") === "1";

    if (client) {
      const hasClientOption = [...clientSelect.options].some(
        (option) => option.value === client,
      );
      if (hasClientOption) {
        clientSelect.value = client;
      }
    }

    if (concept) document.getElementById("income-concept").value = concept;
    if (amount) document.getElementById("income-amount").value = amount;
    if (status) document.getElementById("income-payment-status").value = status;
    if (method) {
      document.getElementById("income-payment-method").value = method;
    }
    if (invoice === "yes" || invoice === "no") {
      document.getElementById("income-invoice").value = invoice;
    }
    if (paid) {
      document.getElementById("income-paid-amount").value = paid;
    } else {
      syncPaidAmountWithStatus();
    }

    if (client) {
      showToast(`Cliente preseleccionado: ${client}`, {
        type: "success",
        duration: 2200,
      });
    }

    if (isQuickMode) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.getElementById("income-concept").focus();
    }
  }

  function getFilteredIncomes() {
    let incomes = [...currentIncomes];

    const selectedYear = filterYearSelect ? filterYearSelect.value : "";
    const selectedMonth = filterMonthSelect ? filterMonthSelect.value : "";
    const selectedClient = filterClientSelect ? filterClientSelect.value : "";
    const selectedStatus = filterStatusSelect ? filterStatusSelect.value : "";
    const selectedMethod = filterMethodSelect ? filterMethodSelect.value : "";

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

    if (selectedClient) {
      incomes = incomes.filter(
        (income) => normalizeText(income.client) === normalizeText(selectedClient),
      );
    }

    if (selectedStatus) {
      incomes = incomes.filter(
        (income) =>
          normalizeText(normalizePaymentStatus(income.paymentStatus)) ===
          normalizeText(selectedStatus),
      );
    }

    if (selectedMethod) {
      incomes = incomes.filter(
        (income) =>
          normalizeText(income.paymentMethod) === normalizeText(selectedMethod),
      );
    }

    return incomes.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }

  function updateIncomeCounters(incomes) {
    const totalBilled = incomes.reduce(
      (sum, income) => sum + Number(income.totalAmount || 0),
      0,
    );
    const totalPaid = incomes.reduce(
      (sum, income) => sum + Number(income.paidAmount || 0),
      0,
    );
    const totalPending = incomes.reduce(
      (sum, income) => sum + Number(getPendingAmount(income)),
      0,
    );

    incomeCounters.totalBilled.textContent = formatCurrency(totalBilled);
    incomeCounters.totalPaid.textContent = formatCurrency(totalPaid);
    incomeCounters.totalPending.textContent = formatCurrency(totalPending);
    incomeCounters.periodCount.textContent = String(incomes.length);
  }

  function renderIncomes() {
    const incomes = getFilteredIncomes();
    updateIncomeCounters(incomes);
    incomeTableBody.replaceChildren();

    if (incomes.length === 0) {
      incomeTableBody.appendChild(
        createEmptyStateRow("No hay ingresos registrados.", 10),
      );
      return;
    }

    incomes.forEach((income) => {
      const row = document.createElement("tr");
      const pendingAmount = getPendingAmount(income);
      if (pendingAmount > 0) {
        row.classList.add("income-pending-row");
      }

      row.appendChild(createCell(income.client || "-"));
      row.appendChild(createCell(income.date || "-"));
      row.appendChild(createCell(income.concept || "-"));
      row.appendChild(createCell(formatCurrency(income.totalAmount)));
      row.appendChild(createCell(formatCurrency(income.paidAmount)));
      row.appendChild(createCell(formatCurrency(pendingAmount)));

      const statusCell = document.createElement("td");
      statusCell.appendChild(getPaymentStatusBadge(income.paymentStatus));
      row.appendChild(statusCell);

      row.appendChild(createCell(income.invoiceRequired || "-"));

      const editCell = document.createElement("td");
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "edit-btn";
      editButton.dataset.id = String(income.id);
      editButton.textContent = "Editar";
      editCell.appendChild(editButton);
      row.appendChild(editCell);

      const deleteCell = document.createElement("td");
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-btn";
      deleteButton.dataset.id = String(income.id);
      deleteButton.textContent = "Eliminar";
      deleteCell.appendChild(deleteButton);
      row.appendChild(deleteCell);

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
    const incomeToEdit = currentIncomes.find(
      (income) => String(income.id) === String(incomeId),
    );

    if (!incomeToEdit) return;
    fillForm(incomeToEdit);
  }

  async function handleDelete(incomeId) {
    const incomeIdsToDelete = findDuplicateIncomeIds(incomeId);
    const duplicateCount = incomeIdsToDelete.length;

    const confirmed = await askConfirm({
      title: "Eliminar ingreso",
      message:
        duplicateCount > 1
          ? `Se encontraron ${duplicateCount} ingresos duplicados con los mismos datos. ¿Quieres eliminarlos todos?`
          : "¿Seguro que quieres eliminar este ingreso?",
      confirmText: "Eliminar",
    });
    if (!confirmed) return;

    try {
      await Promise.all(
        incomeIdsToDelete.map((id) => deleteIncomeRecord(String(id))),
      );

      if (
        incomeIdsToDelete.some(
          (id) => String(id) === String(editingIncomeId),
        )
      ) {
        resetForm();
      }

      currentIncomes = currentIncomes.filter(
        (income) =>
          !incomeIdsToDelete.some((id) => String(id) === String(income.id)),
      );
      loadYearOptions();
      loadDynamicFilterOptions();
      renderIncomes();
      showToast(
        duplicateCount > 1
          ? "Ingresos duplicados eliminados correctamente."
          : "Ingreso eliminado correctamente.",
        { type: "success" },
      );
    } catch (error) {
      console.error("No se pudo eliminar el ingreso:", error);
      showToast(
        error?.message ||
          "No se pudo eliminar el ingreso. Revisa permisos o conexión.",
        { type: "error", duration: 5000 },
      );
    }
  }

  function addTableEvents() {
    const editButtons = document.querySelectorAll(".edit-btn");
    const deleteButtons = document.querySelectorAll(".delete-btn");

    editButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const incomeId = button.dataset.id;
        handleEdit(incomeId);
      });
    });

    deleteButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const incomeId = button.dataset.id;
        await handleDelete(incomeId);
      });
    });
  }

  async function exportFilteredIncomesToExcel() {
    const incomes = getFilteredIncomes();

    if (incomes.length === 0) {
      showToast("No hay ingresos en el filtro seleccionado para exportar.", {
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

  incomeForm.addEventListener("submit", async (event) => {
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
      showToast("Por favor, completa todos los campos obligatorios.", {
        type: "error",
      });
      return;
    }

    const existingIncome =
      currentIncomes.find(
        (income) => String(income.id) === String(editingIncomeId),
      ) || {};

    setButtonLoading(
      submitButton,
      true,
      editingIncomeId ? "Actualizando..." : "Guardando...",
    );

    try {
      await saveIncomeRecord({
        ...existingIncome,
        id: editingIncomeId || existingIncome.id || createRecordId(),
        client,
        date,
        concept,
        totalAmount: Number(totalAmount),
        paymentStatus,
        paidAmount: Number(paidAmount),
        paymentMethod,
        invoiceRequired: invoiceRequired === "yes" ? "Sí" : "No",
        notes,
      });

      resetForm();
      currentIncomes = await getIncomeCollection();
      await loadClientOptions();
      loadYearOptions();
      loadDynamicFilterOptions();
      renderIncomes();
      showToast("Ingreso guardado correctamente.", { type: "success" });
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  if (filterYearSelect) {
    filterYearSelect.addEventListener("change", renderIncomes);
  }

  if (filterMonthSelect) {
    filterMonthSelect.addEventListener("change", renderIncomes);
  }

  if (filterClientSelect) {
    filterClientSelect.addEventListener("change", renderIncomes);
  }

  if (filterStatusSelect) {
    filterStatusSelect.addEventListener("change", renderIncomes);
  }

  if (filterMethodSelect) {
    filterMethodSelect.addEventListener("change", renderIncomes);
  }

  document
    .getElementById("income-payment-status")
    .addEventListener("change", syncPaidAmountWithStatus);
  document
    .getElementById("income-amount")
    .addEventListener("input", syncPaidAmountWithStatus);

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      if (filterYearSelect) filterYearSelect.value = "";
      if (filterMonthSelect) filterMonthSelect.value = "";
      if (filterClientSelect) filterClientSelect.value = "";
      if (filterStatusSelect) filterStatusSelect.value = "";
      if (filterMethodSelect) filterMethodSelect.value = "";
      renderIncomes();
    });
  }

  if (exportExcelBtn) {
    exportExcelBtn.addEventListener("click", exportFilteredIncomesToExcel);
  }

  document.querySelectorAll("[data-income-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      applyIncomePreset(button.dataset.incomePreset);
      showToast("Yo apliqué un atajo de captura para este ingreso.", {
        type: "info",
        duration: 2200,
      });
    });
  });

  window.addEventListener("focus", async () => {
    currentClients = await getClientsCollection();
    currentIncomes = await getIncomeCollection();
    await loadClientOptions();
    loadYearOptions();
    loadDynamicFilterOptions();
    renderIncomes();
  });

  try {
    currentIncomes = await getIncomeCollection();
    resetForm();
    await loadClientOptions();
    applyIncomePrefillFromUrl();
    loadYearOptions();
    loadDynamicFilterOptions();
    renderIncomes();
  } finally {
    setPageLoading(false);
  }
});
