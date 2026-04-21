import { protectPage } from "../services/auth.js";
import {
  deleteClientRecord,
  getClientsCollection,
  saveClientRecord,
} from "../services/clients-service.js";
import { getIncomeCollection } from "../services/income-service.js";
import { getQuotesCollection } from "../services/quotes-service.js";
import {
  askConfirm,
  formatCurrency,
  formatDate,
  normalizeText,
  setButtonLoading,
  setPageLoading,
  showToast,
} from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  setPageLoading(true);
  await protectPage();

  const clientForm = document.querySelector("form");
  const clientTableBody = document.querySelector(".table tbody");
  const submitButton = clientForm.querySelector(".btn-primary");
  const clientSearchInput = document.getElementById("client-search");
  const clientStatusFilter = document.getElementById("client-status-filter");
  const clearFiltersButton = document.getElementById("client-clear-filters");
  const clientCounters = {
    total: document.getElementById("clients-total"),
    active: document.getElementById("clients-active"),
    prospect: document.getElementById("clients-prospect"),
    inactive: document.getElementById("clients-inactive"),
  };
  const detailModal = document.getElementById("client-detail-modal");
  const detailOverlay = document.getElementById("client-detail-overlay");
  const detailCloseButton = document.getElementById("client-detail-close");
  const detailTitle = document.getElementById("client-detail-title");
  const detailMeta = document.getElementById("client-detail-meta");
  const detailQuotes = document.getElementById("client-detail-quotes");
  const detailIncome = document.getElementById("client-detail-income");
  const detailPending = document.getElementById("client-detail-pending");
  const detailLast = document.getElementById("client-detail-last");
  const detailNewQuoteLink = document.getElementById(
    "client-detail-new-quote",
  );
  const detailQuotesList = document.getElementById(
    "client-detail-quotes-list",
  );
  const detailIncomeList = document.getElementById("client-detail-income-list");
  let editingClientId = null;
  let currentClients = [];
  let currentQuotes = [];
  let currentIncomes = [];
  let searchTerm = "";
  let statusFilter = "";

  function resetForm() {
    clientForm.reset();
    editingClientId = null;
    submitButton.textContent = "Guardar cliente";
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

  function getClientRelatedData(client) {
    const clientName = normalizeText(client.name);
    const quotes = currentQuotes.filter(
      (quote) => normalizeText(quote.client) === clientName,
    );
    const incomes = currentIncomes.filter(
      (income) => normalizeText(income.client) === clientName,
    );
    const totalIncome = incomes.reduce(
      (sum, income) => sum + Number(income.paidAmount || 0),
      0,
    );
    const pendingBalance = incomes.reduce(
      (sum, income) => sum + Number(income.remainingAmount || 0),
      0,
    );
    const dates = [...quotes, ...incomes]
      .map((item) => item.date)
      .filter(Boolean)
      .sort((a, b) => String(b).localeCompare(String(a)));

    return {
      quotes,
      incomes,
      totalIncome,
      pendingBalance,
      lastActivity: dates[0] || "",
    };
  }

  function updateClientCounters() {
    const stats = currentClients.reduce(
      (acc, client) => {
        const status = normalizeText(client.status);
        acc.total += 1;

        if (status === "activo") acc.active += 1;
        if (status === "prospecto") acc.prospect += 1;
        if (status === "inactivo") acc.inactive += 1;

        return acc;
      },
      {
        total: 0,
        active: 0,
        prospect: 0,
        inactive: 0,
      },
    );

    clientCounters.total.textContent = stats.total;
    clientCounters.active.textContent = stats.active;
    clientCounters.prospect.textContent = stats.prospect;
    clientCounters.inactive.textContent = stats.inactive;
  }

  function getFilteredClients() {
    const normalizedSearch = normalizeText(searchTerm);
    const normalizedStatus = normalizeText(statusFilter);

    return currentClients.filter((client) => {
      const matchesStatus =
        !normalizedStatus || normalizeText(client.status) === normalizedStatus;
      const searchableText = [
        client.name,
        client.contact,
        client.email,
        client.phone,
      ]
        .map(normalizeText)
        .join(" ");
      const matchesSearch =
        !normalizedSearch || searchableText.includes(normalizedSearch);

      return matchesStatus && matchesSearch;
    });
  }

  function createDetailItem({ title, meta, amount }) {
    const item = document.createElement("article");
    item.className = "client-detail-item";

    const itemTitle = document.createElement("strong");
    itemTitle.textContent = title;

    const itemMeta = document.createElement("span");
    itemMeta.textContent = meta;

    item.appendChild(itemTitle);
    item.appendChild(itemMeta);

    if (amount) {
      const itemAmount = document.createElement("p");
      itemAmount.textContent = amount;
      item.appendChild(itemAmount);
    }

    return item;
  }

  function renderDetailList(container, items, emptyMessage, renderItem) {
    container.replaceChildren();

    if (items.length === 0) {
      container.textContent = emptyMessage;
      return;
    }

    items.slice(0, 5).forEach((item) => {
      container.appendChild(renderItem(item));
    });
  }

  function openClientDetail(clientId) {
    const client = currentClients.find(
      (item) => String(item.id) === String(clientId),
    );
    if (!client) return;

    const related = getClientRelatedData(client);

    detailTitle.textContent = client.name;
    detailMeta.textContent = `${client.contact} · ${client.email} · ${client.status}`;
    detailQuotes.textContent = String(related.quotes.length);
    detailIncome.textContent = formatCurrency(related.totalIncome);
    detailPending.textContent = formatCurrency(related.pendingBalance);
    detailLast.textContent = related.lastActivity
      ? formatDate(related.lastActivity)
      : "-";
    detailNewQuoteLink.href = `quotes.html?client=${encodeURIComponent(client.name)}`;

    renderDetailList(
      detailQuotesList,
      related.quotes,
      "Sin cotizaciones todavía.",
      (quote) =>
        createDetailItem({
          title: `${quote.publicId || "-"} · ${quote.title || "-"}`,
          meta: `${formatDate(quote.date)} · ${quote.status || "-"} · ${quote.paymentStatus || "sin pago"}`,
          amount: formatCurrency(quote.total || 0),
        }),
    );

    renderDetailList(
      detailIncomeList,
      related.incomes,
      "Sin ingresos todavía.",
      (income) =>
        createDetailItem({
          title: `${income.publicId || "-"} · ${income.concept || "-"}`,
          meta: `${formatDate(income.date)} · ${income.paymentStatus || "-"}`,
          amount: `${formatCurrency(income.paidAmount || 0)} pagado · ${formatCurrency(income.remainingAmount || 0)} pendiente`,
        }),
    );

    detailModal.classList.add("open");
    detailOverlay.classList.add("open");
  }

  function closeClientDetail() {
    detailModal.classList.remove("open");
    detailOverlay.classList.remove("open");
  }

  async function renderClients() {
    [currentClients, currentQuotes, currentIncomes] = await Promise.all([
      getClientsCollection(),
      getQuotesCollection(),
      getIncomeCollection(),
    ]);
    updateClientCounters();
    clientTableBody.replaceChildren();

    const visibleClients = getFilteredClients();

    if (visibleClients.length === 0) {
      clientTableBody.appendChild(
        createEmptyStateRow("No hay clientes que coincidan con el filtro.", 9),
      );
      return;
    }

    visibleClients.forEach((client) => {
      const row = document.createElement("tr");
      if (normalizeText(client.status) === "inactivo") {
        row.classList.add("muted-row");
      }

      row.appendChild(createCell(client.name));
      row.appendChild(createCell(client.contact));
      row.appendChild(createCell(client.email));
      row.appendChild(createCell(client.phone));
      row.appendChild(createCell(client.status));
      row.appendChild(createCell(client.invoiceRequired));

      const detailCell = document.createElement("td");
      const detailButton = document.createElement("button");
      detailButton.type = "button";
      detailButton.className = "pdf-btn client-detail-btn";
      detailButton.dataset.id = String(client.id);
      detailButton.textContent = "Ver";
      detailCell.appendChild(detailButton);
      row.appendChild(detailCell);

      const editCell = document.createElement("td");
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "edit-btn";
      editButton.dataset.id = String(client.id);
      editButton.textContent = "Editar";
      editCell.appendChild(editButton);
      row.appendChild(editCell);

      const deleteCell = document.createElement("td");
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "delete-btn";
      deleteButton.dataset.id = String(client.id);
      deleteButton.textContent = "Eliminar";
      deleteCell.appendChild(deleteButton);
      row.appendChild(deleteCell);

      clientTableBody.appendChild(row);
    });

    addTableEvents();
  }

  function fillForm(client) {
    document.getElementById("client-name").value = client.name;
    document.getElementById("client-contact").value = client.contact;
    document.getElementById("client-email").value = client.email;
    document.getElementById("client-phone").value = client.phone;
    document.getElementById("client-status").value = client.status;
    document.getElementById("client-invoice").value =
      client.invoiceRequired === "Sí" ? "yes" : "no";
    document.getElementById("client-notes").value = client.notes || "";

    editingClientId = client.id;
    submitButton.textContent = "Actualizar cliente";
  }

  function handleEdit(clientId) {
    const clientToEdit = currentClients.find(
      (client) => String(client.id) === String(clientId),
    );

    if (!clientToEdit) return;

    fillForm(clientToEdit);
  }

  async function handleDelete(clientId) {
    const client = currentClients.find(
      (item) => String(item.id) === String(clientId),
    );
    if (!client) return;

    const related = getClientRelatedData(client);
    const hasHistory =
      related.quotes.length > 0 || related.incomes.length > 0;

    if (hasHistory) {
      const confirmed = await askConfirm({
        title: "Desactivar cliente",
        message:
          `${client.name} tiene ${related.quotes.length} cotizaciones y ${related.incomes.length} ingresos relacionados. ` +
          "Para proteger reportes e historial financiero no se eliminará. ¿Quieres marcarlo como Inactivo?",
        confirmText: "Desactivar",
      });

      if (!confirmed) return;

      try {
        await saveClientRecord({
          ...client,
          status: "Inactivo",
          notes: client.notes || "",
        });

        if (String(editingClientId) === String(clientId)) {
          resetForm();
        }

        await renderClients();
        showToast("Cliente marcado como Inactivo.", { type: "success" });
      } catch (error) {
        console.error("No se pudo desactivar el cliente:", error);
        showToast(
          error?.message ||
            "No se pudo desactivar el cliente. Revisa permisos o conexión.",
          { type: "error", duration: 4200 },
        );
      }

      return;
    }

    const confirmed = await askConfirm({
      title: "Eliminar cliente",
      message: `¿Seguro que quieres eliminar a ${client.name}? No tiene cotizaciones ni ingresos relacionados.`,
      confirmText: "Eliminar",
    });
    if (!confirmed) return;

    try {
      await deleteClientRecord(clientId);

      if (editingClientId === clientId) {
        resetForm();
      }

      await renderClients();
      showToast("Cliente eliminado correctamente.", { type: "success" });
    } catch (error) {
      console.error("No se pudo eliminar el cliente:", error);
      showToast(
        error?.message ||
          "No se pudo eliminar el cliente. Revisa permisos o conexión.",
        { type: "error", duration: 4200 },
      );
    }
  }

  function addTableEvents() {
    const detailButtons = document.querySelectorAll(".client-detail-btn");
    const editButtons = document.querySelectorAll(".edit-btn");
    const deleteButtons = document.querySelectorAll(".delete-btn");

    detailButtons.forEach((button) => {
      button.addEventListener("click", () => {
        openClientDetail(button.dataset.id);
      });
    });

    editButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const clientId = button.dataset.id;
        handleEdit(clientId);
      });
    });

    deleteButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const clientId = button.dataset.id;
        await handleDelete(clientId);
      });
    });
  }

  clientForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("client-name").value.trim();
    const contact = document.getElementById("client-contact").value.trim();
    const email = document.getElementById("client-email").value.trim();
    const phone = document.getElementById("client-phone").value.trim();
    const status = document.getElementById("client-status").value;
    const invoiceRequired = document.getElementById("client-invoice").value;
    const notes = document.getElementById("client-notes").value.trim();

    if (!name || !contact || !email || !phone || !status || !invoiceRequired) {
      showToast("Por favor, completa todos los campos obligatorios.", {
        type: "error",
      });
      return;
    }

    setButtonLoading(
      submitButton,
      true,
      editingClientId ? "Actualizando..." : "Guardando...",
    );

    try {
      const savedClient = await saveClientRecord({
        id: editingClientId,
        name,
        contact,
        email,
        phone,
        status,
        invoiceRequired: invoiceRequired === "yes" ? "Sí" : "No",
        notes,
      });

      if (editingClientId) {
        currentClients = currentClients.map((client) =>
          String(client.id) === String(editingClientId) ? savedClient : client,
        );
      } else {
        currentClients = [savedClient, ...currentClients];
      }

      resetForm();
      await renderClients();
      showToast("Cliente guardado correctamente.", { type: "success" });
    } catch (error) {
      console.error("No se pudo guardar el cliente:", error);
      showToast(
        error?.message ||
          "No se pudo guardar el cliente. Revisa permisos o conexión.",
        { type: "error", duration: 5000 },
      );
    } finally {
      setButtonLoading(submitButton, false);
    }
  });

  detailCloseButton.addEventListener("click", closeClientDetail);
  detailOverlay.addEventListener("click", closeClientDetail);

  clientSearchInput.addEventListener("input", (event) => {
    searchTerm = event.target.value;
    void renderClients();
  });

  clientStatusFilter.addEventListener("change", (event) => {
    statusFilter = event.target.value;
    void renderClients();
  });

  clearFiltersButton.addEventListener("click", () => {
    searchTerm = "";
    statusFilter = "";
    clientSearchInput.value = "";
    clientStatusFilter.value = "";
    void renderClients();
  });

  try {
    await renderClients();
  } finally {
    setPageLoading(false);
  }
});
