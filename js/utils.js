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

let toastContainer = null;
let confirmElements = null;
let confirmResolver = null;

function ensureToastContainer() {
  if (toastContainer && document.body.contains(toastContainer)) {
    return toastContainer;
  }

  toastContainer = document.createElement("div");
  toastContainer.className = "toast-container";
  document.body.appendChild(toastContainer);
  return toastContainer;
}

export function showToast(message, { type = "info", duration = 3200 } = {}) {
  if (typeof document === "undefined" || !message) return;

  const container = ensureToastContainer();
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = String(message);

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("toast-visible");
  });

  const removeToast = () => {
    toast.classList.remove("toast-visible");
    window.setTimeout(() => {
      toast.remove();
    }, 180);
  };

  window.setTimeout(removeToast, duration);
}

export function setButtonLoading(button, isLoading, loadingText) {
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.defaultText) {
      button.dataset.defaultText = button.textContent || "";
    }

    button.disabled = true;
    button.classList.add("is-loading");
    button.textContent = loadingText || "Procesando...";
    return;
  }

  button.disabled = false;
  button.classList.remove("is-loading");

  if (button.dataset.defaultText) {
    button.textContent = button.dataset.defaultText;
  }
}

export function setPageLoading(isLoading) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("page-loading", Boolean(isLoading));
}

function ensureConfirmDialog() {
  if (confirmElements && document.body.contains(confirmElements.overlay)) {
    return confirmElements;
  }

  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay";

  const dialog = document.createElement("div");
  dialog.className = "confirm-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");

  const title = document.createElement("h3");
  title.className = "confirm-title";

  const message = document.createElement("p");
  message.className = "confirm-message";

  const actions = document.createElement("div");
  actions.className = "confirm-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "confirm-cancel-btn";
  cancelButton.textContent = "Cancelar";

  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = "btn-primary confirm-accept-btn";
  confirmButton.textContent = "Confirmar";

  actions.appendChild(cancelButton);
  actions.appendChild(confirmButton);
  dialog.appendChild(title);
  dialog.appendChild(message);
  dialog.appendChild(actions);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const resolveDialog = (value) => {
    if (!confirmResolver) return;
    const currentResolver = confirmResolver;
    confirmResolver = null;
    overlay.classList.remove("open");
    currentResolver(value);
  };

  cancelButton.addEventListener("click", () => resolveDialog(false));
  confirmButton.addEventListener("click", () => resolveDialog(true));
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      resolveDialog(false);
    }
  });

  confirmElements = {
    overlay,
    title,
    message,
    confirmButton,
    cancelButton,
  };

  return confirmElements;
}

export function createTableCell(text) {
  const cell = document.createElement("td");
  cell.textContent = text;
  return cell;
}

export function createEmptyStateRow(message, columns) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = columns;
  cell.style.textAlign = "center";
  cell.textContent = message;
  row.appendChild(cell);
  return row;
}

export function appendRowActions(row, id, { onDetail, detailLabel = "Ver" } = {}) {
  if (onDetail) {
    const detailCell = document.createElement("td");
    const detailButton = document.createElement("button");
    detailButton.type = "button";
    detailButton.className = "pdf-btn";
    detailButton.dataset.rowAction = "detail";
    detailButton.dataset.id = String(id);
    detailButton.textContent = detailLabel;
    detailCell.appendChild(detailButton);
    row.appendChild(detailCell);
  }

  const editCell = document.createElement("td");
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "edit-btn";
  editButton.dataset.rowAction = "edit";
  editButton.dataset.id = String(id);
  editButton.textContent = "Editar";
  editCell.appendChild(editButton);
  row.appendChild(editCell);

  const deleteCell = document.createElement("td");
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-btn";
  deleteButton.dataset.rowAction = "delete";
  deleteButton.dataset.id = String(id);
  deleteButton.textContent = "Eliminar";
  deleteCell.appendChild(deleteButton);
  row.appendChild(deleteCell);
}

export function bindRowActions(tableBody, { onDetail, onEdit, onDelete } = {}) {
  tableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-row-action]");
    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.rowAction;

    if (action === "detail" && onDetail) onDetail(id);
    if (action === "edit" && onEdit) onEdit(id);
    if (action === "delete" && onDelete) onDelete(id);
  });
}

export function askConfirm({
  title = "Confirmar acción",
  message = "¿Deseas continuar?",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
} = {}) {
  if (typeof document === "undefined") {
    return Promise.resolve(false);
  }

  const elements = ensureConfirmDialog();

  if (confirmResolver) {
    confirmResolver(false);
  }

  elements.title.textContent = title;
  elements.message.textContent = message;
  elements.confirmButton.textContent = confirmText;
  elements.cancelButton.textContent = cancelText;
  elements.overlay.classList.add("open");

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}
