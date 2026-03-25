document.addEventListener("DOMContentLoaded", () => {
  const quoteForm = document.querySelector("form");
  const quoteTableBody = document.querySelector(".table tbody");

  const STORAGE_KEY = "morfo_quotes";
  const IVA_RATE = 0.16;

  function getQuotes() {
    const quotes = localStorage.getItem(STORAGE_KEY);
    return quotes ? JSON.parse(quotes) : [];
  }

  function saveQuotes(quotes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
  }

  function formatCurrency(amount) {
    return Number(amount).toLocaleString("es-MX", {
      style: "currency",
      currency: "MXN",
    });
  }

  function calculateTotals() {
    const subtotalInput = document.getElementById("quote-subtotal");
    const invoiceSelect = document.getElementById("quote-invoice");
    const ivaInput = document.getElementById("quote-iva");
    const totalInput = document.getElementById("quote-total");

    const subtotal = Number(subtotalInput.value) || 0;
    const requiresInvoice = invoiceSelect.value === "yes";

    const iva = requiresInvoice ? subtotal * IVA_RATE : 0;
    const total = subtotal + iva;

    ivaInput.value = iva.toFixed(2);
    totalInput.value = total.toFixed(2);
  }

  function renderQuotes() {
    const quotes = getQuotes();
    quoteTableBody.innerHTML = "";

    if (quotes.length === 0) {
      quoteTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center;">No hay cotizaciones registradas.</td>
        </tr>
      `;
      return;
    }

    quotes.forEach((quote) => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${quote.date}</td>
        <td>${quote.client}</td>
        <td>${quote.title}</td>
        <td>${quote.serviceType}</td>
        <td>${formatCurrency(quote.subtotal)}</td>
        <td>${formatCurrency(quote.total)}</td>
        <td>${quote.invoiceRequired}</td>
      `;

      quoteTableBody.appendChild(row);
    });
  }

  function resetForm() {
    quoteForm.reset();
    document.getElementById("quote-iva").value = "";
    document.getElementById("quote-total").value = "";
  }

  document
    .getElementById("quote-subtotal")
    .addEventListener("input", calculateTotals);
  document
    .getElementById("quote-invoice")
    .addEventListener("change", calculateTotals);

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
    const notes = document.getElementById("quote-notes").value.trim();

    if (
      !client ||
      !date ||
      !title ||
      !serviceType ||
      !description ||
      !includes ||
      !subtotal ||
      !invoiceValue
    ) {
      alert("Por favor, completa todos los campos obligatorios.");
      return;
    }

    const newQuote = {
      id: Date.now(),
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
    };

    const quotes = getQuotes();
    quotes.push(newQuote);
    saveQuotes(quotes);

    renderQuotes();
    resetForm();
  });

  renderQuotes();
});
