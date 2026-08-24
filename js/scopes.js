const SCOPE_STORAGE_KEY = "morfo_active_scope";

export const DEFAULT_SCOPE = "morfo";

const BASE_METHODS = ["Efectivo", "Transferencia", "Otro"];
const PERSONAL_METHODS = ["Nu", "BBVA", "Amex", ...BASE_METHODS];

export const SCOPES = {
  morfo: {
    key: "morfo",
    label: "Morfo",
    navKeys: [
      "dashboard",
      "clients",
      "income",
      "expenses",
      "quotes",
      "reports",
      "maintenance",
      "settings",
    ],
    homeKey: "dashboard",
    expenseCategories: [
      "Publicidad",
      "Software / Herramientas",
      "Transporte",
      "Comidas / Reuniones",
      "Equipo",
      "Hosting / Dominio",
      "Otro",
    ],
    paymentMethods: ["Efectivo", "Tarjeta", "Transferencia", "Otro"],
    // null: las fuentes se cargan desde la colección de clientes.
    incomeSources: null,
    incomeSourceLabel: "Cliente",
    showInvoice: true,
  },
  personal: {
    key: "personal",
    label: "Personal",
    navKeys: ["income", "expenses"],
    navLabels: { income: "Ingresos" },
    homeKey: "expenses",
    expenseCategories: [
      "Britania",
      "Supermercado",
      "Gasolina / Transporte",
      "Comidas",
      "Salud",
      "Suscripciones",
      "Ropa",
      "Otro",
    ],
    paymentMethods: PERSONAL_METHODS,
    incomeSources: [
      "Insectalia",
      "EcoBridal",
      "Griselda Alcázar",
      "Soluciones Hidráulicas",
    ],
    incomeSourceLabel: "Fuente de ingreso",
    showInvoice: false,
  },
  casa: {
    key: "casa",
    label: "Casa",
    navKeys: ["income", "expenses"],
    navLabels: { income: "Ingresos" },
    homeKey: "expenses",
    expenseCategories: [
      "Renta / Hipoteca",
      "Luz",
      "Agua",
      "Gas",
      "Internet / Teléfono",
      "Supermercado",
      "Mantenimiento",
      "Limpieza",
      "Otro",
    ],
    paymentMethods: PERSONAL_METHODS,
    incomeSources: ["Quincena"],
    incomeSourceLabel: "Origen",
    showInvoice: false,
  },
};

export function isValidScope(scope) {
  return Object.prototype.hasOwnProperty.call(SCOPES, String(scope || ""));
}

function readStoredScope() {
  try {
    const stored = localStorage.getItem(SCOPE_STORAGE_KEY);
    return isValidScope(stored) ? stored : "";
  } catch {
    return "";
  }
}

export function setActiveScope(scope) {
  if (!isValidScope(scope)) return DEFAULT_SCOPE;

  try {
    localStorage.setItem(SCOPE_STORAGE_KEY, scope);
  } catch {
    // Si el almacenamiento falla, el ámbito solo dura lo que dure la página.
  }

  return scope;
}

/**
 * Resuelve el ámbito activo. El parámetro `scope` de la URL manda sobre el
 * valor guardado, para que los enlaces del menú funcionen entre espacios.
 */
export function getActiveScope() {
  const fromUrl = new URLSearchParams(window.location.search).get("scope");

  if (isValidScope(fromUrl)) {
    return setActiveScope(fromUrl);
  }

  return readStoredScope() || DEFAULT_SCOPE;
}

export function getScopeConfig(scope = getActiveScope()) {
  return SCOPES[scope] || SCOPES[DEFAULT_SCOPE];
}

/**
 * Los registros creados antes de existir los espacios no tienen `scope`;
 * se consideran de Morfo para no perderlos de vista.
 */
export function recordMatchesScope(record, scope) {
  return String(record?.scope || DEFAULT_SCOPE) === String(scope);
}

export function withScopeParam(href, scope) {
  if (!isValidScope(scope)) return href;
  return `${href}${href.includes("?") ? "&" : "?"}scope=${scope}`;
}

/** Rellena un <select> con opciones simples, conservando el valor si sigue existiendo. */
export function fillSelectOptions(select, values, placeholder) {
  if (!select) return;

  const previousValue = select.value;
  select.replaceChildren();

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  select.appendChild(placeholderOption);

  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  if (values.includes(previousValue)) {
    select.value = previousValue;
  }
}
