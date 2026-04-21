import { protectPage } from "../services/auth.js";
import { getClientsCollection } from "../services/clients-service.js";
import {
  deleteExpenseRecord,
  getExpensesCollection,
} from "../services/expenses-service.js";
import {
  deleteIncomeRecord,
  getIncomeCollection,
} from "../services/income-service.js";
import {
  deleteQuoteRecord,
  getQuotesCollection,
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

      currentIssues = [...findDuplicateIssues(), ...findRelationIssues()];

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

  if (refreshButton) {
    refreshButton.addEventListener("click", refreshDiagnostics);
  }

  await refreshDiagnostics();
});
