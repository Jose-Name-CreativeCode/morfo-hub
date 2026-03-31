export function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function formatCurrency(amount, locale = "es-MX", currency = "MXN") {
  return Number(amount || 0).toLocaleString(locale, {
    style: "currency",
    currency,
  });
}

export function formatDate(value, locale = "es-MX") {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString(locale);
}

export function getTodayISO() {
  const today = new Date();
  const localDate = new Date(
    today.getTime() - today.getTimezoneOffset() * 60 * 1000,
  );

  return localDate.toISOString().split("T")[0];
}
