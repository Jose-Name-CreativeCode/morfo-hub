import { protectPage } from "../services/auth.js";
import { getClientsCollection } from "../services/clients-service.js";
import {
  deleteExpenseRecord,
  getExpensesCollection,
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

  await refreshDiagnostics();
});
