import { apiRequest } from "./api-client.js";
import { STORAGE_KEYS, getData, saveData } from "./storage.js";

function sortIncomes(incomes) {
  return [...incomes].sort((a, b) => {
    const dateDiff = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateDiff !== 0) return dateDiff;

    const updatedA = Number(a.updatedAtMs || a.createdAtMs || 0);
    const updatedB = Number(b.updatedAtMs || b.createdAtMs || 0);
    return updatedB - updatedA;
  });
}

function getCachedIncomes() {
  return getData(STORAGE_KEYS.INCOME, []);
}

function hasCachedIncome(incomeId) {
  return getCachedIncomes().some(
    (income) => String(income.id) === String(incomeId),
  );
}

export async function getIncomeCollection() {
  const incomes = await apiRequest("/income");
  saveData(STORAGE_KEYS.INCOME, incomes);
  return sortIncomes(incomes);
}

export async function saveIncomeRecord(income) {
  const shouldUpdate = income.id && hasCachedIncome(income.id);

  const savedIncome = shouldUpdate
    ? await apiRequest(`/income/${income.id}`, {
        method: "PUT",
        body: JSON.stringify(income),
      })
    : await apiRequest("/income", {
        method: "POST",
        body: JSON.stringify(income),
      });

  const incomes = getCachedIncomes();
  const nextIncomes = incomes.some(
    (item) => String(item.id) === String(savedIncome.id),
  )
    ? incomes.map((item) =>
        String(item.id) === String(savedIncome.id) ? savedIncome : item,
      )
    : [...incomes, savedIncome];

  saveData(STORAGE_KEYS.INCOME, sortIncomes(nextIncomes));
  return savedIncome;
}

export async function replaceIncomeCollection(incomes) {
  const savedIncomes = await Promise.all(
    incomes.map((income) =>
      saveIncomeRecord({
        ...income,
      }),
    ),
  );
  saveData(STORAGE_KEYS.INCOME, sortIncomes(savedIncomes));
  return savedIncomes;
}

export async function deleteIncomeRecord(incomeId) {
  await apiRequest(`/income/${incomeId}`, {
    method: "DELETE",
  });

  const incomes = getCachedIncomes().filter(
    (income) => String(income.id) !== String(incomeId),
  );
  saveData(STORAGE_KEYS.INCOME, incomes);
}
