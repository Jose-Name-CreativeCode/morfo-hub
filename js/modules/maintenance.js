import { protectPage } from "../services/auth.js";
import {
  deleteClientRecord,
  getClientsCollection,
  saveClientRecord,
} from "../services/clients-service.js";
import {
  deleteExpenseRecord,
  getExpensesCollection,
  saveExpenseRecord,
} from "../services/expenses-service.js";
import {
  deleteIncomeRecord,
  getIncomeCollection,
  saveIncomeRecord,
} from "../services/income-service.js";
import {
  deleteQuoteRecord,
  getQuotesCollection,
  saveQuoteRecord,
} from "../services/quotes-service.js";
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

  const issuesBody = document.getElementById("maintenanceIssuesBody");
  const refreshButton = document.getElementById("refresh-data-btn");
  const exportBackupButton = document.getElementById("export-backup-btn");
  const restoreBackupInput = document.getElementById("restore-backup-file");
  const restoreBackupButton = document.getElementById("restore-backup-btn");
  const backupPreview = document.getElementById("backup-preview");

  const counters = {
    clients: document.getElementById("count-clients"),
    income: document.getElementById("count-income"),
    expenses: document.getElementById("count-expenses"),
    quotes: document.getElementById("count-quotes"),
    alerts: document.getElementById("count-alerts"),
  };

  let currentData = {
    clients: [],
    incomes: [],
    expenses: [],
    quotes: [],
  };

  let currentIssues = [];
  let pendingBackup = null;

  function normalizeValue(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function createCell(text) {
    const cell = document.createElement("td");
    cell.textContent = text;
    return cell;
  }

  function createEmptyStateRow(message) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "table-empty-cell";
    cell.textContent = message;
    row.appendChild(cell);
    return row;
  }

  function getIncomeDuplicateKey(income) {
    if (income.quoteId) {
      return `quote:${normalizeValue(income.quoteId)}`;
    }

    return [
      "manual",
      normalizeValue(income.client),
      normalizeValue(income.date),
      normalizeValue(income.concept),
      Number(income.totalAmount || 0).toFixed(2),
      Number(income.paidAmount || 0).toFixed(2),
      normalizeValue(income.paymentStatus),
      normalizeValue(income.paymentMethod),
      normalizeValue(income.invoiceRequired),
    ].join("|");
  }

  function getExpenseDuplicateKey(expense) {
    return [
      normalizeValue(expense.date),
      normalizeValue(expense.concept),
      normalizeValue(expense.category),
      Number(expense.amount || 0).toFixed(2),
      normalizeValue(expense.paymentMethod),
      normalizeValue(expense.invoice),
    ].join("|");
  }

  function getQuoteDuplicateKey(quote) {
    if (quote.publicId) {
      return `public:${normalizeValue(quote.publicId)}`;
    }

    return [
      normalizeValue(quote.client),
      normalizeValue(quote.date),
      normalizeValue(quote.title),
      normalizeValue(quote.serviceType),
      Number(quote.total || 0).toFixed(2),
    ].join("|");
  }

  function groupDuplicates(items, keyFn) {
    const groups = new Map();

    items.forEach((item) => {
      const key = keyFn(item);
      if (!key) return;

      const group = groups.get(key) || [];
      group.push(item);
      groups.set(key, group);
    });

    return [...groups.values()].filter((group) => group.length > 1);
  }

  function getPaymentHistoryKey(entry) {
    return [
      normalizeValue(entry.type),
      normalizeValue(entry.date),
      Number(entry.amount || 0).toFixed(2),
      Number(entry.remainingAmount || 0).toFixed(2),
      normalizeValue(entry.dueDate),
      normalizeValue(entry.method),
      normalizeValue(entry.note),
    ].join("|");
  }

  function dedupePaymentHistory(history = []) {
    const seen = new Set();
    const deduped = [];

    history.forEach((entry) => {
      const key = getPaymentHistoryKey(entry);
      if (seen.has(key)) return;

      seen.add(key);
      deduped.push(entry);
    });

    return deduped;
  }

  function compactPaymentHistory(record) {
    const history = Array.isArray(record.paymentHistory)
      ? record.paymentHistory
      : [];
    const latestCorrectionIndex = history.findLastIndex(
      (entry) => normalizeValue(entry.type) === "correccion",
    );

    if (latestCorrectionIndex >= 0) {
      return [history[latestCorrectionIndex]];
    }

    const deduped = dedupePaymentHistory(history);
    const remainingAmount = Number(record.remainingAmount || 0);

    if (remainingAmount <= 0) return deduped;

    return deduped.filter((entry) => {
      const type = normalizeValue(entry.type);
      const entryRemaining = Number(entry.remainingAmount || 0);
      const isFinalPayment = type === "liquidacion" || type === "pago_total";

      return !(isFinalPayment && entryRemaining === 0);
    });
  }

  function getPaymentHistoryDuplicateCount(record) {
    if (!Array.isArray(record.paymentHistory)) return 0;
    return record.paymentHistory.length - compactPaymentHistory(record).length;
  }

  function findDuplicateIssues() {
    const duplicateIncomeGroups = groupDuplicates(
      currentData.incomes,
      getIncomeDuplicateKey,
    );
    const duplicateExpenseGroups = groupDuplicates(
      currentData.expenses,
      getExpenseDuplicateKey,
    );
    const duplicateQuoteGroups = groupDuplicates(
      currentData.quotes,
      getQuoteDuplicateKey,
    );

    return [
      ...duplicateIncomeGroups.map((group, index) => ({
        id: `income-duplicate-${index}`,
        type: "Ingresos",
        problem: "Duplicados",
        detail: group[0].concept || group[0].client || "Ingreso duplicado",
        records: group,
        actionLabel: "Eliminar duplicados",
        deleteFn: deleteIncomeRecord,
      })),
      ...duplicateExpenseGroups.map((group, index) => ({
        id: `expense-duplicate-${index}`,
        type: "Gastos",
        problem: "Duplicados",
        detail: group[0].concept || "Gasto duplicado",
        records: group,
        actionLabel: "Eliminar duplicados",
        deleteFn: deleteExpenseRecord,
      })),
      ...duplicateQuoteGroups.map((group, index) => ({
        id: `quote-duplicate-${index}`,
        type: "Cotizaciones",
        problem: "Duplicados",
        detail: group[0].publicId || group[0].title || "Cotización duplicada",
        records: group,
        actionLabel: "Eliminar duplicados",
        deleteFn: deleteQuoteRecord,
      })),
    ];
  }

  function findPaymentHistoryIssues() {
    const incomeIssues = currentData.incomes
      .map((income, index) => ({
        record: income,
        duplicateCount: getPaymentHistoryDuplicateCount(income),
        index,
      }))
      .filter((item) => item.duplicateCount > 0)
      .map(({ record, duplicateCount, index }) => ({
        id: `income-payment-history-${index}`,
        type: "Ingresos",
        problem: "Historial obsoleto",
        detail: `${record.publicId || record.id || "-"} · ${record.concept || record.client || "-"}`,
        records: [record],
        duplicateCount,
        actionLabel: "Limpiar historial",
        cleanFn: cleanPaymentHistoryIssue,
      }));

    const quoteIssues = currentData.quotes
      .map((quote, index) => ({
        record: quote,
        duplicateCount: getPaymentHistoryDuplicateCount(quote),
        index,
      }))
      .filter((item) => item.duplicateCount > 0)
      .map(({ record, duplicateCount, index }) => ({
        id: `quote-payment-history-${index}`,
        type: "Cotizaciones",
        problem: "Historial obsoleto",
        detail: `${record.publicId || record.id || "-"} · ${record.title || record.client || "-"}`,
        records: [record],
        duplicateCount,
        actionLabel: "Limpiar historial",
        cleanFn: cleanPaymentHistoryIssue,
      }));

    return [...incomeIssues, ...quoteIssues];
  }

  function findRelationIssues() {
    return currentData.quotes
      .filter((quote) => {
        const paymentStatus = normalizeValue(quote.paymentStatus);
        const shouldHaveIncome =
          paymentStatus === "anticipo pagado" ||
          paymentStatus === "pagada total";

        if (!shouldHaveIncome) return false;

        return !currentData.incomes.some((income) => {
          const quoteIdMatches =
            income.quoteId &&
            quote.id &&
            String(income.quoteId) === String(quote.id);
          const quotePublicIdMatches =
            income.quotePublicId &&
            quote.publicId &&
            String(income.quotePublicId) === String(quote.publicId);

          return quoteIdMatches || quotePublicIdMatches;
        });
      })
      .map((quote, index) => ({
        id: `quote-income-missing-${index}`,
        type: "Cotizaciones",
        problem: "Ingreso faltante",
        detail: `${quote.publicId || "-"} · ${quote.title || quote.client || "-"}`,
        records: [quote],
        actionLabel: "",
        deleteFn: null,
      }));
  }

  function updateCounters() {
    counters.clients.textContent = currentData.clients.length;
    counters.income.textContent = currentData.incomes.length;
    counters.expenses.textContent = currentData.expenses.length;
    counters.quotes.textContent = currentData.quotes.length;
    counters.alerts.textContent = currentIssues.length;
  }

  function renderIssues() {
    issuesBody.replaceChildren();

    if (currentIssues.length === 0) {
      issuesBody.appendChild(
        createEmptyStateRow("No se encontraron alertas de mantenimiento."),
      );
      return;
    }

    currentIssues.forEach((issue) => {
      const row = document.createElement("tr");
      row.appendChild(createCell(issue.type));
      row.appendChild(createCell(issue.problem));
      row.appendChild(createCell(issue.detail));
      row.appendChild(createCell(String(issue.records.length)));

      const actionCell = document.createElement("td");

      if (issue.deleteFn && issue.records.length > 1) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "delete-btn";
        button.dataset.issueId = issue.id;
        button.textContent = issue.actionLabel;
        actionCell.appendChild(button);
      } else if (issue.cleanFn) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "maintenance-clean-btn";
        button.dataset.cleanIssueId = issue.id;
        button.textContent = issue.actionLabel;
        actionCell.appendChild(button);
      } else {
        actionCell.textContent = "Revisar manualmente";
      }

      row.appendChild(actionCell);
      issuesBody.appendChild(row);
    });

    issuesBody.querySelectorAll("[data-issue-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        await cleanDuplicateIssue(button.dataset.issueId, button);
      });
    });

    issuesBody.querySelectorAll("[data-clean-issue-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        await cleanPaymentHistoryIssue(button.dataset.cleanIssueId, button);
      });
    });
  }

  async function refreshDiagnostics() {
    setPageLoading(true);

    try {
      const [clients, incomes, expenses, quotes] = await Promise.all([
        getClientsCollection(),
        getIncomeCollection(),
        getExpensesCollection(),
        getQuotesCollection(),
      ]);

      currentData = {
        clients,
        incomes,
        expenses,
        quotes,
      };

      currentIssues = [
        ...findDuplicateIssues(),
        ...findPaymentHistoryIssues(),
        ...findRelationIssues(),
      ];

      updateCounters();
      renderIssues();
    } finally {
      setPageLoading(false);
    }
  }

  function downloadJsonFile(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function exportBackup(button = exportBackupButton) {
    setButtonLoading(button, true, "Preparando...");

    try {
      const [clients, incomes, expenses, quotes, settings] = await Promise.all([
        getClientsCollection(),
        getIncomeCollection(),
        getExpensesCollection(),
        getQuotesCollection(),
        getSettingsRecord(),
      ]);

      const createdAt = new Date();
      const backup = {
        app: "Morfo Hub",
        version: 1,
        createdAt: createdAt.toISOString(),
        collections: {
          clients,
          income: incomes,
          expenses,
          quotes,
          settings,
        },
      };
      const filename = `morfo-hub-backup-${createdAt.toISOString().slice(0, 10)}.json`;

      downloadJsonFile(filename, backup);
      showToast("Respaldo descargado correctamente.", { type: "success" });
    } catch (error) {
      console.error("No se pudo generar el respaldo:", error);
      showToast(
        error?.message ||
          "No se pudo generar el respaldo. Revisa permisos o conexión.",
        { type: "error", duration: 5000 },
      );
    } finally {
      setButtonLoading(button, false);
    }
  }

  function normalizeBackupPayload(payload) {
    const collections = payload?.collections || {};
    const clients = collections.clients;
    const income = collections.income;
    const expenses = collections.expenses;
    const quotes = collections.quotes;
    const settings = collections.settings;

    if (
      !Array.isArray(clients) ||
      !Array.isArray(income) ||
      !Array.isArray(expenses) ||
      !Array.isArray(quotes) ||
      !settings ||
      typeof settings !== "object"
    ) {
      throw new Error(
        "El archivo no parece ser un respaldo válido de Morfo Hub.",
      );
    }

    return {
      createdAt: payload.createdAt || "",
      collections: {
        clients,
        income,
        expenses,
        quotes,
        settings,
      },
    };
  }

  function renderBackupPreview(backup) {
    const { collections, createdAt } = backup;
    const dateLabel = createdAt
      ? new Date(createdAt).toLocaleString("es-MX", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "Fecha no disponible";

    backupPreview.replaceChildren();

    const title = document.createElement("strong");
    title.textContent = `Respaldo detectado: ${dateLabel}`;

    const list = document.createElement("ul");
    [
      `Clientes: ${collections.clients.length}`,
      `Ingresos: ${collections.income.length}`,
      `Gastos: ${collections.expenses.length}`,
      `Cotizaciones: ${collections.quotes.length}`,
      "Configuración: incluida",
    ].forEach((item) => {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      list.appendChild(listItem);
    });

    backupPreview.appendChild(title);
    backupPreview.appendChild(list);
  }

  function resetBackupPreview(message) {
    pendingBackup = null;
    restoreBackupButton.disabled = true;
    backupPreview.textContent = message;
  }

  async function readBackupFile(file) {
    if (!file) {
      resetBackupPreview("Selecciona un respaldo JSON para ver la vista previa.");
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      pendingBackup = normalizeBackupPayload(payload);
      renderBackupPreview(pendingBackup);
      restoreBackupButton.disabled = false;
    } catch (error) {
      console.error("No se pudo leer el respaldo:", error);
      resetBackupPreview(
        error?.message || "No se pudo leer el respaldo seleccionado.",
      );
      showToast("El respaldo seleccionado no es válido.", {
        type: "error",
        duration: 4200,
      });
    }
  }

  async function replaceCollection(currentRecords, backupRecords, deleteFn, saveFn) {
    await Promise.all(
      currentRecords.map((record) => deleteFn(String(record.id))),
    );
    await Promise.all(
      backupRecords.map((record) => saveFn(sanitizeBackupRecord(record))),
    );
  }

  function sanitizeBackupRecord(record) {
    const {
      createdAt,
      updatedAt,
      createdAtMs,
      updatedAtMs,
      ...rest
    } = record || {};

    void createdAt;
    void updatedAt;
    void createdAtMs;
    void updatedAtMs;

    return rest;
  }

  function sanitizeBackupSettings(settings) {
    const {
      createdAt,
      updatedAt,
      createdAtMs,
      updatedAtMs,
      ...rest
    } = settings || {};

    void createdAt;
    void updatedAt;
    void createdAtMs;
    void updatedAtMs;

    return rest;
  }

  async function restoreBackup(button = restoreBackupButton) {
    if (!pendingBackup) return;

    const { collections } = pendingBackup;
    const confirmed = await askConfirm({
      title: "Restaurar respaldo",
      message:
        "Esta acción reemplazará clientes, ingresos, gastos, cotizaciones y configuración actuales con el contenido del respaldo. ¿Continuar?",
      confirmText: "Restaurar",
    });

    if (!confirmed) return;

    setButtonLoading(button, true, "Restaurando...");
    setPageLoading(true);

    try {
      const [clients, incomes, expenses, quotes] = await Promise.all([
        getClientsCollection(),
        getIncomeCollection(),
        getExpensesCollection(),
        getQuotesCollection(),
      ]);

      await replaceCollection(
        clients,
        collections.clients,
        deleteClientRecord,
        saveClientRecord,
      );
      await replaceCollection(
        incomes,
        collections.income,
        deleteIncomeRecord,
        saveIncomeRecord,
      );
      await replaceCollection(
        expenses,
        collections.expenses,
        deleteExpenseRecord,
        saveExpenseRecord,
      );
      await replaceCollection(
        quotes,
        collections.quotes,
        deleteQuoteRecord,
        saveQuoteRecord,
      );
      await saveSettingsRecord(sanitizeBackupSettings(collections.settings));

      restoreBackupInput.value = "";
      resetBackupPreview("Respaldo restaurado correctamente.");
      showToast("Respaldo restaurado correctamente.", { type: "success" });
      await refreshDiagnostics();
    } catch (error) {
      console.error("No se pudo restaurar el respaldo:", error);
      showToast(
        error?.message ||
          "No se pudo restaurar el respaldo. Revisa permisos o conexión.",
        { type: "error", duration: 5200 },
      );
    } finally {
      setPageLoading(false);
      setButtonLoading(button, false);
      if (!pendingBackup) {
        button.disabled = true;
      }
    }
  }

  async function cleanDuplicateIssue(issueId, button) {
    const issue = currentIssues.find((item) => item.id === issueId);
    if (!issue || !issue.deleteFn) return;

    const recordsToDelete = issue.records.slice(1);
    const confirmed = await askConfirm({
      title: `Limpiar ${issue.type}`,
      message: `Se conservará 1 registro y se eliminarán ${recordsToDelete.length} duplicados. ¿Continuar?`,
      confirmText: "Eliminar duplicados",
    });

    if (!confirmed) return;

    setButtonLoading(button, true, "Eliminando...");

    try {
      await Promise.all(
        recordsToDelete.map((record) => issue.deleteFn(String(record.id))),
      );
      showToast("Duplicados eliminados correctamente.", { type: "success" });
      await refreshDiagnostics();
    } catch (error) {
      console.error("No se pudieron eliminar duplicados:", error);
      showToast(
        error?.message ||
          "No se pudieron eliminar los duplicados. Revisa permisos o conexión.",
        { type: "error", duration: 5000 },
      );
    } finally {
      setButtonLoading(button, false);
    }
  }

  async function cleanPaymentHistoryIssue(issueId, button) {
    const issue = currentIssues.find((item) => item.id === issueId);
    if (!issue?.cleanFn || issue.records.length !== 1) return;

    const record = issue.records[0];
    const confirmed = await askConfirm({
      title: "Limpiar historial de pagos",
      message: `Se quitarán ${issue.duplicateCount} movimientos duplicados del historial de ${issue.detail}. No se eliminará el ingreso ni la cotización. ¿Continuar?`,
      confirmText: "Limpiar historial",
    });

    if (!confirmed) return;

    setButtonLoading(button, true, "Limpiando...");

    try {
      const cleanedRecord = {
        ...record,
        paymentHistory: compactPaymentHistory(record),
      };

      if (issue.type === "Ingresos") {
        await saveIncomeRecord(cleanedRecord);
      } else if (issue.type === "Cotizaciones") {
        await saveQuoteRecord(cleanedRecord);
      }

      showToast("Historial limpiado correctamente.", { type: "success" });
      await refreshDiagnostics();
    } catch (error) {
      console.error("No se pudo limpiar el historial:", error);
      showToast(
        error?.message ||
          "No se pudo limpiar el historial. Revisa permisos o conexión.",
        { type: "error", duration: 5000 },
      );
    } finally {
      setButtonLoading(button, false);
    }
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", refreshDiagnostics);
  }

  if (exportBackupButton) {
    exportBackupButton.addEventListener("click", () => {
      void exportBackup(exportBackupButton);
    });
  }

  if (restoreBackupInput) {
    restoreBackupInput.addEventListener("change", () => {
      void readBackupFile(restoreBackupInput.files?.[0]);
    });
  }

  if (restoreBackupButton) {
    restoreBackupButton.addEventListener("click", () => {
      void restoreBackup(restoreBackupButton);
    });
  }

  await refreshDiagnostics();
});
