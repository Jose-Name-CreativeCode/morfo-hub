import { protectPage } from "../services/auth.js";
import {
  getSettingsRecord,
  saveSettingsRecord,
} from "../services/settings-service.js";

document.addEventListener("DOMContentLoaded", async () => {
  await protectPage();

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
  let currentSettings = null;

  // ===== LOAD SETTINGS =====
  async function loadSettings() {
    const settings = await getSettingsRecord();
    currentSettings = settings;

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
  agencyForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const settings = await saveSettingsRecord({
      ...currentSettings,
      agency: {
      name: agencyName.value,
      email: agencyEmail.value,
      phone: agencyPhone.value,
      address: agencyAddress.value,
      website: agencyWebsite.value,
      },
    });

    currentSettings = settings;
    updateSummaryTable(settings);

    alert("Datos de la agencia guardados");
  });

  // ===== SAVE TERMS =====
  termsForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const settings = await saveSettingsRecord({
      ...currentSettings,
      terms: defaultTerms.value,
    });

    currentSettings = settings;
    updateSummaryTable(settings);

    alert("Condiciones guardadas");
  });

  // ===== SAVE INVOICE =====
  invoiceForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const settings = await saveSettingsRecord({
      ...currentSettings,
      invoice: {
        tax: Number(invoiceTax.value),
        note: invoiceNote.value,
      },
    });

    currentSettings = settings;
    updateSummaryTable(settings);

    alert("Ajustes fiscales guardados");
  });

  // ===== INIT =====
  await loadSettings();
});
