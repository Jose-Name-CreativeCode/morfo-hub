import { apiRequest } from "./api-client.js";
import { STORAGE_KEYS, getData, saveData } from "./storage.js";

function sortExpenses(expenses) {
  return [...expenses].sort((a, b) => {
    const dateDiff = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateDiff !== 0) return dateDiff;

    const updatedA = Number(a.updatedAtMs || a.createdAtMs || 0);
    const updatedB = Number(b.updatedAtMs || b.createdAtMs || 0);
    return updatedB - updatedA;
  });
}

function getCachedExpenses() {
  return getData(STORAGE_KEYS.EXPENSES, []);
}

function hasCachedExpense(expenseId) {
  return getCachedExpenses().some(
    (expense) => String(expense.id) === String(expenseId),
  );
}

export async function getExpensesCollection() {
  const expenses = await apiRequest("/expenses");
  saveData(STORAGE_KEYS.EXPENSES, expenses);
  return sortExpenses(expenses);
}

export async function saveExpenseRecord(expense) {
  const shouldUpdate = expense.id && hasCachedExpense(expense.id);

  const savedExpense = shouldUpdate
    ? await apiRequest(`/expenses/${expense.id}`, {
        method: "PUT",
        body: JSON.stringify(expense),
      })
    : await apiRequest("/expenses", {
        method: "POST",
        body: JSON.stringify(expense),
      });

  const expenses = getCachedExpenses();
  const nextExpenses = expenses.some(
    (item) => String(item.id) === String(savedExpense.id),
  )
    ? expenses.map((item) =>
        String(item.id) === String(savedExpense.id) ? savedExpense : item,
      )
    : [...expenses, savedExpense];

  saveData(STORAGE_KEYS.EXPENSES, sortExpenses(nextExpenses));
  return savedExpense;
}

export async function deleteExpenseRecord(expenseId) {
  await apiRequest(`/expenses/${expenseId}`, {
    method: "DELETE",
  });

  const expenses = getCachedExpenses().filter(
    (expense) => String(expense.id) !== String(expenseId),
  );
  saveData(STORAGE_KEYS.EXPENSES, expenses);
}
