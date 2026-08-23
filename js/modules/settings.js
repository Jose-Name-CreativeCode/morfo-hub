import { protectPage } from "../services/auth.js";
import {
  getSettingsRecord,
  saveSettingsRecord,
} from "../services/settings-service.js";
import {
  askConfirm,
  setButtonLoading,
  setPageLoading,
  showToast,
} from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  setPageLoading(true);
  await protectPage();

  // ===== FORMS =====
  const settingsForm = document.getElementById("settings-form");
  const serviceTemplatesForm = document.querySelectorAll("form")[1];

  // ===== INPUTS =====
  const agencyName = document.getElementById("agency-name");
  const agencyEmail = document.getElementById("agency-email");
  const agencyPhone = document.getElementById("agency-phone");
  const agencyAddress = document.getElementById("agency-address");
  const agencyWebsite = document.getElementById("agency-website");

  const defaultTerms = document.getElementById("default-terms");

  const invoiceTax = document.getElementById("invoice-tax");
  const invoiceNote = document.getElementById("invoice-note");
  const advancePercent = document.getElementById("advance-percent");
  const paymentMethods = document.getElementById("payment-methods");
  const bankDetailsInvoice = document.getElementById("bank-details-invoice");
  const bankDetailsNoInvoice = document.getElementById(
    "bank-details-no-invoice",
  );
  const legalNote = document.getElementById("legal-note");
  const serviceTemplateSelect = document.getElementById(
    "service-template-select",
  );
  const addServiceTemplateButton = document.getElementById(
    "add-service-template",
  );
  const deleteServiceTemplateButton = document.getElementById(
    "delete-service-template",
  );
  const serviceTemplateName = document.getElementById("service-template-name");
  const serviceTemplateTitle = document.getElementById("service-template-title");
  const serviceTemplateDescription = document.getElementById(
    "service-template-description",
  );
  const serviceTemplateIncludes = document.getElementById(
    "service-template-includes",
  );
  const summaryTableBody = document.querySelector(".table tbody");
  let currentSettings = null;

  function getServiceTemplates() {
    return currentSettings?.serviceTemplates || {};
  }

  function getSelectedServiceTemplateName() {
    return serviceTemplateSelect.value || "";
  }

  function setServiceTemplateEditor(serviceName) {
    const templates = getServiceTemplates();
    const template = templates[serviceName] || {};

    serviceTemplateName.value = serviceName || "";
    serviceTemplateTitle.value = template.title || "";
    serviceTemplateDescription.value = template.description || "";
    serviceTemplateIncludes.value = template.includes || "";
    deleteServiceTemplateButton.disabled = !serviceName;
  }

  function renderServiceTemplateSelect(selectedService = "") {
    const templates = getServiceTemplates();
    const serviceNames = Object.keys(templates).sort((a, b) =>
      a.localeCompare(b, "es-MX"),
    );

    serviceTemplateSelect.replaceChildren();

    serviceNames.forEach((serviceName) => {
      const option = document.createElement("option");
      option.value = serviceName;
      option.textContent = serviceName;
      serviceTemplateSelect.appendChild(option);
    });

    const nextSelected = serviceNames.includes(selectedService)
      ? selectedService
      : serviceNames[0] || "";

    serviceTemplateSelect.value = nextSelected;
    setServiceTemplateEditor(nextSelected);
  }

  function getEditedServiceTemplates() {
    const templates = {
      ...getServiceTemplates(),
    };
    const previousName = getSelectedServiceTemplateName();
    const nextName = serviceTemplateName.value.trim();

    if (previousName && previousName !== nextName) {
      delete templates[previousName];
    }

    if (nextName) {
      templates[nextName] = {
        title: serviceTemplateTitle.value.trim(),
        description: serviceTemplateDescription.value.trim(),
        includes: serviceTemplateIncludes.value.trim(),
      };
    }

    return templates;
  }

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

    // Advanced
    advancePercent.value = settings.commercial?.advancePercent || 50;
    paymentMethods.value = (settings.commercial?.paymentMethods || []).join(
      "\n",
    );
    bankDetailsInvoice.value =
      settings.commercial?.bankDetailsInvoice ||
      settings.commercial?.bankDetails ||
      "";
    bankDetailsNoInvoice.value =
      settings.commercial?.bankDetailsNoInvoice || "";
    legalNote.value = settings.commercial?.legalNote || "";
    renderServiceTemplateSelect();

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
        value: `${settings.commercial?.advancePercent || 50}%`,
      },
      {
        label: "Métodos de pago",
        value: (settings.commercial?.paymentMethods || []).join(", ") || "-",
      },
      {
        label: "Datos bancarios",
        value:
          settings.commercial?.bankDetailsInvoice ||
          settings.commercial?.bankDetailsNoInvoice ||
          settings.commercial?.bankDetails
            ? "Configurados"
            : "Pendientes",
      },
      {
        label: "Plantillas de servicios",
        value: `${Object.keys(settings.serviceTemplates || {}).length} configuradas`,
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

  // ===== SAVE SETTINGS =====
  settingsForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const button = settingsForm.querySelector(".btn-primary");
    setButtonLoading(button, true, "Guardando...");

    try {
      const methods = paymentMethods.value
        .split("\n")
        .map((method) => method.trim())
        .filter(Boolean);

      const settings = await saveSettingsRecord({
        ...currentSettings,
        agency: {
          name: agencyName.value,
          email: agencyEmail.value,
          phone: agencyPhone.value,
          address: agencyAddress.value,
          website: agencyWebsite.value,
        },
        terms: defaultTerms.value,
        invoice: {
          tax: Number(invoiceTax.value),
          note: invoiceNote.value,
        },
        commercial: {
          advancePercent: Number(advancePercent.value) || 0,
          paymentMethods: methods,
          bankDetailsInvoice: bankDetailsInvoice.value,
          bankDetailsNoInvoice: bankDetailsNoInvoice.value,
          legalNote: legalNote.value,
        },
      });

      currentSettings = settings;
      updateSummaryTable(settings);

      showToast("Configuración guardada correctamente.", { type: "success" });
    } finally {
      setButtonLoading(button, false);
    }
  });

  // ===== SAVE SERVICE TEMPLATES =====
  serviceTemplatesForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const button = serviceTemplatesForm.querySelector(".btn-primary");
    setButtonLoading(button, true, "Guardando...");

    try {
      const serviceTemplates = getEditedServiceTemplates();
      const selectedService = serviceTemplateName.value.trim();

      const settings = await saveSettingsRecord({
        ...currentSettings,
        serviceTemplates,
      });

      currentSettings = settings;
      renderServiceTemplateSelect(selectedService);
      updateSummaryTable(settings);

      showToast("Plantillas de servicios guardadas.", { type: "success" });
    } finally {
      setButtonLoading(button, false);
    }
  });

  serviceTemplateSelect.addEventListener("change", () => {
    setServiceTemplateEditor(getSelectedServiceTemplateName());
  });

  addServiceTemplateButton.addEventListener("click", () => {
    serviceTemplateSelect.value = "";
    serviceTemplateName.value = "";
    serviceTemplateTitle.value = "";
    serviceTemplateDescription.value = "";
    serviceTemplateIncludes.value = "";
    deleteServiceTemplateButton.disabled = true;
    serviceTemplateName.focus();
  });

  deleteServiceTemplateButton.addEventListener("click", async () => {
    const selectedService = getSelectedServiceTemplateName();
    if (!selectedService) return;

    const confirmed = await askConfirm({
      title: "Eliminar plantilla",
      message: `¿Eliminar la plantilla "${selectedService}"? También dejará de aparecer como tipo de servicio en cotizaciones.`,
      confirmText: "Eliminar",
      cancelText: "Cancelar",
    });

    if (!confirmed) return;

    const serviceTemplates = {
      ...getServiceTemplates(),
    };
    delete serviceTemplates[selectedService];

    const settings = await saveSettingsRecord({
      ...currentSettings,
      serviceTemplates,
    });

    currentSettings = settings;
    renderServiceTemplateSelect();
    updateSummaryTable(settings);
    showToast("Plantilla eliminada.", { type: "success" });
  });

  // ===== INIT =====
  try {
    await loadSettings();
  } finally {
    setPageLoading(false);
  }
});
