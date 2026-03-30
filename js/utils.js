export function formatCurrency(amount) {
  return Number(amount || 0).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
}

export function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("es-MX");
}

export function generateId() {
  return Date.now();
}
