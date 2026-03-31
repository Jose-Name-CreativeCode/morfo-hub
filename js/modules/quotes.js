import { protectPage } from "../services/auth.js";
import { STORAGE_KEYS, getData, saveData } from "../services/storage.js";
import { formatCurrency, getTodayISO, normalizeText } from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  await protectPage();

  const quoteForm = document.querySelector("form");
  const quoteTable = document.querySelector(".table");
  const quoteTableHead = document.querySelector(".table thead");
  const quoteTableBody = document.querySelector(".table tbody");
  const submitButton = quoteForm.querySelector(".btn-primary");
  const clientSelect = document.getElementById("quote-client");

  const manageModal = document.getElementById("manage-quote-modal");
  const manageOverlay = document.getElementById("manage-overlay");
  const manageCloseBtn = document.getElementById("manage-close");
  const manageQuoteTitle = document.getElementById("manage-quote-title");
  const manageQuoteMeta = document.getElementById("manage-quote-meta");

  const paymentModal = document.getElementById("payment-modal");
  const paymentOverlay = document.getElementById("payment-overlay");
  const paymentCloseBtn = document.getElementById("payment-close");
  const paymentModalTitle = document.getElementById("payment-modal-title");
  const paymentModalMeta = document.getElementById("payment-modal-meta");
  const paymentForm = document.getElementById("payment-form");

  const STORAGE_KEY = STORAGE_KEYS.QUOTES;
  const CLIENTS_KEY = STORAGE_KEYS.CLIENTS;
  const INCOME_KEY = STORAGE_KEYS.INCOME;
  const SETTINGS_KEY = STORAGE_KEYS.SETTINGS;
  const IVA_RATE = 0.16;

  let editingQuoteId = null;
  let activeManageQuoteId = null;
  let activePaymentQuoteId = null;
  let activePaymentType = null;
  let selectedClientFilter = "";

  function getQuotes() {
    return getData(STORAGE_KEY, []);
  }

  function saveQuotes(quotes) {
    saveData(STORAGE_KEY, quotes);
  }

  function getClients() {
    return getData(CLIENTS_KEY, []);
  }

  function getIncomes() {
    return getData(INCOME_KEY, []);
  }

  function saveIncomes(incomes) {
    saveData(INCOME_KEY, incomes);
  }

  function getSettings() {
    return getData(SETTINGS_KEY, {});
  }

  function getSettingsAgencyName() {
    const settings = getSettings();
    return settings.agency?.name || "";
  }

  function getSettingsAgencyEmail() {
    const settings = getSettings();
    return settings.agency?.email || "";
  }

  function getSettingsAgencyPhone() {
    const settings = getSettings();
    return settings.agency?.phone || "";
  }

  function getSettingsAgencyWebsite() {
    const settings = getSettings();
    return settings.agency?.website || "";
  }

  function getSettingsAgencyAddress() {
    const settings = getSettings();
    return settings.agency?.address || "";
  }

  function getDefaultTerms() {
    const settings = getSettings();
    return settings.terms || "";
  }

  function getDefaultInvoiceTax() {
    const settings = getSettings();
    return Number(settings.invoice?.tax || IVA_RATE * 100);
  }

  function getDefaultInvoiceNote() {
    const settings = getSettings();
    return settings.invoice?.note || "";
  }

  function applyDefaultTermsToQuoteForm(force = false) {
    const notesField = document.getElementById("quote-notes");
    if (!notesField) return;

    const defaultTerms = getDefaultTerms();

    if (force || !notesField.value.trim()) {
      notesField.value = defaultTerms;
    }
  }

  function extractNumericId(value, prefix) {
    if (!value || typeof value !== "string") return 0;
    const regex = new RegExp(`^${prefix}-(\\d+)$`);
    const match = value.match(regex);
    return match ? Number(match[1]) : 0;
  }

  function buildSequentialId(prefix, items, field = "publicId") {
    const max = items.reduce((acc, item) => {
      const value = extractNumericId(item[field], prefix);
      return value > acc ? value : acc;
    }, 0);

    return `${prefix}-${String(max + 1).padStart(4, "0")}`;
  }

  function ensureQuoteIds() {
    const quotes = getQuotes();
    let changed = false;

    const updated = quotes.map((quote, index) => {
      const nextQuote = {
        ...quote,
        paymentHistory: quote.paymentHistory || [],
      };

      if (!nextQuote.publicId) {
        nextQuote.publicId = `COT-${String(index + 1).padStart(4, "0")}`;
        changed = true;
      }

      return nextQuote;
    });

    if (changed) {
      saveQuotes(updated);
    }

    return updated;
  }

  function ensureIncomeIds() {
    const incomes = getIncomes();
    let changed = false;
    let counter = 1;

    const updated = incomes.map((income) => {
      const nextIncome = { ...income };

      if (!nextIncome.publicId) {
        nextIncome.publicId = `ING-${String(counter++).padStart(4, "0")}`;
        changed = true;
      } else {
        counter = Math.max(
          counter,
          extractNumericId(nextIncome.publicId, "ING") + 1,
        );
      }

      return nextIncome;
    });

    if (changed) saveIncomes(updated);
    return updated;
  }

  function loadClientOptions() {
    const clients = getClients();

    clientSelect.innerHTML = `<option value="">Selecciona un cliente</option>`;

    if (clients.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No hay clientes registrados";
      option.disabled = true;
      clientSelect.appendChild(option);
      return;
    }

    clients.forEach((client) => {
      const option = document.createElement("option");
      option.value = client.name;
      option.textContent = client.name;
      clientSelect.appendChild(option);
    });
  }

  function calculateTotals() {
    const subtotalInput = document.getElementById("quote-subtotal");
    const invoiceSelect = document.getElementById("quote-invoice");
    const ivaInput = document.getElementById("quote-iva");
    const totalInput = document.getElementById("quote-total");

    const subtotal = Number(subtotalInput.value) || 0;
    const requiresInvoice = invoiceSelect.value === "yes";
    const taxRate = getDefaultInvoiceTax() / 100;

    const iva = requiresInvoice ? subtotal * taxRate : 0;
    const total = subtotal + iva;

    ivaInput.value = iva.toFixed(2);
    totalInput.value = total.toFixed(2);
  }

  function resetForm() {
    quoteForm.reset();
    editingQuoteId = null;
    submitButton.textContent = "Guardar cotización";
    document.getElementById("quote-iva").value = "";
    document.getElementById("quote-total").value = "";

    applyDefaultTermsToQuoteForm(true);
  }

  function resetPaymentForm() {
    paymentForm.reset();
    activePaymentQuoteId = null;
    activePaymentType = null;
  }

  function normalizeStatus(value, fallback) {
    return String(value || fallback)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function getStatusClass(status) {
    const normalized = normalizeStatus(status, "borrador");
    if (normalized === "aprobada") return "aprobada";
    if (normalized === "enviada") return "enviada";
    if (normalized === "rechazada") return "rechazada";
    return "borrador";
  }

  function getPaymentStatusClass(paymentStatus) {
    const normalized = normalizeStatus(paymentStatus, "no pagada");
    if (normalized === "anticipo pagado") return "anticipo-pagado";
    if (normalized === "pagada total") return "pagada-total";
    return "no-pagada";
  }

  function normalizeIncomePaymentStatus(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function inferQuotePaymentStatusFromIncome(quote, income) {
    const quoteTotal = Number(quote.total || 0);

    if (!income) {
      return {
        paymentStatus: "no pagada",
        totalPaid: 0,
        remainingAmount: quoteTotal,
        linkedIncomeId: "",
        paymentMethod: "",
      };
    }

    const incomeStatus = normalizeIncomePaymentStatus(income.paymentStatus);
    const incomePaidAmount = Number(income.paidAmount || 0);
    const incomeRemainingRaw =
      income.remainingAmount !== undefined && income.remainingAmount !== null
        ? Number(income.remainingAmount || 0)
        : Math.max(quoteTotal - incomePaidAmount, 0);
    const incomeRemainingAmount = Math.max(incomeRemainingRaw, 0);

    if (
      incomeStatus === "pendiente" ||
      incomeStatus === "no pagada" ||
      incomeStatus === "no_pagada"
    ) {
      return {
        paymentStatus: "no pagada",
        totalPaid: 0,
        remainingAmount: quoteTotal,
        linkedIncomeId: income.publicId || "",
        paymentMethod: income.paymentMethod || "",
      };
    }

    if (
      incomeStatus === "parcial" ||
      incomeStatus === "anticipo pagado" ||
      incomeStatus === "anticipo_pagado"
    ) {
      const paidAmount =
        incomePaidAmount > 0
          ? incomePaidAmount
          : Math.max(quoteTotal - incomeRemainingAmount, 0);

      return {
        paymentStatus: "anticipo pagado",
        totalPaid: paidAmount,
        remainingAmount: Math.max(quoteTotal - paidAmount, 0),
        linkedIncomeId: income.publicId || "",
        paymentMethod: income.paymentMethod || "",
      };
    }

    if (incomeStatus === "pagado" || incomeStatus === "pagada total") {
      return {
        paymentStatus: "pagada total",
        totalPaid: quoteTotal,
        remainingAmount: 0,
        linkedIncomeId: income.publicId || "",
        paymentMethod: income.paymentMethod || "",
      };
    }

    if (incomeRemainingAmount === 0 && incomePaidAmount > 0) {
      return {
        paymentStatus: "pagada total",
        totalPaid: quoteTotal,
        remainingAmount: 0,
        linkedIncomeId: income.publicId || "",
        paymentMethod: income.paymentMethod || "",
      };
    }

    if (incomePaidAmount > 0 && incomeRemainingAmount > 0) {
      return {
        paymentStatus: "anticipo pagado",
        totalPaid: incomePaidAmount,
        remainingAmount: incomeRemainingAmount,
        linkedIncomeId: income.publicId || "",
        paymentMethod: income.paymentMethod || "",
      };
    }

    return {
      paymentStatus: "no pagada",
      totalPaid: 0,
      remainingAmount: quoteTotal,
      linkedIncomeId: income.publicId || "",
      paymentMethod: income.paymentMethod || "",
    };
  }

  function syncQuotesWithIncomes() {
    const quotes = getQuotes();
    const incomes = getIncomes();

    let changed = false;

    const updatedQuotes = quotes.map((quote) => {
      const income = incomes.find((item) => item.quoteId === quote.id);
      const nextPaymentState = inferQuotePaymentStatusFromIncome(quote, income);

      const quotePaymentStatus = String(quote.paymentStatus || "").trim();
      const quoteTotalPaid = Number(quote.totalPaid || 0);
      const quoteRemainingAmount =
        quote.remainingAmount !== undefined && quote.remainingAmount !== null
          ? Number(quote.remainingAmount || 0)
          : Number(quote.total || 0);
      const quoteLinkedIncomeId = String(quote.linkedIncomeId || "");
      const quotePaymentMethod = String(quote.paymentMethod || "");

      const mustUpdate =
        quotePaymentStatus !== nextPaymentState.paymentStatus ||
        quoteTotalPaid !== nextPaymentState.totalPaid ||
        quoteRemainingAmount !== nextPaymentState.remainingAmount ||
        quoteLinkedIncomeId !== nextPaymentState.linkedIncomeId ||
        quotePaymentMethod !== nextPaymentState.paymentMethod;

      if (!mustUpdate) {
        return quote;
      }

      changed = true;

      return {
        ...quote,
        paymentStatus: nextPaymentState.paymentStatus,
        totalPaid: nextPaymentState.totalPaid,
        remainingAmount: nextPaymentState.remainingAmount,
        linkedIncomeId: nextPaymentState.linkedIncomeId,
        paymentMethod: nextPaymentState.paymentMethod,
      };
    });

    if (changed) {
      saveQuotes(updatedQuotes);
    }

    return updatedQuotes;
  }

  function getQuoteById(id) {
    syncQuotesWithIncomes();
    return getQuotes().find((q) => q.id === id);
  }

  function getIncomeByQuoteId(quoteId) {
    return getIncomes().find((income) => income.quoteId === quoteId);
  }

  function openManageModal(id) {
    const quote = getQuoteById(id);
    if (!quote) return;

    activeManageQuoteId = id;
    manageQuoteTitle.textContent = `${quote.publicId} · ${quote.title}`;
    manageQuoteMeta.textContent = `${quote.client} · ${quote.date} · ${formatCurrency(quote.total)}`;

    manageModal.classList.add("open");
    manageOverlay.classList.add("open");
  }

  function closeManageModal() {
    activeManageQuoteId = null;
    manageModal.classList.remove("open");
    manageOverlay.classList.remove("open");
  }

  function closePaymentModal() {
    resetPaymentForm();
    paymentModal.classList.remove("open");
    paymentOverlay.classList.remove("open");
  }

  function openPaymentModal(id, type) {
    const quote = getQuoteById(id);
    if (!quote) return;

    const income = getIncomeByQuoteId(id);
    const total = Number(quote.total) || 0;
    const alreadyPaid = Number(income?.paidAmount || 0);
    const remaining = Math.max(total - alreadyPaid, 0);

    if (quote.paymentStatus === "pagada total" && income) {
      alert(
        `La cotización ${quote.publicId} ya fue liquidada por completo. No se puede registrar otro pago.`,
      );
      return;
    }

    if (type === "anticipo") {
      if (income && Number(income.paidAmount || 0) > 0) {
        alert(
          `La cotización ${quote.publicId} ya tiene un ingreso relacionado (${income.publicId}). No se puede registrar otro anticipo.`,
        );
        return;
      }
    }

    activePaymentQuoteId = id;
    activePaymentType = type;

    paymentModalTitle.textContent =
      type === "anticipo" ? "Registrar anticipo" : "Registrar pago total";
    paymentModalMeta.textContent = `${quote.publicId} · ${quote.client} · ${quote.title}`;

    document.getElementById("payment-type").value =
      type === "anticipo" ? "Anticipo" : "Pago total";
    document.getElementById("payment-date").value = getTodayISO();
    document.getElementById("payment-method").value = "";
    document.getElementById("payment-due-date").value = "";

    if (type === "anticipo") {
      document.getElementById("payment-amount").value = (total * 0.5).toFixed(
        2,
      );
      document.getElementById("payment-notes").value =
        `Anticipo del 50% para la cotización ${quote.publicId}.`;
    } else {
      const amountToSet = income ? remaining : total;
      document.getElementById("payment-amount").value = amountToSet.toFixed(2);

      if (income) {
        document.getElementById("payment-notes").value =
          `Liquidación final de la cotización ${quote.publicId}. ` +
          `Este pago completa el saldo restante del ingreso ${income.publicId}.`;
      } else {
        document.getElementById("payment-notes").value =
          `Pago total de la cotización ${quote.publicId}.`;
      }
    }

    paymentModal.classList.add("open");
    paymentOverlay.classList.add("open");
  }

  function ensureQuoteTableHeader() {
    quoteTableHead.innerHTML = `
      <tr>
        <th>ID</th>
        <th>Fecha</th>
        <th>Cliente</th>
        <th>Título</th>
        <th>Servicio</th>
        <th>Total</th>
        <th>Estado</th>
        <th>Pago</th>
        <th>PDF</th>
        <th>Gestionar</th>
      </tr>
    `;
  }

  function ensureFilterUI() {
    if (document.getElementById("quotes-filters")) return;

    const filterWrapper = document.createElement("div");
    filterWrapper.id = "quotes-filters";
    filterWrapper.style.display = "grid";
    filterWrapper.style.gridTemplateColumns =
      "repeat(auto-fit, minmax(220px, 1fr))";
    filterWrapper.style.gap = "14px";
    filterWrapper.style.marginBottom = "18px";

    filterWrapper.innerHTML = `
      <div class="form-group" style="margin-bottom:0;">
        <label for="filter-client">Filtrar por cliente</label>
        <select id="filter-client">
          <option value="">Todos los clientes</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0; display:flex; align-items:end;">
        <button type="button" id="clear-quote-filters" class="btn-primary">Limpiar filtro</button>
      </div>
    `;

    const tableWrapper = quoteTable.closest(".table-wrapper");
    tableWrapper.parentNode.insertBefore(filterWrapper, tableWrapper);

    document
      .getElementById("filter-client")
      .addEventListener("change", (event) => {
        selectedClientFilter = event.target.value;
        renderQuotes();
      });

    document
      .getElementById("clear-quote-filters")
      .addEventListener("click", () => {
        selectedClientFilter = "";
        document.getElementById("filter-client").value = "";
        renderQuotes();
      });
  }

  function loadFilterOptions() {
    const filterSelect = document.getElementById("filter-client");
    if (!filterSelect) return;

    syncQuotesWithIncomes();
    const quotes = getQuotes();
    const uniqueClients = [
      ...new Set(quotes.map((q) => q.client).filter(Boolean)),
    ];

    filterSelect.innerHTML = `<option value="">Todos los clientes</option>`;

    uniqueClients.forEach((client) => {
      const option = document.createElement("option");
      option.value = client;
      option.textContent = client;
      filterSelect.appendChild(option);
    });

    filterSelect.value = selectedClientFilter;
  }

  function renderQuotes() {
    ensureQuoteTableHeader();

    syncQuotesWithIncomes();

    let quotes = getQuotes();
    loadFilterOptions();

    if (selectedClientFilter) {
      quotes = quotes.filter((quote) => quote.client === selectedClientFilter);
    }

    quoteTableBody.innerHTML = "";

    if (quotes.length === 0) {
      quoteTableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align:center;">No hay cotizaciones registradas.</td>
        </tr>
      `;
      return;
    }

    quotes.forEach((quote) => {
      const row = document.createElement("tr");
      const statusClass = getStatusClass(quote.status);
      const paymentStatusClass = getPaymentStatusClass(quote.paymentStatus);

      row.innerHTML = `
        <td>${quote.publicId || "-"}</td>
        <td>${quote.date}</td>
        <td>${quote.client}</td>
        <td>${quote.title}</td>
        <td>${quote.serviceType}</td>
        <td>${formatCurrency(quote.total)}</td>
        <td><span class="status ${statusClass}">${quote.status || "borrador"}</span></td>
        <td><span class="status payment ${paymentStatusClass}">${quote.paymentStatus || "no pagada"}</span></td>
        <td>
          <button type="button" class="pdf-btn" data-id="${quote.id}">PDF</button>
        </td>
        <td>
          <button type="button" class="manage-btn" data-id="${quote.id}">Gestionar</button>
        </td>
      `;

      quoteTableBody.appendChild(row);
    });

    addTableEvents();
  }

  function fillForm(quote) {
    document.getElementById("quote-client").value = quote.client;
    document.getElementById("quote-date").value = quote.date;
    document.getElementById("quote-title").value = quote.title;
    document.getElementById("quote-service-type").value = quote.serviceType;
    document.getElementById("quote-description").value = quote.description;
    document.getElementById("quote-includes").value = quote.includes;
    document.getElementById("quote-subtotal").value = quote.subtotal;
    document.getElementById("quote-invoice").value =
      quote.invoiceRequired === "Sí" ? "yes" : "no";
    document.getElementById("quote-iva").value = quote.iva;
    document.getElementById("quote-total").value = quote.total;
    document.getElementById("quote-notes").value =
      quote.notes || getDefaultTerms();

    editingQuoteId = quote.id;
    submitButton.textContent = "Actualizar cotización";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEdit(id) {
    const quote = getQuoteById(id);
    if (!quote) return;
    fillForm(quote);
    closeManageModal();
  }

  function handleDelete(id) {
    const quote = getQuoteById(id);
    if (!quote) return;

    const confirmed = confirm(`¿Eliminar la cotización ${quote.publicId}?`);
    if (!confirmed) return;

    let quotes = getQuotes();
    quotes = quotes.filter((q) => q.id !== id);
    saveQuotes(quotes);

    if (editingQuoteId === id) resetForm();
    closeManageModal();
    renderQuotes();
  }

  function updateStatus(id, newStatus) {
    const quotes = getQuotes().map((quote) =>
      quote.id === id ? { ...quote, status: newStatus } : quote,
    );

    saveQuotes(quotes);
    renderQuotes();
    openManageModal(id);
  }

  function buildPaymentNote({
    paymentDate,
    paymentType,
    paidAmount,
    remainingAmount,
    dueDate,
    previousIncomeId,
    extraNotes,
    existingNotes,
  }) {
    const lines = [];

    if (existingNotes) {
      lines.push(existingNotes);
    }

    if (paymentType === "anticipo") {
      lines.push(
        `[${paymentDate}] Anticipo registrado del 50% por ${formatCurrency(paidAmount)}.`,
      );

      if (remainingAmount > 0) {
        lines.push(`Saldo pendiente: ${formatCurrency(remainingAmount)}.`);
      }

      if (dueDate) {
        lines.push(`Fecha pactada para pago restante: ${dueDate}.`);
      }
    } else {
      if (previousIncomeId) {
        lines.push(
          `[${paymentDate}] Pago final aplicado al ingreso ${previousIncomeId}.`,
        );
      } else {
        lines.push(
          `[${paymentDate}] Pago total registrado por ${formatCurrency(paidAmount)}.`,
        );
      }

      lines.push(
        `La totalidad del servicio ya fue liquidada en fecha ${paymentDate}. Saldo pendiente: ${formatCurrency(0)}.`,
      );
    }

    if (extraNotes) {
      lines.push(extraNotes);
    }

    return lines.join("\n");
  }

  function registerPayment({
    quoteId,
    paymentType,
    paymentDate,
    amountPaid,
    paymentMethod,
    dueDate,
    paymentNotes,
  }) {
    const quotes = getQuotes();
    let incomes = ensureIncomeIds();

    const quote = quotes.find((q) => q.id === quoteId);
    if (!quote) {
      alert("No se encontró la cotización.");
      return false;
    }

    const quoteTotal = Number(quote.total) || 0;
    const paidNow = Number(amountPaid) || 0;
    const existingIncome = incomes.find((income) => income.quoteId === quoteId);

    if (paymentType === "anticipo") {
      if (existingIncome && Number(existingIncome.paidAmount || 0) > 0) {
        alert(
          `La cotización ${quote.publicId} ya tiene un ingreso relacionado (${existingIncome.publicId}). No se puede registrar otro anticipo.`,
        );
        return false;
      }

      const amountToSave = Number(paidNow.toFixed(2));
      const remainingAmount = Number((quoteTotal - amountToSave).toFixed(2));
      const nextIncomeId = buildSequentialId("ING", incomes, "publicId");

      const incomeNotes = buildPaymentNote({
        paymentDate,
        paymentType: "anticipo",
        paidAmount: amountToSave,
        remainingAmount,
        dueDate,
        extraNotes: paymentNotes,
        existingNotes: "",
      });

      const newIncome = {
        id: Date.now(),
        publicId: nextIncomeId,
        quoteId: quote.id,
        quotePublicId: quote.publicId,
        client: quote.client,
        date: paymentDate,
        concept: `${quote.title} (${quote.publicId})`,
        totalAmount: quoteTotal,
        paidAmount: amountToSave,
        remainingAmount,
        paymentStatus: "Parcial",
        paymentMethod,
        invoiceRequired: quote.invoiceRequired,
        notes: incomeNotes,
        paymentHistory: [
          {
            type: "anticipo",
            date: paymentDate,
            amount: amountToSave,
            remainingAmount,
            dueDate: dueDate || "",
            method: paymentMethod,
            note: paymentNotes || "",
          },
        ],
      };

      incomes.push(newIncome);
      saveIncomes(incomes);

      const updatedQuotes = quotes.map((item) =>
        item.id === quoteId
          ? {
              ...item,
              paymentStatus: "anticipo pagado",
              paymentMethod,
              paymentNotes: incomeNotes,
              advanceRegistered: true,
              totalPaid: amountToSave,
              remainingAmount,
              linkedIncomeId: nextIncomeId,
              paymentHistory: [
                ...(item.paymentHistory || []),
                {
                  type: "anticipo",
                  date: paymentDate,
                  amount: amountToSave,
                  remainingAmount,
                  dueDate: dueDate || "",
                  method: paymentMethod,
                  note: paymentNotes || "",
                },
              ],
            }
          : item,
      );

      saveQuotes(updatedQuotes);
      renderQuotes();

      alert(
        `Anticipo registrado correctamente.\nCotización: ${quote.publicId}\nIngreso generado: ${nextIncomeId}\nMonto: ${formatCurrency(amountToSave)}\nSaldo pendiente: ${formatCurrency(remainingAmount)}`,
      );

      return true;
    }

    if (paymentType === "total") {
      if (existingIncome) {
        if (normalizeText(existingIncome.paymentStatus) === "pagado") {
          alert(
            `La cotización ${quote.publicId} ya fue liquidada. No se puede registrar otro pago total.`,
          );
          return false;
        }

        const currentPaid = Number(existingIncome.paidAmount || 0);
        const remainingAmount = Number((quoteTotal - currentPaid).toFixed(2));

        if (remainingAmount <= 0) {
          alert(`La cotización ${quote.publicId} ya no tiene saldo pendiente.`);
          return false;
        }

        const amountToApply = Number(remainingAmount.toFixed(2));

        const mergedNotes = buildPaymentNote({
          paymentDate,
          paymentType: "total",
          paidAmount: amountToApply,
          remainingAmount: 0,
          previousIncomeId: existingIncome.publicId,
          extraNotes: paymentNotes,
          existingNotes: existingIncome.notes,
        });

        incomes = incomes.map((income) =>
          income.quoteId === quoteId
            ? {
                ...income,
                date: paymentDate,
                paidAmount: Number((currentPaid + amountToApply).toFixed(2)),
                remainingAmount: 0,
                paymentStatus: "Pagado",
                paymentMethod,
                notes: mergedNotes,
                paymentHistory: [
                  ...(income.paymentHistory || []),
                  {
                    type: "liquidacion",
                    date: paymentDate,
                    amount: amountToApply,
                    remainingAmount: 0,
                    method: paymentMethod,
                    note: paymentNotes || "",
                    referenceIncomeId: existingIncome.publicId,
                  },
                ],
              }
            : income,
        );

        saveIncomes(incomes);

        const updatedQuotes = quotes.map((item) =>
          item.id === quoteId
            ? {
                ...item,
                paymentStatus: "pagada total",
                paymentMethod,
                paymentNotes: mergedNotes,
                totalPaid: quoteTotal,
                remainingAmount: 0,
                linkedIncomeId: existingIncome.publicId,
                paymentHistory: [
                  ...(item.paymentHistory || []),
                  {
                    type: "liquidacion",
                    date: paymentDate,
                    amount: amountToApply,
                    remainingAmount: 0,
                    method: paymentMethod,
                    note: paymentNotes || "",
                    referenceIncomeId: existingIncome.publicId,
                  },
                ],
              }
            : item,
        );

        saveQuotes(updatedQuotes);
        renderQuotes();

        alert(
          `Pago total aplicado correctamente.\nCotización: ${quote.publicId}\nReferencia: ${existingIncome.publicId}\nSolo se liquidó el saldo restante por ${formatCurrency(amountToApply)}.`,
        );

        return true;
      }

      const nextIncomeId = buildSequentialId("ING", incomes, "publicId");
      const mergedNotes = buildPaymentNote({
        paymentDate,
        paymentType: "total",
        paidAmount: quoteTotal,
        remainingAmount: 0,
        previousIncomeId: null,
        extraNotes: paymentNotes,
        existingNotes: "",
      });

      const newIncome = {
        id: Date.now(),
        publicId: nextIncomeId,
        quoteId: quote.id,
        quotePublicId: quote.publicId,
        client: quote.client,
        date: paymentDate,
        concept: `${quote.title} (${quote.publicId})`,
        totalAmount: quoteTotal,
        paidAmount: quoteTotal,
        remainingAmount: 0,
        paymentStatus: "Pagado",
        paymentMethod,
        invoiceRequired: quote.invoiceRequired,
        notes: mergedNotes,
        paymentHistory: [
          {
            type: "pago_total",
            date: paymentDate,
            amount: quoteTotal,
            remainingAmount: 0,
            method: paymentMethod,
            note: paymentNotes || "",
          },
        ],
      };

      incomes.push(newIncome);
      saveIncomes(incomes);

      const updatedQuotes = quotes.map((item) =>
        item.id === quoteId
          ? {
              ...item,
              paymentStatus: "pagada total",
              paymentMethod,
              paymentNotes: mergedNotes,
              totalPaid: quoteTotal,
              remainingAmount: 0,
              linkedIncomeId: nextIncomeId,
              paymentHistory: [
                ...(item.paymentHistory || []),
                {
                  type: "pago_total",
                  date: paymentDate,
                  amount: quoteTotal,
                  remainingAmount: 0,
                  method: paymentMethod,
                  note: paymentNotes || "",
                },
              ],
            }
          : item,
      );

      saveQuotes(updatedQuotes);
      renderQuotes();

      alert(
        `Pago total registrado correctamente.\nCotización: ${quote.publicId}\nIngreso generado: ${nextIncomeId}`,
      );

      return true;
    }

    return false;
  }

  function repairMissingIncomes() {
    const quotes = getQuotes();
    let incomes = ensureIncomeIds();
    let repaired = false;

    quotes.forEach((quote) => {
      const hasIncome = incomes.some((income) => income.quoteId === quote.id);

      if (
        !hasIncome &&
        (quote.paymentStatus === "pagada total" ||
          quote.paymentStatus === "anticipo pagado")
      ) {
        const nextIncomeId = buildSequentialId("ING", incomes, "publicId");
        const totalAmount = Number(quote.total) || 0;
        const isAdvance = quote.paymentStatus === "anticipo pagado";
        const paidAmount = isAdvance
          ? Number((totalAmount * 0.5).toFixed(2))
          : totalAmount;

        const remainingAmount = Number((totalAmount - paidAmount).toFixed(2));

        incomes.push({
          id: Date.now() + Math.floor(Math.random() * 1000),
          publicId: nextIncomeId,
          quoteId: quote.id,
          quotePublicId: quote.publicId,
          client: quote.client,
          date: quote.date || getTodayISO(),
          concept: `${quote.title} (${quote.publicId})`,
          totalAmount,
          paidAmount,
          remainingAmount,
          paymentStatus: isAdvance ? "Parcial" : "Pagado",
          paymentMethod: quote.paymentMethod || "",
          invoiceRequired: quote.invoiceRequired || "No",
          notes:
            quote.paymentNotes ||
            `Ingreso reconstruido automáticamente para ${quote.publicId}.`,
          paymentHistory: quote.paymentHistory || [],
        });

        repaired = true;
      }
    });

    if (repaired) {
      saveIncomes(incomes);
    }
  }

  function addTableEvents() {
    document.querySelectorAll(".pdf-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        const quote = getQuoteById(id);
        if (!quote) return;
        await generatePDF(quote);
      });
    });

    document.querySelectorAll(".manage-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        openManageModal(Number(btn.dataset.id));
      });
    });
  }

  function bindManageActions() {
    document.querySelectorAll(".manage-action").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!activeManageQuoteId) return;

        const action = btn.dataset.action;
        const value = btn.dataset.value;

        if (action === "edit") {
          handleEdit(activeManageQuoteId);
          return;
        }

        if (action === "delete") {
          handleDelete(activeManageQuoteId);
          return;
        }

        if (action === "status") {
          updateStatus(activeManageQuoteId, value);
          return;
        }

        if (action === "open-payment") {
          const quoteId = activeManageQuoteId;
          closeManageModal();
          openPaymentModal(quoteId, value);
        }
      });
    });
  }

  async function generatePDF(quote) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      unit: "pt",
      format: "letter",
    });

    const agencyName = getSettingsAgencyName();
    const agencyEmail = getSettingsAgencyEmail();
    const agencyPhone = getSettingsAgencyPhone();
    const agencyWebsite = getSettingsAgencyWebsite();
    const agencyAddress = getSettingsAgencyAddress();
    const defaultTerms = getDefaultTerms();
    const defaultInvoiceNote = getDefaultInvoiceNote();

    const dynamicNotes = [quote.notes || "", defaultInvoiceNote || ""]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .join("\n\n");

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 50;
    const contentWidth = pageWidth - marginX * 2;
    let y = 0;

    const colors = {
      primary: [98, 117, 243],
      secondary: [138, 107, 239],
      accent: [183, 101, 229],
      highlight: [217, 94, 201],
      dark: [35, 35, 45],
      text: [55, 55, 65],
      muted: [110, 110, 125],
      lightBg: [248, 246, 252],
      border: [226, 220, 240],
    };

    function money(value) {
      return Number(value || 0).toLocaleString("es-MX", {
        style: "currency",
        currency: "MXN",
      });
    }

    function split(text, size = 11) {
      doc.setFontSize(size);
      return doc.splitTextToSize(String(text || ""), contentWidth);
    }

    function ensureSpace(spaceNeeded = 40) {
      if (y + spaceNeeded > pageHeight - 50) {
        doc.addPage();
        y = 50;
      }
    }

    function drawGradientHeader(
      x,
      yPos,
      width,
      height,
      startColor,
      endColor,
      steps = 100,
    ) {
      const [r1, g1, b1] = startColor;
      const [r2, g2, b2] = endColor;

      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);
        doc.setFillColor(r, g, b);
        doc.rect(x + (width / steps) * i, yPos, width / steps + 1, height, "F");
      }
    }

    function drawSectionTitle(title) {
      ensureSpace(40);
      doc.setTextColor(...colors.primary);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(title, marginX, y);
      y += 10;

      doc.setDrawColor(...colors.secondary);
      doc.setLineWidth(1.2);
      doc.line(marginX, y, pageWidth - marginX, y);
      y += 20;
    }

    function drawInfoCard() {
      ensureSpace(100);

      doc.setFillColor(...colors.lightBg);
      doc.setDrawColor(...colors.border);
      doc.roundedRect(marginX, y, contentWidth, 82, 10, 10, "FD");

      doc.setTextColor(...colors.dark);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`ID: ${quote.publicId || "-"}`, marginX + 16, y + 24);
      doc.text(`Cliente: ${quote.client}`, marginX + 16, y + 44);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(...colors.text);
      doc.text(`Fecha: ${quote.date}`, marginX + 16, y + 66);

      y += 106;
    }

    function drawParagraph(text, size = 11, color = colors.text, extra = 10) {
      const lines = split(text, size);
      ensureSpace(lines.length * 16 + extra);

      doc.setTextColor(...color);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(size);
      doc.text(lines, marginX, y);
      y += lines.length * 16 + extra;
    }

    function drawBulletList(text) {
      const items = String(text || "")
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);

      if (items.length === 0) {
        drawParagraph("-", 11);
        return;
      }

      items.forEach((item) => {
        const bulletText = `• ${item}`;
        const lines = doc.splitTextToSize(bulletText, contentWidth - 10);
        ensureSpace(lines.length * 15 + 4);

        doc.setTextColor(...colors.text);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.text(lines, marginX, y);
        y += lines.length * 15 + 4;
      });

      y += 6;
    }

    function drawTotalsBox() {
      ensureSpace(130);

      const boxWidth = 240;
      const boxX = pageWidth - marginX - boxWidth;
      const rowH = 26;

      doc.setFillColor(...colors.lightBg);
      doc.setDrawColor(...colors.border);
      doc.roundedRect(boxX, y, boxWidth, 98, 10, 10, "FD");

      doc.setTextColor(...colors.text);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);

      doc.text("Subtotal", boxX + 16, y + 22);
      doc.text(money(quote.subtotal), boxX + boxWidth - 16, y + 22, {
        align: "right",
      });

      doc.text("IVA", boxX + 16, y + 22 + rowH);
      doc.text(money(quote.iva), boxX + boxWidth - 16, y + 22 + rowH, {
        align: "right",
      });

      doc.setDrawColor(...colors.border);
      doc.line(
        boxX + 12,
        y + 22 + rowH + 10,
        boxX + boxWidth - 12,
        y + 22 + rowH + 10,
      );

      doc.setFont("helvetica", "bold");
      doc.setTextColor(...colors.highlight);
      doc.setFontSize(14);
      doc.text("Total", boxX + 16, y + 22 + rowH * 2 + 4);
      doc.text(
        money(quote.total),
        boxX + boxWidth - 16,
        y + 22 + rowH * 2 + 4,
        { align: "right" },
      );

      y += 120;
    }

    async function loadImageAsDataURL(path) {
      const response = await fetch(path);
      const blob = await response.blob();

      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    async function drawHeader() {
      drawGradientHeader(
        0,
        0,
        pageWidth,
        100,
        [98, 117, 243],
        [217, 94, 201],
        100,
      );

      try {
        const logoData = await loadImageAsDataURL(
          "assets/logos/logo-morfo.png",
        );
        doc.addImage(logoData, "PNG", marginX, 10, 150, 90);
      } catch (error) {
        console.error("No se pudo cargar el logo:", error);
      }

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(22);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);

      doc.setFillColor(...colors.accent);
      doc.roundedRect(pageWidth - 175, 28, 125, 30, 8, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text("COTIZACIÓN", pageWidth - 112, 47, { align: "center" });

      y = 130;

      doc.setTextColor(...colors.dark);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(agencyName, marginX, 112);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);

      const contactParts = [
        agencyEmail,
        agencyPhone,
        agencyWebsite,
        agencyAddress,
      ].filter(Boolean);

      if (contactParts.length > 0) {
        doc.setTextColor(...colors.muted);
        doc.text(contactParts.join("  |  "), marginX, 128);
      }
    }

    await drawHeader();
    drawInfoCard();

    drawSectionTitle("Título de la propuesta");
    drawParagraph(quote.title, 15, colors.dark, 18);

    drawSectionTitle("Tipo de servicio");
    drawParagraph(quote.serviceType, 11, colors.text, 18);

    drawSectionTitle("Descripción general");
    drawParagraph(quote.description || "-", 11, colors.text, 18);

    drawSectionTitle("Incluye");
    drawBulletList(quote.includes);

    drawSectionTitle("Resumen económico");
    drawTotalsBox();

    drawSectionTitle("Condiciones y observaciones");
    drawParagraph(dynamicNotes || defaultTerms || "-", 10.5, colors.text, 10);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...colors.muted);
    doc.text(
      `Gracias por considerar a ${agencyName} para este proyecto.`,
      marginX,
      pageHeight - 30,
    );

    doc.save(`cotizacion-${quote.publicId || quote.client}.pdf`);
  }

  document
    .getElementById("quote-subtotal")
    .addEventListener("input", calculateTotals);
  document
    .getElementById("quote-invoice")
    .addEventListener("change", calculateTotals);

  manageCloseBtn.addEventListener("click", closeManageModal);
  manageOverlay.addEventListener("click", closeManageModal);

  if (paymentCloseBtn) {
    paymentCloseBtn.addEventListener("click", closePaymentModal);
  }

  if (paymentOverlay) {
    paymentOverlay.addEventListener("click", closePaymentModal);
  }

  paymentForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!activePaymentQuoteId || !activePaymentType) {
      alert("No hay una cotización seleccionada para registrar el pago.");
      return;
    }

    const paymentDate = document.getElementById("payment-date").value;
    const amountPaid = Number(document.getElementById("payment-amount").value);
    const paymentMethod = document.getElementById("payment-method").value;
    const dueDate = document.getElementById("payment-due-date").value;
    const paymentNotes = document.getElementById("payment-notes").value.trim();

    if (!paymentDate || !amountPaid || !paymentMethod) {
      alert("Completa los campos obligatorios del pago.");
      return;
    }

    const saved = registerPayment({
      quoteId: activePaymentQuoteId,
      paymentType: activePaymentType,
      paymentDate,
      amountPaid,
      paymentMethod,
      dueDate,
      paymentNotes,
    });

    if (saved) {
      closePaymentModal();
    }
  });

  quoteForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const client = document.getElementById("quote-client").value;
    const date = document.getElementById("quote-date").value;
    const title = document.getElementById("quote-title").value.trim();
    const serviceType = document.getElementById("quote-service-type").value;
    const description = document
      .getElementById("quote-description")
      .value.trim();
    const includes = document.getElementById("quote-includes").value.trim();
    const subtotal = Number(document.getElementById("quote-subtotal").value);
    const invoiceValue = document.getElementById("quote-invoice").value;
    const iva = Number(document.getElementById("quote-iva").value) || 0;
    const total = Number(document.getElementById("quote-total").value) || 0;
    const rawNotes = document.getElementById("quote-notes").value.trim();
    const notes = rawNotes || getDefaultTerms();

    if (
      !client ||
      !date ||
      !title ||
      !serviceType ||
      !subtotal ||
      !invoiceValue
    ) {
      alert("Completa los campos obligatorios.");
      return;
    }

    let quotes = getQuotes();

    if (editingQuoteId) {
      const currentQuote = quotes.find((q) => q.id === editingQuoteId);

      quotes = quotes.map((quote) =>
        quote.id === editingQuoteId
          ? {
              ...quote,
              client,
              date,
              title,
              serviceType,
              description,
              includes,
              subtotal,
              invoiceRequired: invoiceValue === "yes" ? "Sí" : "No",
              iva,
              total,
              notes,
              publicId: currentQuote?.publicId || quote.publicId,
              paymentHistory: quote.paymentHistory || [],
            }
          : quote,
      );

      saveQuotes(quotes);
    } else {
      const existingQuotes = getQuotes();
      const newQuote = {
        id: Date.now(),
        publicId: buildSequentialId("COT", existingQuotes, "publicId"),
        client,
        date,
        title,
        serviceType,
        description,
        includes,
        subtotal,
        invoiceRequired: invoiceValue === "yes" ? "Sí" : "No",
        iva,
        total,
        notes,
        status: "borrador",
        paymentStatus: "no pagada",
        totalPaid: 0,
        remainingAmount: total,
        paymentHistory: [],
      };

      existingQuotes.push(newQuote);
      saveQuotes(existingQuotes);
    }

    syncQuotesWithIncomes();
    renderQuotes();
    resetForm();
    loadClientOptions();
    loadFilterOptions();
  });

  ensureQuoteIds();
  ensureIncomeIds();
  repairMissingIncomes();
  syncQuotesWithIncomes();
  ensureFilterUI();
  bindManageActions();
  loadClientOptions();
  renderQuotes();
  resetForm();

  window.addEventListener("focus", () => {
    if (!editingQuoteId) {
      applyDefaultTermsToQuoteForm(true);
      calculateTotals();
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key === SETTINGS_KEY && !editingQuoteId) {
      applyDefaultTermsToQuoteForm(true);
      calculateTotals();
    }
  });
});
