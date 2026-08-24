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
import { SCOPES, getActiveScope } from "../scopes.js";
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
      title: "Archivar cuenta",
      message: `¿Quieres ocultar ${account.name}? Sus movimientos se conservarán.`,
      confirmText: "Archivar",
    });
    if (!confirmed) return;
    await archiveAccount(account.id);
    await reloadAccounts();
    showToast("Cuenta archivada; los movimientos se conservaron.", {
      type: "success",
    });
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
      card.innerHTML = `<span class="account-color account-color-lg" style="--account-color:${account.color}"></span><div><strong>${account.name}</strong><small>${accountTypeLabel(account.type)}${account.institution ? ` · ${account.institution}` : ""}</small><span>Saldo inicial: ${formatCurrency(account.startingBalance)}</span>${account.type === "credit" ? `<span>Corte: día ${account.statementDay || "-"} · Pago: día ${account.paymentDay || "-"}</span>` : ""}</div><div class="row-button-group"><button type="button" class="btn-ghost" data-edit>Editar</button><button type="button" class="delete-btn" data-archive>Archivar</button></div>`;
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
    document.getElementById("account-balance-label").textContent = isCredit
      ? "Deuda actual"
      : "Saldo inicial";
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
    document.getElementById("finance-settings-subtitle").textContent =
      `Configuración de ${SCOPES[scope].label}. Define dónde está el dinero y qué movimientos esperas; nada se marcará como pagado automáticamente.`;
    [settings, accounts, rules] = await Promise.all([
      getSettingsRecord(),
      getAccountsCollection(scope),
      getRecurringRules(scope),
    ]);
    document.getElementById("monthly-budget").value =
      settings.finance?.[scope]?.monthlyBudget || "";
    resetAccountForm();
    resetRuleForm();
    renderAccounts();
    renderAccountOptions();
    renderRules();
  } finally {
    setPageLoading(false);
  }
});
