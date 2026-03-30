export const STORAGE_KEYS = {
  CLIENTS: "morfo_clients",
  SETTINGS: "morfo_settings",
  INCOME: "morfo_income",
  EXPENSES: "morfo_expenses",
  QUOTES: "morfo_quotes",
};

export function getData(key, fallback = []) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Error reading key "${key}"`, error);
    return fallback;
  }
}

export function saveData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Error saving key "${key}"`, error);
    return false;
  }
}

export function removeData(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Error removing key "${key}"`, error);
    return false;
  }
}
