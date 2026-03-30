document.addEventListener("DOMContentLoaded", () => {
  const reportForm = document.querySelector("form");
  const exportPdfBtn = document.getElementById("exportReportPdfBtn");

  const incomeKey = "morfo_income";
  const expensesKey = "morfo_expenses";
  const clientsKey = "morfo_clients";
  const quotesKey = "morfo_quotes";

  const cards = document.querySelectorAll(".card-value");
  const incomeCard = cards[0];
  const expenseCard = cards[1];
  const utilityCard = cards[2];
  const pendingCard = cards[3];
  const quotesCard = cards[4];
  const tableBody = document.querySelector(".table tbody");

  let currentReportState = {
    month: "",
    year: "",
    reportType: "general",
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

  function getData(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error(`Error leyendo ${key}:`, error);
      return [];
    }
  }

  function normalizeText(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

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

  function formatCurrency(amount) {
    return Number(amount || 0).toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
    });
  }

  function formatDate(value) {
    if (!value) return "-";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return date.toLocaleDateString("es-MX");
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

  function renderTableRows(data) {
    tableBody.innerHTML = "";

    if (!data || data.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center;">No hay datos para este filtro.</td>
        </tr>
      `;
      return;
    }

    data.forEach((item) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${item.concept || "-"}</td>
        <td>${item.category || "-"}</td>
        <td>${item.date || "-"}</td>
        <td>${item.amount || "-"}</td>
        <td>${item.type || "-"}</td>
      `;
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
      ...quotes
        .filter((item) => shouldCountQuoteAsReceivable(item))
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

  function generateReport(month, year, reportTypeRaw) {
    const reportType = normalizeReportType(reportTypeRaw);

    const incomes = getFilteredMonthYear(
      getData(incomeKey),
      "date",
      month,
      year,
    );
    const expenses = getFilteredMonthYear(
      getData(expensesKey),
      "date",
      month,
      year,
    );
    const quotes = getFilteredMonthYear(
      getData(quotesKey),
      "date",
      month,
      year,
    );
    const clients = getData(clientsKey);

    const totalIncome = incomes.reduce(
      (sum, item) => sum + getIncomeAmount(item),
      0,
    );

    const totalExpenses = expenses.reduce(
      (sum, item) => sum + getExpenseAmount(item),
      0,
    );

    const estimatedUtility = totalIncome - totalExpenses;

    const pendingAmount = quotes
      .filter((item) => shouldCountQuoteAsReceivable(item))
      .reduce((sum, item) => sum + getQuotePendingAmount(item), 0);

    const selectedRows = buildSelectedRows(
      reportType,
      incomes,
      expenses,
      clients,
      quotes,
    );

    incomeCard.textContent = formatCurrency(totalIncome);
    expenseCard.textContent = formatCurrency(totalExpenses);
    utilityCard.textContent = formatCurrency(estimatedUtility);
    pendingCard.textContent = formatCurrency(pendingAmount);
    quotesCard.textContent = quotes.length;

    renderTableRows(selectedRows);

    currentReportState = {
      month,
      year,
      reportType,
      incomes,
      expenses,
      quotes,
      clients,
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
      alert("No se cargó jsPDF. Revisa reports.html.");
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

    y += 28;

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
    reportForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const month = document.getElementById("report-month").value;
      const year = document.getElementById("report-year").value.trim();
      const reportTypeRaw = document.getElementById("report-type").value;

      generateReport(month, year, reportTypeRaw);
    });
  }

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener("click", exportCurrentReportToPDF);
  }

  generateReport("", "", "general");
});
