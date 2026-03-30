document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEY = "morfo_settings";

  // ===== FORMS =====
  const agencyForm = document.querySelectorAll("form")[0];
  const termsForm = document.querySelectorAll("form")[1];
  const invoiceForm = document.querySelectorAll("form")[2];

  // ===== INPUTS =====
  const agencyName = document.getElementById("agency-name");
  const agencyEmail = document.getElementById("agency-email");
  const agencyPhone = document.getElementById("agency-phone");
  const agencyAddress = document.getElementById("agency-address");
  const agencyWebsite = document.getElementById("agency-website");

  const defaultTerms = document.getElementById("default-terms");

  const invoiceTax = document.getElementById("invoice-tax");
  const invoiceNote = document.getElementById("invoice-note");

  // ===== GET SETTINGS =====
  function getSettings() {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  }

  // ===== SAVE SETTINGS =====
  function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  // ===== LOAD SETTINGS =====
  function loadSettings() {
    const settings = getSettings();

    // Agencia
    agencyName.value = settings.agency?.name || "Morfo Studio";
    agencyEmail.value = settings.agency?.email || "";
    agencyPhone.value = settings.agency?.phone || "";
    agencyAddress.value = settings.agency?.address || "";
    agencyWebsite.value = settings.agency?.website || "";

    // Terms
    defaultTerms.value = settings.terms || defaultTerms.value;

    // Invoice
    invoiceTax.value = settings.invoice?.tax || 16;
    invoiceNote.value = settings.invoice?.note || invoiceNote.value;

    updateSummaryTable(settings);
  }

  // ===== UPDATE TABLE =====
  function updateSummaryTable(settings) {
    const rows = document.querySelectorAll(".table tbody tr");

    if (!rows.length) return;

    rows[0].children[1].textContent = settings.agency?.name || "Morfo Studio";

    rows[1].children[1].textContent = (settings.invoice?.tax || 16) + "%";

    rows[2].children[1].textContent = settings.terms?.includes("50%")
      ? "50%"
      : "50%";
  }

  // ===== SAVE AGENCY =====
  agencyForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const settings = getSettings();

    settings.agency = {
      name: agencyName.value,
      email: agencyEmail.value,
      phone: agencyPhone.value,
      address: agencyAddress.value,
      website: agencyWebsite.value,
    };

    saveSettings(settings);
    updateSummaryTable(settings);

    alert("Datos de la agencia guardados");
  });

  // ===== SAVE TERMS =====
  termsForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const settings = getSettings();

    settings.terms = defaultTerms.value;

    saveSettings(settings);
    updateSummaryTable(settings);

    alert("Condiciones guardadas");
  });

  // ===== SAVE INVOICE =====
  invoiceForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const settings = getSettings();

    settings.invoice = {
      tax: Number(invoiceTax.value),
      note: invoiceNote.value,
    };

    saveSettings(settings);
    updateSummaryTable(settings);

    alert("Ajustes fiscales guardados");
  });

  // ===== INIT =====
  loadSettings();
});
