import { protectPage } from "../services/auth.js";
import { getClientsCollection } from "../services/clients-service.js";
import { getExpensesCollection } from "../services/expenses-service.js";
import { getIncomeCollection } from "../services/income-service.js";
import { getQuotesCollection } from "../services/quotes-service.js";
import { getRuntimeStatus } from "../services/runtime-status.js";
import {
  formatCurrency,
  formatDate,
  normalizeText,
  setPageLoading,
  showToast,
} from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  setPageLoading(true);
  await protectPage();

  const reportForm = document.querySelector("form");
  const exportPdfBtn = document.getElementById("exportReportPdfBtn");
  const reportClientSelect = document.getElementById("report-client");
  const reportServiceSelect = document.getElementById("report-service");
  const reportPaymentStatusSelect = document.getElementById(
    "report-payment-status",
  );

  const cards = document.querySelectorAll(".card-value");
  const incomeCard = cards[0];
  const expenseCard = cards[1];
  const utilityCard = cards[2];
  const pendingCard = cards[3];
  const quotesCard = cards[4];
  const tableBody = document.querySelector(".table tbody");
  const runtimeModeValue = document.getElementById("reportsRuntimeModeValue");
  const runtimeModeNote = document.getElementById("reportsRuntimeModeNote");
  const runtimeApiValue = document.getElementById("reportsRuntimeApiValue");
  const runtimeApiNote = document.getElementById("reportsRuntimeApiNote");
  const runtimeDbValue = document.getElementById("reportsRuntimeDbValue");
  const runtimeDbNote = document.getElementById("reportsRuntimeDbNote");
  const reportApprovedQuotesCount = document.getElementById(
    "reportApprovedQuotesCount",
  );
  const reportPendingItemsCount = document.getElementById(
    "reportPendingItemsCount",
  );
  const reportTopClientName = document.getElementById("reportTopClientName");
  const reportTopClientsBody = document.getElementById("reportTopClientsBody");

  let currentReportState = {
    month: "",
    year: "",
    reportType: "general",
    client: "",
    serviceType: "",
    paymentStatus: "",
    incomes: [],
    expenses: [],
    quotes: [],
    clients: [],
    totalIncome: 0,
    totalExpenses: 0,
    estimatedUtility: 0,
    pendingAmount: 0,
    selectedRows: [],
  };

  function normalizeReportType(value) {
    const normalized = normalizeText(value);

    if (
      normalized === "income" ||
      normalized === "ingreso" ||
      normalized === "ingresos"
    ) {
      return "income";
    }

    if (
      normalized === "expenses" ||
      normalized === "gasto" ||
      normalized === "gastos"
    ) {
      return "expenses";
    }

    if (
      normalized === "clients" ||
      normalized === "cliente" ||
      normalized === "clientes"
    ) {
      return "clients";
    }

    if (
      normalized === "quotes" ||
      normalized === "cotizacion" ||
      normalized === "cotizaciones"
    ) {
      return "quotes";
    }

    return "general";
  }

  function safeDateValue(value) {
    if (!value || value === "-") return 0;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function sortRowsByDateDesc(rows) {
    return [...rows].sort(
      (a, b) => safeDateValue(b.date) - safeDateValue(a.date),
    );
  }

  function getFilteredMonthYear(items, dateField, month, year) {
    return items.filter((item) => {
      if (!item[dateField]) return false;

      const itemDate = new Date(item[dateField]);
      if (Number.isNaN(itemDate.getTime())) return false;

      const itemMonth = String(itemDate.getMonth() + 1).padStart(2, "0");
      const itemYear = String(itemDate.getFullYear());

      const matchesMonth = month ? itemMonth === month : true;
      const matchesYear = year ? itemYear === year : true;

      return matchesMonth && matchesYear;
    });
  }

  function fillSelectOptions(select, values, placeholder) {
    if (!select) return;

    const currentValue = select.value;
    const uniqueValues = [...new Set(values.filter(Boolean))].sort((a, b) =>
      String(a).localeCompare(String(b), "es-MX"),
    );

    select.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = placeholder;
    select.appendChild(allOption);

    uniqueValues.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    });

    select.value = uniqueValues.includes(currentValue) ? currentValue : "";
  }

  function loadReportFilterOptions({ incomes, quotes, clients }) {
    fillSelectOptions(
      reportClientSelect,
      [
        ...clients.map((client) => client.name),
        ...incomes.map((income) => income.client),
        ...quotes.map((quote) => quote.client),
      ],
      "Todos los clientes",
    );

    fillSelectOptions(
      reportServiceSelect,
      quotes.map((quote) => quote.serviceType),
      "Todos los servicios",
    );
  }

  function getIncomeAmount(item) {
    const paidAmount = Number(item.paidAmount || 0);
    const totalAmount = Number(item.totalAmount || 0);
    const baseAmount = Number(item.amount || 0);

    if (paidAmount > 0) {
      return paidAmount;
    }

    if (totalAmount > 0 && paidAmount === 0) {
      return 0;
    }

    return baseAmount;
  }

  function getIncomePendingAmount(item) {
    const explicitRemaining = Number(item.remainingAmount);
    if (Number.isFinite(explicitRemaining) && explicitRemaining > 0) {
      return explicitRemaining;
    }

    const totalAmount = Number(item.totalAmount || 0);
    const paidAmount = Number(item.paidAmount || 0);

    if (totalAmount <= 0) return 0;

    return Math.max(totalAmount - paidAmount, 0);
  }

  function shouldCountIncomeAsReceivable(item) {
    const paymentStatus = normalizeText(item.paymentStatus);
    const pendingAmount = getIncomePendingAmount(item);

    if (pendingAmount <= 0) return false;

    return (
      paymentStatus === "parcial" ||
      paymentStatus === "pago parcial" ||
      paymentStatus === "anticipo pagado" ||
      paymentStatus === "pendiente" ||
      paymentStatus === "no pagada" ||
      paymentStatus === "no_pagada"
    );
  }

  function getExpenseAmount(item) {
    return Number(item.amount || item.totalAmount || 0);
  }

  function getQuoteTotal(item) {
    return Number(item.total || item.totalAmount || item.amount || 0);
  }

  function getQuotePaidAmount(item) {
    const quoteTotalPaid = Number(item.totalPaid || 0);
    if (quoteTotalPaid > 0) return quoteTotalPaid;

    const explicitPaid = Number(item.paidAmount || 0);
    const partialPaid = Number(
      item.partialPayment?.amount ||
        item.partialPaymentAmount ||
        item.depositAmount ||
        item.advanceAmount ||
        0,
    );

    if (explicitPaid > 0) return explicitPaid;
    if (partialPaid > 0) return partialPaid;

    const paymentStatus = normalizeText(
      item.paymentStatus || item.payment_state,
    );

    if (
      paymentStatus === "pagada total" ||
      paymentStatus === "pagada_total" ||
      paymentStatus === "paid"
    ) {
      return getQuoteTotal(item);
    }

    return 0;
  }

  function getQuotePendingAmount(item) {
    const explicitRemaining = Number(item.remainingAmount);
    if (Number.isFinite(explicitRemaining) && explicitRemaining >= 0) {
      return explicitRemaining;
    }

    const total = getQuoteTotal(item);
    const paid = getQuotePaidAmount(item);
    return Math.max(total - paid, 0);
  }

  function getLinkedIncomeForQuote(quote, incomes) {
    return incomes.find((income) => {
      const quoteIdMatches =
        income.quoteId &&
        quote.id &&
        String(income.quoteId) === String(quote.id);
      const quotePublicIdMatches =
        income.quotePublicId &&
        quote.publicId &&
        String(income.quotePublicId) === String(quote.publicId);
      const linkedIncomeMatches =
        quote.linkedIncomeId &&
        income.publicId &&
        String(quote.linkedIncomeId) === String(income.publicId);

      return quoteIdMatches || quotePublicIdMatches || linkedIncomeMatches;
    });
  }

  function hasLinkedIncomeForQuote(quote, incomes) {
    return Boolean(getLinkedIncomeForQuote(quote, incomes));
  }

  function shouldCountQuoteAsReceivable(item) {
    const status = normalizeText(item.status);
    const paymentStatus = normalizeText(
      item.paymentStatus || item.payment_state,
    );

    const validStatus =
      status === "aprobada" ||
      status === "enviada" ||
      status === "approved" ||
      status === "sent";

    const unpaidStatus =
      paymentStatus === "no pagada" ||
      paymentStatus === "no_pagada" ||
      paymentStatus === "anticipo pagado" ||
      paymentStatus === "anticipo_pagado" ||
      paymentStatus === "parcial" ||
      paymentStatus === "partial" ||
      paymentStatus === "";

    return validStatus && unpaidStatus;
  }

  function getIncomeStatusLabel(item) {
    const total = Number(item.totalAmount || 0);
    const paid = Number(item.paidAmount || 0);
    const amount = Number(item.amount || 0);

    if (total === 0 && amount > 0) {
      return "Pagado";
    }

    if (paid <= 0) return "Pendiente";
    if (paid < total) return "Parcial";
    return "Pagado";
  }

  function getQuotePaymentLabel(item) {
    const paymentStatus = normalizeText(
      item.paymentStatus || item.payment_state,
    );

    if (paymentStatus === "pagada total" || paymentStatus === "pagada_total") {
      return "Pagada total";
    }

    if (
      paymentStatus === "anticipo pagado" ||
      paymentStatus === "anticipo_pagado" ||
      paymentStatus === "parcial" ||
      paymentStatus === "partial"
    ) {
      return "Anticipo / Parcial";
    }

    return "Pendiente";
  }

  function getPaymentFilterKeyFromIncome(item) {
    const status = normalizeText(getIncomeStatusLabel(item));

    if (status === "pagado") return "pagado";
    if (status === "parcial" || status === "pago parcial") return "parcial";
    return "pendiente";
  }

  function getPaymentFilterKeyFromQuote(item) {
    const paymentStatus = normalizeText(
      item.paymentStatus || item.payment_state,
    );

    if (paymentStatus === "pagada total" || paymentStatus === "pagada_total") {
      return "pagado";
    }

    if (
      paymentStatus === "anticipo pagado" ||
      paymentStatus === "anticipo_pagado" ||
      paymentStatus === "parcial" ||
      paymentStatus === "partial"
    ) {
      return "parcial";
    }

    return "pendiente";
  }

  function applyAdvancedFilters({
    incomes,
    expenses,
    quotes,
    clients,
    client,
    serviceType,
    paymentStatus,
  }) {
    const normalizedClient = normalizeText(client);
    const normalizedService = normalizeText(serviceType);
    const normalizedPayment = normalizeText(paymentStatus);

    let filteredIncomes = incomes;
    let filteredExpenses = expenses;
    let filteredQuotes = quotes;
    let filteredClients = clients;

    if (normalizedClient) {
      filteredIncomes = filteredIncomes.filter(
        (income) => normalizeText(income.client) === normalizedClient,
      );
      filteredQuotes = filteredQuotes.filter(
        (quote) => normalizeText(quote.client) === normalizedClient,
      );
      filteredClients = filteredClients.filter(
        (item) => normalizeText(item.name) === normalizedClient,
      );
      filteredExpenses = [];
    }

    if (normalizedService) {
      filteredQuotes = filteredQuotes.filter(
        (quote) => normalizeText(quote.serviceType) === normalizedService,
      );
      filteredIncomes = filteredIncomes.filter((income) =>
        filteredQuotes.some((quote) => {
          const quoteIdMatches =
            income.quoteId &&
            quote.id &&
            String(income.quoteId) === String(quote.id);
          const quotePublicIdMatches =
            income.quotePublicId &&
            quote.publicId &&
            String(income.quotePublicId) === String(quote.publicId);

          return quoteIdMatches || quotePublicIdMatches;
        }),
      );
      filteredExpenses = [];
      filteredClients = [];
    }

    if (normalizedPayment) {
      filteredIncomes = filteredIncomes.filter(
        (income) => getPaymentFilterKeyFromIncome(income) === normalizedPayment,
      );
      filteredQuotes = filteredQuotes.filter(
        (quote) => getPaymentFilterKeyFromQuote(quote) === normalizedPayment,
      );
      filteredExpenses = [];
      filteredClients = [];
    }

    return {
      incomes: filteredIncomes,
      expenses: filteredExpenses,
      quotes: filteredQuotes,
      clients: filteredClients,
    };
  }

  function createCell(text) {
    const cell = document.createElement("td");
    cell.textContent = text;
    return cell;
  }

  function setRuntimeField(element, value, tone = "") {
    if (!element) return;

    element.textContent = value;
    element.classList.remove("is-success", "is-warning", "is-danger");

    if (tone) {
      element.classList.add(tone);
    }
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

  function renderRuntimeStatus(runtime) {
    setRuntimeField(runtimeModeValue, runtime.modeValue, runtime.modeTone);
    if (runtimeModeNote) runtimeModeNote.textContent = runtime.modeNote;
    setRuntimeField(runtimeApiValue, runtime.apiValue, runtime.apiTone);
    if (runtimeApiNote) runtimeApiNote.textContent = runtime.apiNote;
    setRuntimeField(runtimeDbValue, runtime.dbValue, runtime.dbTone);
    if (runtimeDbNote) runtimeDbNote.textContent = runtime.dbNote;
  }

  function getTopClientsByIncome(incomes) {
    const totals = new Map();

    incomes
      .filter((income) => getIncomeAmount(income) > 0)
      .forEach((income) => {
        const client = String(
          income.client || income.clientName || "Sin cliente",
        ).trim();

        totals.set(
          client,
          Number(totals.get(client) || 0) + getIncomeAmount(income),
        );
      });

    return [...totals.entries()]
      .map(([client, total]) => ({ client, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }

  function renderReportInsights({ reportQuotes, reportIncomes }) {
    const approvedQuotes = reportQuotes.filter((quote) => {
      const status = normalizeText(quote.status);
      return status === "aprobada" || status === "approved";
    }).length;

    const pendingItems =
      reportIncomes.filter((item) => shouldCountIncomeAsReceivable(item))
        .length +
      reportQuotes.filter((item) => shouldCountQuoteAsReceivable(item)).length;

    const topClients = getTopClientsByIncome(reportIncomes);
    const topClient = topClients[0]?.client || "-";

    if (reportApprovedQuotesCount) {
      reportApprovedQuotesCount.textContent = String(approvedQuotes);
    }

    if (reportPendingItemsCount) {
      reportPendingItemsCount.textContent = String(pendingItems);
    }

    if (reportTopClientName) {
      reportTopClientName.textContent = topClient;
    }

    if (!reportTopClientsBody) return;

    reportTopClientsBody.replaceChildren();

    if (!topClients.length) {
      reportTopClientsBody.appendChild(
        createEmptyStateRow("No hay clientes con cobros en este filtro.", 2),
      );
      return;
    }

    topClients.forEach((item) => {
      const row = document.createElement("tr");
      row.appendChild(createCell(item.client));
      row.appendChild(createCell(formatCurrency(item.total)));
      reportTopClientsBody.appendChild(row);
    });
  }

  function renderTableRows(data) {
    tableBody.replaceChildren();

    if (!data || data.length === 0) {
      tableBody.appendChild(
        createEmptyStateRow("No hay datos para este filtro.", 5),
      );
      return;
    }

    data.forEach((item) => {
      const row = document.createElement("tr");
      row.appendChild(createCell(item.concept || "-"));
      row.appendChild(createCell(item.category || "-"));
      row.appendChild(createCell(item.date || "-"));
      row.appendChild(createCell(item.amount || "-"));
      row.appendChild(createCell(item.type || "-"));
      tableBody.appendChild(row);
    });
  }

  function getReportLabel(reportType) {
    const labels = {
      general: "General",
      income: "Ingresos",
      expenses: "Gastos",
      clients: "Clientes",
      quotes: "Cotizaciones",
    };

    return labels[reportType] || "General";
  }

  function getMonthLabel(month) {
    const months = {
      "01": "Enero",
      "02": "Febrero",
      "03": "Marzo",
      "04": "Abril",
      "05": "Mayo",
      "06": "Junio",
      "07": "Julio",
      "08": "Agosto",
      "09": "Septiembre",
      10: "Octubre",
      11: "Noviembre",
      12: "Diciembre",
    };

    return months[month] || "Todos";
  }

  function buildSelectedRows(reportType, incomes, expenses, clients, quotes) {
    if (reportType === "income") {
      return sortRowsByDateDesc(
        incomes
          .filter((item) => getIncomeAmount(item) > 0)
          .map((item) => ({
            concept:
              item.concept || item.clientName || item.client || "Ingreso",
            category: getIncomeStatusLabel(item),
            date: formatDate(item.date || item.createdAt),
            amount: formatCurrency(getIncomeAmount(item)),
            type: "Ingreso",
          })),
      );
    }

    if (reportType === "expenses") {
      return sortRowsByDateDesc(
        expenses.map((item) => ({
          concept: item.concept || item.name || "Gasto",
          category: item.category || "-",
          date: formatDate(item.date || item.createdAt),
          amount: formatCurrency(getExpenseAmount(item)),
          type: "Gasto",
        })),
      );
    }

    if (reportType === "clients") {
      return clients.map((item) => ({
        concept: item.name || "-",
        category: item.status || "-",
        date: "-",
        amount: "-",
        type: "Cliente",
      }));
    }

    if (reportType === "quotes") {
      return sortRowsByDateDesc(
        quotes.map((item) => ({
          concept:
            item.title || item.serviceName || item.quoteNumber || "Cotización",
          category: `${item.status || "-"} / ${getQuotePaymentLabel(item)}`,
          date: formatDate(item.date || item.createdAt),
          amount: formatCurrency(getQuoteTotal(item)),
          type: "Cotización",
        })),
      );
    }

    return sortRowsByDateDesc([
      ...incomes
        .filter((item) => getIncomeAmount(item) > 0)
        .map((item) => ({
          concept: item.concept || item.clientName || item.client || "Ingreso",
          category: getIncomeStatusLabel(item),
          date: formatDate(item.date || item.createdAt),
          amount: formatCurrency(getIncomeAmount(item)),
          type: "Ingreso",
        })),
      ...expenses.map((item) => ({
        concept: item.concept || item.name || "Gasto",
        category: item.category || "-",
        date: formatDate(item.date || item.createdAt),
        amount: formatCurrency(getExpenseAmount(item)),
        type: "Gasto",
      })),
      ...incomes
        .filter((item) => shouldCountIncomeAsReceivable(item))
        .map((item) => ({
          concept:
            item.concept ||
            item.clientName ||
            item.client ||
            "Saldo pendiente",
          category: "Por cobrar / Parcial",
          date: formatDate(item.date || item.createdAt),
          amount: formatCurrency(getIncomePendingAmount(item)),
          type: "Por cobrar",
        })),
      ...quotes
        .filter(
          (item) =>
            shouldCountQuoteAsReceivable(item) &&
            !hasLinkedIncomeForQuote(item, incomes),
        )
        .map((item) => ({
          concept:
            item.title ||
            item.serviceName ||
            item.quoteNumber ||
            "Cuenta por cobrar",
          category: `Por cobrar / ${getQuotePaymentLabel(item)}`,
          date: formatDate(item.date || item.createdAt),
          amount: formatCurrency(getQuotePendingAmount(item)),
          type: "Por cobrar",
        })),
    ]);
  }

  async function generateReport(
    month,
    year,
    reportTypeRaw,
    advancedFilters = {},
  ) {
    const reportType = normalizeReportType(reportTypeRaw);

    const [runtime, allIncomes, allExpenses, allQuotes, clients] =
      await Promise.all([
        getRuntimeStatus(),
        getIncomeCollection(),
        getExpensesCollection(),
        getQuotesCollection(),
        getClientsCollection(),
      ]);

    const incomes = getFilteredMonthYear(
      allIncomes,
      "date",
      month,
      year,
    );
    const expenses = getFilteredMonthYear(
      allExpenses,
      "date",
      month,
      year,
    );
    const quotes = getFilteredMonthYear(
      allQuotes,
      "date",
      month,
      year,
    );

    loadReportFilterOptions({
      incomes: allIncomes,
      quotes: allQuotes,
      clients,
    });

    const filtered = applyAdvancedFilters({
      incomes,
      expenses,
      quotes,
      clients,
      client: advancedFilters.client || "",
      serviceType: advancedFilters.serviceType || "",
      paymentStatus: advancedFilters.paymentStatus || "",
    });

    const reportIncomes = filtered.incomes;
    const reportExpenses = filtered.expenses;
    const reportQuotes = filtered.quotes;
    const reportClients = filtered.clients;

    const totalIncome = reportIncomes.reduce(
      (sum, item) => sum + getIncomeAmount(item),
      0,
    );

    const totalExpenses = reportExpenses.reduce(
      (sum, item) => sum + getExpenseAmount(item),
      0,
    );

    const estimatedUtility = totalIncome - totalExpenses;

    const incomePendingAmount = reportIncomes
      .filter((item) => shouldCountIncomeAsReceivable(item))
      .reduce((sum, item) => sum + getIncomePendingAmount(item), 0);

    const quotePendingAmount = reportQuotes
      .filter(
        (item) =>
          shouldCountQuoteAsReceivable(item) &&
          !hasLinkedIncomeForQuote(item, reportIncomes),
      )
      .reduce((sum, item) => sum + getQuotePendingAmount(item), 0);

    const pendingAmount = incomePendingAmount + quotePendingAmount;

    const selectedRows = buildSelectedRows(
      reportType,
      reportIncomes,
      reportExpenses,
      reportClients,
      reportQuotes,
    );

    incomeCard.textContent = formatCurrency(totalIncome);
    expenseCard.textContent = formatCurrency(totalExpenses);
    utilityCard.textContent = formatCurrency(estimatedUtility);
    pendingCard.textContent = formatCurrency(pendingAmount);
    quotesCard.textContent = reportQuotes.length;

    renderRuntimeStatus(runtime);
    renderReportInsights({
      reportQuotes,
      reportIncomes,
    });
    renderTableRows(selectedRows);

    currentReportState = {
      month,
      year,
      reportType,
      client: advancedFilters.client || "",
      serviceType: advancedFilters.serviceType || "",
      paymentStatus: advancedFilters.paymentStatus || "",
      incomes: reportIncomes,
      expenses: reportExpenses,
      quotes: reportQuotes,
      clients: reportClients,
      totalIncome,
      totalExpenses,
      estimatedUtility,
      pendingAmount,
      selectedRows,
    };
  }

  function drawRect(doc, x, y, w, h) {
    doc.roundedRect(x, y, w, h, 3, 3);
  }

  function ensurePageSpace(doc, y, extraSpace = 18) {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y + extraSpace > pageHeight - 20) {
      doc.addPage();
      return 20;
    }
    return y;
  }

  function addFooter(doc) {
    const pageCount = doc.getNumberOfPages();

    for (let i = 1; i <= pageCount; i += 1) {
      doc.setPage(i);
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `Morfo Hub | Reporte interno | Página ${i} de ${pageCount}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: "center" },
      );
    }
  }

  function exportCurrentReportToPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      showToast("No se cargó jsPDF. Revisa reports.html.", { type: "error" });
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();

    let y = 20;

    const {
      month,
      year,
      reportType,
      client,
      serviceType,
      paymentStatus,
      totalIncome,
      totalExpenses,
      estimatedUtility,
      pendingAmount,
      quotes,
      selectedRows,
    } = currentReportState;

    doc.setFillColor(32, 45, 91);
    doc.rect(0, 0, pageWidth, 35, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Morfo Hub", 15, 15);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text("Reporte ejecutivo interno", 15, 23);

    doc.setFontSize(9);
    doc.text(
      `Generado: ${new Date().toLocaleString("es-MX")}`,
      pageWidth - 15,
      15,
      { align: "right" },
    );

    doc.text(`Tipo: ${getReportLabel(reportType)}`, pageWidth - 15, 23, {
      align: "right",
    });

    y = 45;
    doc.setTextColor(40, 40, 40);

    doc.setFillColor(245, 247, 250);
    drawRect(doc, 15, y, pageWidth - 30, 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Filtros aplicados", 20, y + 7);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `Mes: ${month ? getMonthLabel(month) : "Todos"}   |   Año: ${year || "Todos"}   |   Reporte: ${getReportLabel(reportType)}`,
      20,
      y + 13,
    );

    doc.text(
      `Cliente: ${client || "Todos"}   |   Servicio: ${serviceType || "Todos"}   |   Pago: ${paymentStatus || "Todos"}`,
      20,
      y + 18,
    );

    y += 34;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Resumen ejecutivo", 15, y);
    y += 8;

    const summaryCards = [
      { label: "Ingresos", value: formatCurrency(totalIncome) },
      { label: "Gastos", value: formatCurrency(totalExpenses) },
      { label: "Utilidad", value: formatCurrency(estimatedUtility) },
      { label: "Pendiente", value: formatCurrency(pendingAmount) },
    ];

    let cardX = 15;
    summaryCards.forEach((card) => {
      doc.setFillColor(248, 248, 248);
      drawRect(doc, cardX, y, 42, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(card.label, cardX + 4, y + 7);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(card.value, cardX + 4, y + 14);
      cardX += 45;
    });

    y += 28;

    doc.setFillColor(248, 248, 248);
    drawRect(doc, 15, y, pageWidth - 30, 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Cotizaciones del periodo: ${quotes.length}`, 20, y + 9);

    y += 24;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Detalle del reporte", 15, y);
    y += 8;

    if (!selectedRows || selectedRows.length === 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("No hay datos para este filtro.", 15, y);
      y += 10;
    } else {
      selectedRows.slice(0, 24).forEach((row, index) => {
        y = ensurePageSpace(doc, y, 28);

        doc.setFillColor(250, 250, 250);
        drawRect(doc, 15, y, pageWidth - 30, 22);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(`${index + 1}. ${row.concept}`, 20, y + 7);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(`Categoría: ${row.category}`, 20, y + 13);
        doc.text(`Fecha: ${row.date}`, 90, y + 13);
        doc.text(`Monto: ${row.amount}`, 20, y + 18);
        doc.text(`Tipo: ${row.type}`, 90, y + 18);

        y += 26;
      });
    }

    y = ensurePageSpace(doc, y, 30);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Notas del sistema", 15, y);
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const notes = [
      "Este documento fue generado automáticamente desde Morfo Hub.",
      "Las cotizaciones aprobadas no se consideran ingresos hasta registrar un pago real.",
      "El pendiente por cobrar se calcula desde cotizaciones con saldo pendiente, no desde ingresos ya cobrados.",
    ];

    notes.forEach((note) => {
      y = ensurePageSpace(doc, y, 8);
      doc.text(`• ${note}`, 18, y);
      y += 6;
    });

    addFooter(doc);

    const fileMonth = month || "todos";
    const fileYear = year || "todos";
    const fileType = reportType || "general";
    doc.save(`morfo-reporte-${fileType}-${fileMonth}-${fileYear}.pdf`);
  }

  if (reportForm) {
    reportForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const month = document.getElementById("report-month").value;
      const year = document.getElementById("report-year").value.trim();
      const reportTypeRaw = document.getElementById("report-type").value;
      const client = reportClientSelect.value;
      const serviceType = reportServiceSelect.value;
      const paymentStatus = reportPaymentStatusSelect.value;

      await generateReport(month, year, reportTypeRaw, {
        client,
        serviceType,
        paymentStatus,
      });
    });
  }

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", exportCurrentReportToPDF);
  }

  try {
    await generateReport("", "", "general");
  } finally {
    setPageLoading(false);
  }

  window.addEventListener("focus", async () => {
    await generateReport(
      currentReportState.month,
      currentReportState.year,
      currentReportState.reportType,
      {
        client: currentReportState.client,
        serviceType: currentReportState.serviceType,
        paymentStatus: currentReportState.paymentStatus,
      },
    );
  });
});
