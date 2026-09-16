import { protectPage } from "../services/auth.js";
import {
  archiveAccount,
  getAccountsCollection,
  saveAccount,
} from "../services/accounts-service.js";
import {
  deleteRecurringRule,
  getRecurringRules,
  saveRecurringRule,
} from "../services/recurring-service.js";
import {
  getSettingsRecord,
  saveSettingsRecord,
} from "../services/settings-service.js";
import {
  REMINDER_FREQUENCIES,
  REMINDER_KINDS,
  reminderScheduleLabel,
} from "../reminders.js";
import {
  PAYMENT_TYPES,
  SCOPES,
  getActiveScope,
  getFinanceConfig,
  getScopeConfig,
} from "../scopes.js";
import {
  askConfirm,
  formatCurrency,
  setButtonLoading,
  setPageLoading,
  showToast,
} from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  setPageLoading(true);
  await protectPage();

  let scope = getActiveScope();
  if (scope === "resumen") scope = "personal";
  // Personal y Casa sólo configuran cuentas; presupuesto y reglas son de Morfo.
  const isSimpleScope = getScopeConfig(scope).homeKey === "resumen";
  let accounts = [];
  let rules = [];
  let settings = null;
  const accountForm = document.getElementById("account-form");
  const ruleForm = document.getElementById("rule-form");

  function accountTypeLabel(type) {
    return (
      {
        bank: "Cuenta bancaria",
        cash: "Efectivo",
        debit: "Débito",
        credit: "Crédito",
        savings: "Ahorro",
      }[type] || type
    );
  }

  function renderAccountOptions() {
    const select = document.getElementById("rule-account");
    const previous = select.value;
    select.replaceChildren();
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Sin cuenta asignada";
    select.appendChild(empty);
    accounts
      .filter((item) => item.isActive !== false)
      .forEach((account) => {
        const option = document.createElement("option");
        option.value = account.id;
        option.textContent = account.name;
        select.appendChild(option);
      });
    if ([...select.options].some((option) => option.value === previous))
      select.value = previous;
  }

  function resetAccountForm() {
    accountForm.reset();
    document.getElementById("account-id").value = "";
    document.getElementById("account-balance").value = "0";
    document.getElementById("account-color").value = "#7c5cff";
    syncCreditFields();
    accountForm.querySelector("button[type=submit]").textContent =
      "Guardar cuenta";
  }

  function fillAccountForm(account) {
    document.getElementById("account-id").value = account.id;
    document.getElementById("account-name").value = account.name;
    document.getElementById("account-type").value = account.type;
    document.getElementById("account-institution").value =
      account.institution || "";
    document.getElementById("account-balance").value =
      account.startingBalance || 0;
    document.getElementById("account-limit").value = account.creditLimit || "";
    document.getElementById("account-statement-day").value =
      account.statementDay || "";
    document.getElementById("account-payment-day").value =
      account.paymentDay || "";
    document.getElementById("account-color").value = account.color || "#7c5cff";
    syncCreditFields();
    accountForm.querySelector("button[type=submit]").textContent =
      "Actualizar cuenta";
    accountForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleArchive(account) {
    const confirmed = await askConfirm({
      title: isSimpleScope ? "Eliminar cuenta" : "Archivar cuenta",
      message: isSimpleScope
        ? `¿Quitar ${account.name} de la lista? Tus gastos ya registrados con ella se conservan.`
        : `¿Quieres ocultar ${account.name}? Sus movimientos se conservarán.`,
      confirmText: isSimpleScope ? "Eliminar" : "Archivar",
    });
    if (!confirmed) return;
    await archiveAccount(account.id);
    await reloadAccounts();
    showToast(
      isSimpleScope
        ? "Cuenta eliminada; tus gastos se conservaron."
        : "Cuenta archivada; los movimientos se conservaron.",
      { type: "success" },
    );
  }

  function renderAccounts() {
    const container = document.getElementById("account-settings-list");
    container.replaceChildren();
    const visible = accounts.filter((item) => item.isActive !== false);
    if (!visible.length) {
      container.innerHTML =
        '<p class="empty-message">Agrega la primera cuenta para empezar a calcular saldos.</p>';
      return;
    }
    visible.forEach((account) => {
      const card = document.createElement("article");
      card.className = "account-settings-card";
      card.innerHTML = `<span class="account-color account-color-lg" style="--account-color:${account.color}"></span><div><strong>${account.name}</strong><small>${accountTypeLabel(account.type)}${account.institution ? ` · ${account.institution}` : ""}</small><span>Saldo inicial: ${formatCurrency(account.startingBalance)}</span>${account.type === "credit" ? `<span>Corte: día ${account.statementDay || "-"} · Pago: día ${account.paymentDay || "-"}</span>` : ""}</div><div class="row-button-group"><button type="button" class="btn-ghost" data-edit>Editar</button><button type="button" class="delete-btn" data-archive>${isSimpleScope ? "Eliminar" : "Archivar"}</button></div>`;
      card
        .querySelector("[data-edit]")
        .addEventListener("click", () => fillAccountForm(account));
      card
        .querySelector("[data-archive]")
        .addEventListener("click", () => handleArchive(account));
      container.appendChild(card);
    });
  }

  function syncCreditFields() {
    const isCredit = document.getElementById("account-type").value === "credit";
    document.querySelectorAll(".credit-only").forEach((element) => {
      element.hidden = !isCredit;
    });
  }

  function resetRuleForm() {
    ruleForm.reset();
    document.getElementById("rule-id").value = "";
    document.getElementById("rule-day-one").value = "1";
    syncFrequencyFields();
    ruleForm.querySelector("button[type=submit]").textContent = "Guardar regla";
  }

  function fillRuleForm(rule) {
    document.getElementById("rule-id").value = rule.id;
    document.getElementById("rule-name").value = rule.name;
    document.getElementById("rule-type").value = rule.type;
    document.getElementById("rule-amount").value = rule.amount;
    document.getElementById("rule-frequency").value = rule.frequency;
    document.getElementById("rule-day-one").value = rule.dayOne || "";
    document.getElementById("rule-day-two").value = rule.dayTwo || "";
    document.getElementById("rule-category").value = rule.category || "";
    document.getElementById("rule-account").value = rule.accountId || "";
    syncFrequencyFields();
    ruleForm.querySelector("button[type=submit]").textContent =
      "Actualizar regla";
    ruleForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handleDeleteRule(rule) {
    const confirmed = await askConfirm({
      title: "Eliminar regla",
      message: `¿Quieres eliminar la regla “${rule.name}”? Los movimientos ya registrados no se eliminarán.`,
      confirmText: "Eliminar",
    });
    if (!confirmed) return;
    await deleteRecurringRule(rule.id);
    await reloadRules();
    showToast("Regla eliminada.", { type: "success" });
  }

  function frequencyLabel(rule) {
    if (rule.frequency === "biweekly")
      return `Quincenal: ${rule.dayOne || 15} y ${rule.dayTwo || "fin de mes"}`;
    if (rule.frequency === "weekly") return "Semanal";
    return `Mensual: día ${rule.dayOne || 1}`;
  }

  function renderRules() {
    const container = document.getElementById("rule-settings-list");
    container.replaceChildren();
    if (!rules.length) {
      container.innerHTML =
        '<p class="empty-message">Todavía no hay movimientos recurrentes planeados.</p>';
      return;
    }
    rules.forEach((rule) => {
      const account = accounts.find((item) => item.id === rule.accountId);
      const row = document.createElement("article");
      row.className = "rule-settings-row";
      row.innerHTML = `<span class="transaction-icon ${rule.type}">${rule.type === "income" ? "+" : "−"}</span><div><strong>${rule.name}</strong><small>${frequencyLabel(rule)}${account ? ` · ${account.name}` : ""}</small></div><b>${formatCurrency(rule.amount)}</b><div class="row-button-group"><button type="button" class="btn-ghost" data-edit>Editar</button><button type="button" class="delete-btn" data-delete>Eliminar</button></div>`;
      row
        .querySelector("[data-edit]")
        .addEventListener("click", () => fillRuleForm(rule));
      row
        .querySelector("[data-delete]")
        .addEventListener("click", () => handleDeleteRule(rule));
      container.appendChild(row);
    });
  }

  function syncFrequencyFields() {
    document.getElementById("rule-day-two-group").hidden =
      document.getElementById("rule-frequency").value !== "biweekly";
  }

  async function reloadAccounts() {
    accounts = await getAccountsCollection(scope);
    renderAccounts();
    renderAccountOptions();
    renderRules();
  }

  async function reloadRules() {
    rules = await getRecurringRules(scope);
    renderRules();
  }

  /* ---------- Recordatorios ---------- */

  const MONTH_NAMES = [
    "Enero",
    "Febrero",
    "Marzo",
    "Abril",
    "Mayo",
    "Junio",
    "Julio",
    "Agosto",
    "Septiembre",
    "Octubre",
    "Noviembre",
    "Diciembre",
  ];

  function fillSelect(id, values) {
    const select = document.getElementById(id);
    const previous = select.value;
    select.replaceChildren();
    values.forEach(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });
    if (values.some((item) => String(item.value) === previous)) {
      select.value = previous;
    }
  }

  function syncReminderFields() {
    const kind = document.getElementById("reminder-kind").value;
    const frequency = document.getElementById("reminder-frequency").value;

    document.getElementById("reminder-month-group").hidden =
      frequency === REMINDER_FREQUENCIES.MONTHLY;
    document.querySelectorAll(".reminder-money").forEach((element) => {
      element.hidden = kind === REMINDER_KINDS.TASK;
    });
    document.getElementById("reminder-category-group").hidden =
      kind !== REMINDER_KINDS.EXPENSE;
    document.getElementById("reminder-funded-group").hidden =
      scope !== "casa" || kind !== REMINDER_KINDS.EXPENSE;
  }

  function renderReminderOptions() {
    const finance = getFinanceConfig(settings, scope);
    fillSelect(
      "reminder-month",
      MONTH_NAMES.map((label, index) => ({ value: index, label })),
    );
    fillSelect("reminder-method", [
      { value: "", label: "Preguntar al registrar" },
      ...finance.paymentMethods.map((method) => ({
        value: method.name,
        label: method.name,
      })),
    ]);
    fillSelect(
      "reminder-category",
      finance.categories.map((category) => ({
        value: category,
        label: category,
      })),
    );
  }

  function renderReminders() {
    if (!isSimpleScope) return;
    const container = document.getElementById("reminder-list");
    const finance = getFinanceConfig(settings, scope);
    container.replaceChildren();

    if (!finance.reminders.length) {
      container.innerHTML =
        '<p class="empty-message">Todavía no tienes recordatorios.</p>';
      return;
    }

    finance.reminders.forEach((reminder) => {
      const row = document.createElement("article");
      row.className = "reminder-settings-row";
      const kindLabel =
        reminder.kind === REMINDER_KINDS.TASK
          ? "Trámite"
          : reminder.kind === REMINDER_KINDS.CARD_PAYMENT
            ? "Pago de tarjeta"
            : "Gasto";
      const detail = [
        reminderScheduleLabel(reminder),
        kindLabel,
        reminder.method || "",
        Number(reminder.amount) ? formatCurrency(reminder.amount) : "",
      ]
        .filter(Boolean)
        .join(" · ");

      const text = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = reminder.name;
      const small = document.createElement("small");
      small.textContent = detail;
      text.append(name, small);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-btn";
      remove.textContent = "Eliminar";
      remove.addEventListener("click", () => removeReminder(reminder));

      row.append(text, remove);
      container.appendChild(row);
    });
  }

  async function removeReminder(reminder) {
    const confirmed = await askConfirm({
      title: "Eliminar recordatorio",
      message: `¿Eliminar “${reminder.name}”? Lo que ya registraste se conserva.`,
      confirmText: "Eliminar",
    });
    if (!confirmed) return;

    const finance = getFinanceConfig(settings, scope);
    await saveFinanceConfig(
      {
        reminders: finance.reminders.filter(
          (item) => String(item.id) !== String(reminder.id),
        ),
      },
      "Recordatorio eliminado.",
    );
  }

  if (isSimpleScope) {
    ["reminder-kind", "reminder-frequency"].forEach((id) => {
      document
        .getElementById(id)
        .addEventListener("change", syncReminderFields);
    });

    document
      .getElementById("reminder-form")
      .addEventListener("submit", async (event) => {
        event.preventDefault();
        const name = document.getElementById("reminder-name").value.trim();
        const day = Number(document.getElementById("reminder-day").value || 0);

        if (!name) {
          showToast("Escribe el nombre del recordatorio.", { type: "error" });
          return;
        }
        if (day < 1 || day > 31) {
          showToast("El día debe estar entre 1 y 31.", { type: "error" });
          return;
        }

        const kind = document.getElementById("reminder-kind").value;
        const frequency = document.getElementById("reminder-frequency").value;
        const isTask = kind === REMINDER_KINDS.TASK;
        const finance = getFinanceConfig(settings, scope);
        const reminder = {
          id: `rec-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
          name,
          kind,
          frequency,
          day,
          month:
            frequency === REMINDER_FREQUENCIES.MONTHLY
              ? 0
              : Number(document.getElementById("reminder-month").value || 0),
          amount: isTask
            ? 0
            : Number(document.getElementById("reminder-amount").value || 0),
          method: isTask
            ? ""
            : document.getElementById("reminder-method").value,
          category:
            kind === REMINDER_KINDS.EXPENSE
              ? document.getElementById("reminder-category").value
              : "",
          fundedBy:
            scope === "casa" && kind === REMINDER_KINDS.EXPENSE
              ? document.getElementById("reminder-funded").value
              : "",
          done: {},
        };

        const button = event.currentTarget.querySelector("button[type=submit]");
        setButtonLoading(button, true, "Guardando...");
        try {
          await saveFinanceConfig(
            { reminders: [...finance.reminders, reminder] },
            "Recordatorio agregado.",
          );
          document.getElementById("reminder-form").reset();
          document.getElementById("reminder-day").value = "1";
          syncReminderFields();
        } finally {
          setButtonLoading(button, false);
        }
      });
  }

  /* ---------- Formas de pago y categorías (Personal y Casa) ---------- */

  function renderFinanceChips(containerId, values, onRemove, emptyText) {
    const container = document.getElementById(containerId);
    container.replaceChildren();

    if (!values.length) {
      const empty = document.createElement("p");
      empty.className = "empty-message";
      empty.textContent = emptyText;
      container.appendChild(empty);
      return;
    }

    values.forEach((value, index) => {
      const chip = document.createElement("span");
      chip.className = "settings-chip";
      chip.append(value.label);

      if (value.hint) {
        const hint = document.createElement("small");
        hint.textContent = value.hint;
        chip.appendChild(hint);
      }

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "settings-chip-remove";
      remove.setAttribute("aria-label", `Quitar ${value.label}`);
      remove.textContent = "×";
      remove.addEventListener("click", () => onRemove(index, value.label));
      chip.appendChild(remove);
      container.appendChild(chip);
    });
  }

  function renderFinanceLists() {
    if (!isSimpleScope) return;
    const finance = getFinanceConfig(settings, scope);

    renderFinanceChips(
      "method-list",
      finance.paymentMethods.map((method) => ({
        label: method.name,
        hint: method.type === PAYMENT_TYPES.CARD ? "Tarjeta" : "Sin deuda",
      })),
      (index, label) => removeFinanceItem("paymentMethods", index, label),
      "Agrega al menos una forma de pago.",
    );

    renderFinanceChips(
      "category-list",
      finance.categories.map((category) => ({ label: category })),
      (index, label) => removeFinanceItem("categories", index, label),
      "Agrega al menos una categoría.",
    );
  }

  async function saveFinanceConfig(changes, message) {
    const finance = getFinanceConfig(settings, scope);
    settings = await saveSettingsRecord({
      ...settings,
      finance: {
        ...(settings.finance || {}),
        [scope]: {
          ...(settings.finance?.[scope] || {}),
          paymentMethods: finance.paymentMethods,
          categories: finance.categories,
          reminders: finance.reminders,
          ...changes,
        },
      },
    });
    renderFinanceLists();
    renderReminders();
    renderReminderOptions();
    showToast(message, { type: "success" });
  }

  async function removeFinanceItem(key, index, label) {
    const finance = getFinanceConfig(settings, scope);
    const next = finance[key].filter((_, position) => position !== index);

    if (!next.length) {
      showToast("Deja al menos una opción en la lista.", { type: "error" });
      return;
    }

    const confirmed = await askConfirm({
      title: "Quitar de la lista",
      message: `¿Quitar “${label}”? Tus registros anteriores lo conservan; sólo deja de aparecer al registrar algo nuevo.`,
      confirmText: "Quitar",
    });
    if (!confirmed) return;

    await saveFinanceConfig({ [key]: next }, `“${label}” ya no aparecerá.`);
  }

  if (isSimpleScope) {
    document
      .getElementById("method-form")
      .addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = document.getElementById("method-name");
        const name = input.value.trim();
        const type = document.getElementById("method-type").value;
        const finance = getFinanceConfig(settings, scope);

        if (!name) {
          showToast("Escribe el nombre de la forma de pago.", {
            type: "error",
          });
          return;
        }
        if (
          finance.paymentMethods.some(
            (method) => method.name.toLowerCase() === name.toLowerCase(),
          )
        ) {
          showToast("Ya tienes una forma de pago con ese nombre.", {
            type: "error",
          });
          return;
        }

        const button = event.currentTarget.querySelector("button[type=submit]");
        setButtonLoading(button, true, "Guardando...");
        try {
          await saveFinanceConfig(
            { paymentMethods: [...finance.paymentMethods, { name, type }] },
            "Forma de pago agregada.",
          );
          input.value = "";
        } finally {
          setButtonLoading(button, false);
        }
      });

    document
      .getElementById("category-form")
      .addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = document.getElementById("category-name");
        const name = input.value.trim();
        const finance = getFinanceConfig(settings, scope);

        if (!name) {
          showToast("Escribe el nombre de la categoría.", { type: "error" });
          return;
        }
        if (
          finance.categories.some(
            (category) => category.toLowerCase() === name.toLowerCase(),
          )
        ) {
          showToast("Ya tienes una categoría con ese nombre.", {
            type: "error",
          });
          return;
        }

        const button = event.currentTarget.querySelector("button[type=submit]");
        setButtonLoading(button, true, "Guardando...");
        try {
          await saveFinanceConfig(
            { categories: [...finance.categories, name] },
            "Categoría agregada.",
          );
          input.value = "";
        } finally {
          setButtonLoading(button, false);
        }
      });
  }

  document
    .getElementById("account-type")
    .addEventListener("change", syncCreditFields);
  document
    .getElementById("rule-frequency")
    .addEventListener("change", syncFrequencyFields);

  document
    .getElementById("budget-form")
    .addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button");
      setButtonLoading(button, true, "Guardando...");
      try {
        settings = await saveSettingsRecord({
          ...settings,
          finance: {
            ...(settings.finance || {}),
            [scope]: {
              ...(settings.finance?.[scope] || {}),
              monthlyBudget: Number(
                document.getElementById("monthly-budget").value || 0,
              ),
            },
          },
        });
        showToast("Presupuesto actualizado.", { type: "success" });
      } finally {
        setButtonLoading(button, false);
      }
    });

  accountForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = accountForm.querySelector("button[type=submit]");
    setButtonLoading(button, true, "Guardando...");
    try {
      await saveAccount({
        id: document.getElementById("account-id").value || undefined,
        scope,
        name: document.getElementById("account-name").value.trim(),
        type: document.getElementById("account-type").value,
        institution: document
          .getElementById("account-institution")
          .value.trim(),
        startingBalance: Number(
          document.getElementById("account-balance").value || 0,
        ),
        creditLimit: document.getElementById("account-limit").value,
        statementDay: document.getElementById("account-statement-day").value,
        paymentDay: document.getElementById("account-payment-day").value,
        color: document.getElementById("account-color").value,
      });
      resetAccountForm();
      await reloadAccounts();
      showToast("Cuenta guardada.", { type: "success" });
    } finally {
      setButtonLoading(button, false);
    }
  });

  ruleForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = ruleForm.querySelector("button[type=submit]");
    setButtonLoading(button, true, "Guardando...");
    try {
      await saveRecurringRule({
        id: document.getElementById("rule-id").value || undefined,
        scope,
        name: document.getElementById("rule-name").value.trim(),
        type: document.getElementById("rule-type").value,
        amount: Number(document.getElementById("rule-amount").value || 0),
        frequency: document.getElementById("rule-frequency").value,
        dayOne: document.getElementById("rule-day-one").value,
        dayTwo: document.getElementById("rule-day-two").value,
        category: document.getElementById("rule-category").value.trim(),
        accountId: document.getElementById("rule-account").value,
      });
      resetRuleForm();
      await reloadRules();
      showToast("Regla guardada como movimiento esperado.", {
        type: "success",
      });
    } finally {
      setButtonLoading(button, false);
    }
  });

  try {
    document.querySelectorAll("[data-morfo-only]").forEach((element) => {
      element.hidden = isSimpleScope;
    });
    document.querySelectorAll("[data-simple-only]").forEach((element) => {
      element.hidden = !isSimpleScope;
    });
    if (isSimpleScope) {
      document.getElementById("finance-settings-title").textContent =
        `Ajustes de ${SCOPES[scope].label}`;
      document.title = "Morfo Hub | Ajustes";
      const headerTitle = document.querySelector(".header-title");
      if (headerTitle) headerTitle.textContent = "Ajustes";
      document.getElementById("finance-settings-subtitle").textContent =
        "Aquí eliges los botones que ves al registrar un gasto: con qué pagas y en qué categoría entra.";
    } else {
      document.getElementById("finance-settings-subtitle").textContent =
        `Configuración de ${SCOPES[scope].label}. Define dónde está el dinero y qué movimientos esperas; nada se marcará como pagado automáticamente.`;
    }
    [settings, accounts, rules] = await Promise.all([
      getSettingsRecord(),
      getAccountsCollection(scope),
      getRecurringRules(scope),
    ]);
    document.getElementById("monthly-budget").value =
      settings.finance?.[scope]?.monthlyBudget || "";
    resetAccountForm();
    resetRuleForm();
    renderFinanceLists();
    if (isSimpleScope) {
      renderReminderOptions();
      renderReminders();
      syncReminderFields();
    }
    renderAccounts();
    renderAccountOptions();
    renderRules();
  } finally {
    setPageLoading(false);
  }
});
