import { protectPage } from "../services/auth.js";
import {
  getSettingsRecord,
  saveSettingsRecord,
} from "../services/settings-service.js";
import { setButtonLoading, setPageLoading, showToast } from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  setPageLoading(true);
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
  const summaryTableBody = document.querySelector(".table tbody");
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
    if (!summaryTableBody) return;

    summaryTableBody.replaceChildren();

    const summaryRows = [
      {
        label: "Nombre de la agencia",
        value: settings.agency?.name || "Morfo Studio",
      },
      {
        label: "IVA por defecto",
        value: `${settings.invoice?.tax || 16}%`,
      },
      {
        label: "Anticipo sugerido",
        value: "50%",
      },
    ];

    summaryRows.forEach((item) => {
      const row = document.createElement("tr");
      const labelCell = document.createElement("td");
      const valueCell = document.createElement("td");

      labelCell.textContent = item.label;
      valueCell.textContent = item.value;

      row.appendChild(labelCell);
      row.appendChild(valueCell);
      summaryTableBody.appendChild(row);
    });
  }

  // ===== SAVE AGENCY =====
  agencyForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const button = agencyForm.querySelector(".btn-primary");
    setButtonLoading(button, true, "Guardando...");

    try {
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

      showToast("Datos de la agencia guardados.", { type: "success" });
    } finally {
      setButtonLoading(button, false);
    }
  });

  // ===== SAVE TERMS =====
  termsForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const button = termsForm.querySelector(".btn-primary");
    setButtonLoading(button, true, "Guardando...");

    try {
      const settings = await saveSettingsRecord({
        ...currentSettings,
        terms: defaultTerms.value,
      });

      currentSettings = settings;
      updateSummaryTable(settings);

      showToast("Condiciones guardadas.", { type: "success" });
    } finally {
      setButtonLoading(button, false);
    }
  });

  // ===== SAVE INVOICE =====
  invoiceForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const button = invoiceForm.querySelector(".btn-primary");
    setButtonLoading(button, true, "Guardando...");

    try {
      const settings = await saveSettingsRecord({
        ...currentSettings,
        invoice: {
          tax: Number(invoiceTax.value),
          note: invoiceNote.value,
        },
      });

      currentSettings = settings;
      updateSummaryTable(settings);

      showToast("Ajustes fiscales guardados.", { type: "success" });
    } finally {
      setButtonLoading(button, false);
    }
  });

  // ===== INIT =====
  try {
    await loadSettings();
  } finally {
    setPageLoading(false);
  }
});
