import { protectPage } from "../services/auth.js";
import { STORAGE_KEYS, getData } from "../services/storage.js";
import { formatCurrency, formatDate, normalizeText } from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  await protectPage();

  const incomeKey = STORAGE_KEYS.INCOME;
  const expensesKey = STORAGE_KEYS.EXPENSES;
  const clientsKey = STORAGE_KEYS.CLIENTS;
  const quotesKey = STORAGE_KEYS.QUOTES;

  const cards = document.querySelectorAll(".cards-grid .card-value");

  if (cards.length < 5) {
    console.error(
      "No se encontraron las 5 tarjetas principales del dashboard.",
    );
    return;
  }

  const incomeCard = cards[0];
  const expenseCard = cards[1];
  const utilityCard = cards[2];
  const clientsCard = cards[3];
  const pendingCard = cards[4];

  const quoteDraftCount = document.getElementById("quoteDraftCount");
  const quoteSentCount = document.getElementById("quoteSentCount");
  const quoteApprovedCount = document.getElementById("quoteApprovedCount");
  const quoteRejectedCount = document.getElementById("quoteRejectedCount");
  const recentActivityBody = document.getElementById("recentActivityBody");

  let financePieChartInstance = null;

  function safeTimestamp(value) {
    if (!value) return 0;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }

  function isPrettyQuoteCode(value) {
    const identifier = String(value || "").trim();
    return /^[A-Za-z]{2,10}-\d{1,6}$/.test(identifier);
  }

  function getQuoteIdentifier(quote) {
    const preferredIdentifier =
      quote.quoteNumber ||
      quote.folio ||
      quote.code ||
      quote.quoteCode ||
      quote.quoteLabel ||
      "";

    const identifier = String(preferredIdentifier || "").trim();

    if (isPrettyQuoteCode(identifier)) {
      return identifier;
    }

    return "";
  }

  function getQuoteDisplayName(quote) {
    const baseName =
      quote.title ||
      quote.serviceName ||
      quote.concept ||
      quote.name ||
      "Cotización";

    const identifier = getQuoteIdentifier(quote);

    return identifier ? `${baseName} (${identifier})` : baseName;
  }

  function getIncomeQuoteReference(item) {
    const preferredReference =
      item.quoteNumber || item.quoteRef || item.quoteCode || item.folio || "";

    const reference = String(preferredReference || "").trim();

    if (isPrettyQuoteCode(reference)) {
      return reference;
    }

    return "";
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

  function getExpenseAmount(item) {
    return Number(item.amount || item.totalAmount || 0);
  }

  function getQuoteTotal(item) {
    return Number(item.total || item.totalAmount || item.amount || 0);
  }

  function getQuotePaidAmount(item) {
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
    const total = getQuoteTotal(item);
    const paid = getQuotePaidAmount(item);
    return Math.max(total - paid, 0);
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

  function isCurrentMonth(value) {
    if (!value) return false;

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;

    const now = new Date();

    return (
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()
    );
  }

  function getDashboardData() {
    const incomes = getData(incomeKey);
    const expenses = getData(expensesKey);
    const clients = getData(clientsKey);
    const quotes = getData(quotesKey);

    const monthlyIncomes = incomes.filter((item) =>
      isCurrentMonth(item.date || item.createdAt),
    );

    const monthlyExpenses = expenses.filter((item) =>
      isCurrentMonth(item.date || item.createdAt),
    );

    const totalIncome = monthlyIncomes.reduce(
      (sum, item) => sum + getIncomeAmount(item),
      0,
    );

    const totalExpenses = monthlyExpenses.reduce(
      (sum, item) => sum + getExpenseAmount(item),
      0,
    );

    const estimatedUtility = totalIncome - totalExpenses;

    const activeClients = clients.filter(
      (client) => normalizeText(client.status) === "activo",
    ).length;

    const pendingAmount = quotes
      .filter((quote) => shouldCountQuoteAsReceivable(quote))
      .reduce((sum, quote) => sum + getQuotePendingAmount(quote), 0);

    const quoteStats = {
      borrador: 0,
      enviada: 0,
      aprobada: 0,
      rechazada: 0,
    };

    quotes.forEach((quote) => {
      const status = normalizeText(quote.status);

      if (Object.prototype.hasOwnProperty.call(quoteStats, status)) {
        quoteStats[status] += 1;
      }
    });

    return {
      incomes,
      expenses,
      clients,
      quotes,
      totalIncome,
      totalExpenses,
      estimatedUtility,
      activeClients,
      pendingAmount,
      quoteStats,
    };
  }

  function buildRecentActivity(data) {
    const incomeRows = data.incomes
      .filter((item) => getIncomeAmount(item) > 0)
      .map((item) => {
        const quoteRef = getIncomeQuoteReference(item);
        const conceptBase =
          item.concept ||
          item.clientName ||
          item.client ||
          item.name ||
          "Ingreso";

        return {
          type: "Ingreso",
          concept: quoteRef ? `${conceptBase} (${quoteRef})` : conceptBase,
          date: item.date || item.createdAt || "",
          amount: getIncomeAmount(item),
          sortValue: safeTimestamp(item.date || item.createdAt),
        };
      });

    const expenseRows = data.expenses.map((item) => ({
      type: "Gasto",
      concept: item.concept || item.name || item.supplier || "Gasto",
      date: item.date || item.createdAt || "",
      amount: getExpenseAmount(item),
      sortValue: safeTimestamp(item.date || item.createdAt),
    }));

    const quotePendingRows = data.quotes
      .filter((quote) => shouldCountQuoteAsReceivable(quote))
      .map((quote) => ({
        type: "Cotización",
        concept: getQuoteDisplayName(quote),
        date: quote.date || quote.createdAt || "",
        amount: getQuotePendingAmount(quote),
        sortValue: safeTimestamp(quote.date || quote.createdAt),
      }))
      .filter((row) => row.amount > 0);

    return [...incomeRows, ...expenseRows, ...quotePendingRows]
      .sort((a, b) => b.sortValue - a.sortValue)
      .slice(0, 6);
  }

  function renderRecentActivity(rows) {
    if (!recentActivityBody) return;

    recentActivityBody.innerHTML = "";

    if (!rows.length) {
      recentActivityBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center;">
            No hay actividad reciente.
          </td>
        </tr>
      `;
      return;
    }

    rows.forEach((row) => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${row.type}</td>
        <td>${row.concept}</td>
        <td>${formatDate(row.date)}</td>
        <td>${formatCurrency(row.amount)}</td>
      `;

      recentActivityBody.appendChild(tr);
    });
  }

  function renderQuoteStats(stats) {
    if (quoteDraftCount) quoteDraftCount.textContent = stats.borrador;
    if (quoteSentCount) quoteSentCount.textContent = stats.enviada;
    if (quoteApprovedCount) quoteApprovedCount.textContent = stats.aprobada;
    if (quoteRejectedCount) quoteRejectedCount.textContent = stats.rechazada;
  }

  function renderFinancePieChart(data) {
    const canvas = document.getElementById("financePieChart");
    if (!canvas || typeof Chart === "undefined") return;

    if (financePieChartInstance) {
      financePieChartInstance.destroy();
    }

    financePieChartInstance = new Chart(canvas, {
      type: "pie",
      data: {
        labels: ["Ingresos cobrados", "Gastos", "Por cobrar"],
        datasets: [
          {
            data: [
              Number(data.totalIncome || 0),
              Number(data.totalExpenses || 0),
              Number(data.pendingAmount || 0),
            ],
            backgroundColor: ["#98db6b", "#ff8a8a", "#7fd9e8"],
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
            labels: {
              color: "#f3f3f3",
              padding: 16,
            },
          },
        },
      },
    });
  }

  function loadDashboardData() {
    const data = getDashboardData();

    incomeCard.textContent = formatCurrency(data.totalIncome);
    expenseCard.textContent = formatCurrency(data.totalExpenses);
    utilityCard.textContent = formatCurrency(data.estimatedUtility);
    clientsCard.textContent = data.activeClients;
    pendingCard.textContent = formatCurrency(data.pendingAmount);

    renderQuoteStats(data.quoteStats);
    renderRecentActivity(buildRecentActivity(data));
    renderFinancePieChart(data);
  }

  loadDashboardData();
});
