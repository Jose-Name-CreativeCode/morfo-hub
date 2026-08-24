import { protectPage } from "../services/auth.js";
import { getAccountsCollection } from "../services/accounts-service.js";
import { getClientsCollection } from "../services/clients-service.js";
import { getExpensesCollection } from "../services/expenses-service.js";
import { getIncomeCollection } from "../services/income-service.js";
import { getQuotesCollection } from "../services/quotes-service.js";
import { getRecurringRules } from "../services/recurring-service.js";
import { getSettingsRecord } from "../services/settings-service.js";
import {
  SCOPES,
  getActiveScope,
  recordMatchesScope,
  withScopeParam,
} from "../scopes.js";
import {
  formatCurrency,
  formatDate,
  normalizeText,
  setPageLoading,
} from "../utils.js";

document.addEventListener("DOMContentLoaded", async () => {
  setPageLoading(true);
  await protectPage();

  const activeScope = getActiveScope();
  const isSummary = activeScope === "resumen";
  const scopeLabel = SCOPES[activeScope]?.label || "Morfo";
  const money = (value) => formatCurrency(Number(value || 0));
  const paidIncome = (item) => Number(item.paidAmount || item.amount || 0);
  const expenseAmount = (item) => Number(item.amount || 0);

  function pendingIncome(item) {
    const explicit = Number(item.remainingAmount);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    return Math.max(Number(item.totalAmount || 0) - paidIncome(item), 0);
  }

  function isCurrentMonth(value) {
    if (!value) return false;
    const [year, month] = String(value).split("-").map(Number);
    const now = new Date();
    return year === now.getFullYear() && month === now.getMonth() + 1;
  }

  function filterScope(records, scope = activeScope) {
    return scope === "resumen"
      ? records
      : records.filter((record) => recordMatchesScope(record, scope));
  }

  function emptyMessage(text) {
    const element = document.createElement("p");
    element.className = "empty-message";
    element.textContent = text;
    return element;
  }

  function configurePage() {
    const title = document.getElementById("dashboard-title");
    const subtitle = document.getElementById("dashboard-subtitle");
    const kicker = document.getElementById("dashboard-kicker");

    if (isSummary) {
      kicker.textContent = "Vista consolidada";
      title.textContent = "Todo tu dinero, sin revolverlo";
      subtitle.textContent =
        "Compara Personal, Casa y Morfo; entra a cada espacio para tomar decisiones con detalle.";
      document.getElementById("dashboard-actions").hidden = true;
    } else {
      title.textContent = scopeLabel;
      kicker.textContent =
        activeScope === "morfo" ? "Negocio" : "Control financiero";
      subtitle.textContent =
        activeScope === "casa"
          ? "Sigue cada quincena, los gastos compartidos y lo comprometido antes del siguiente ingreso."
          : activeScope === "personal"
            ? "Una vista privada para entender en qué gastas y cuánto puedes usar con tranquilidad."
            : "Flujo de efectivo, cobros pendientes y operación comercial de la agencia.";
    }

    ["quick-movement-link", "view-movements-link"].forEach((id) => {
      document.getElementById(id).href = withScopeParam(
        "movements.html",
        activeScope,
      );
    });
    document.getElementById("manage-accounts-link").href = withScopeParam(
      "finance-settings.html",
      activeScope,
    );
  }

  function renderMetrics(incomes, expenses, settings) {
    const monthIncomes = incomes.filter((item) => isCurrentMonth(item.date));
    const monthExpenses = expenses.filter((item) => isCurrentMonth(item.date));
    const totalIncome = monthIncomes.reduce(
      (sum, item) => sum + paidIncome(item),
      0,
    );
    const totalExpense = monthExpenses.reduce(
      (sum, item) => sum + expenseAmount(item),
      0,
    );
    const pending = incomes.reduce((sum, item) => sum + pendingIncome(item), 0);
    const net = totalIncome - totalExpense;
    const budget = isSummary
      ? 0
      : Number(settings.finance?.[activeScope]?.monthlyBudget || 0);

    document.getElementById("metric-income").textContent = money(totalIncome);
    document.getElementById("metric-expense").textContent = money(totalExpense);
    document.getElementById("metric-net").textContent = money(net);
    document.getElementById("metric-pending").textContent = money(pending);
    document
      .getElementById("metric-net-card")
      .classList.add(net >= 0 ? "income" : "expense");

    if (budget > 0) {
      const available = budget - totalExpense;
      document.getElementById("metric-budget").textContent = money(available);
      document.getElementById("metric-budget-note").textContent =
        `${money(totalExpense)} usados de ${money(budget)}`;
      if (available < 0)
        document.getElementById("budget-card").classList.add("expense");
    } else if (isSummary) {
      document.getElementById("budget-card").hidden = true;
    }

    return { totalIncome, totalExpense, pending, net, budget };
  }

  function renderScopeOverview(allIncomes, allExpenses) {
    if (!isSummary) return;
    const container = document.getElementById("scope-overview");
    container.hidden = false;

    ["personal", "casa", "morfo"].forEach((scope) => {
      const incoming = filterScope(allIncomes, scope)
        .filter((item) => isCurrentMonth(item.date))
        .reduce((sum, item) => sum + paidIncome(item), 0);
      const outgoing = filterScope(allExpenses, scope)
        .filter((item) => isCurrentMonth(item.date))
        .reduce((sum, item) => sum + expenseAmount(item), 0);
      const card = document.createElement("a");
      card.className = `card scope-overview-card scope-${scope}`;
      card.href = withScopeParam("dashboard.html", scope);
      card.innerHTML = `<div class="scope-card-top"><span>${SCOPES[scope].label}</span><b>→</b></div><strong>${money(incoming - outgoing)}</strong><small>${money(incoming)} entró · ${money(outgoing)} salió</small>`;
      container.appendChild(card);
    });
  }

  function categoryTotals(expenses) {
    const totals = new Map();
    expenses
      .filter((item) => isCurrentMonth(item.date))
      .forEach((item) => {
        const category = item.category || "Sin categoría";
        totals.set(category, (totals.get(category) || 0) + expenseAmount(item));
      });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }

  function renderInsights(metrics, expenses) {
    const list = document.getElementById("insight-list");
    const insights = [];

    if (metrics.totalIncome === 0 && metrics.totalExpense === 0) {
      insights.push([
        "Empieza por capturar",
        "Registra el primer ingreso o gasto para construir una lectura útil.",
        "neutral",
      ]);
    } else if (metrics.net < 0) {
      insights.push([
        "El gasto supera al ingreso",
        `Este mes has gastado ${money(Math.abs(metrics.net))} más de lo recibido.`,
        "danger",
      ]);
    } else {
      const ratio = metrics.totalIncome
        ? metrics.totalExpense / metrics.totalIncome
        : 0;
      insights.push([
        ratio >= 0.8 ? "Margen apretado" : "Flujo positivo",
        ratio >= 0.8
          ? `Ya utilizaste ${Math.round(ratio * 100)}% de lo que ingresó este mes.`
          : `Conservas ${money(metrics.net)} después de los gastos registrados.`,
        ratio >= 0.8 ? "warning" : "success",
      ]);
    }

    if (metrics.budget > 0) {
      const used = metrics.totalExpense / metrics.budget;
      insights.push([
        used > 1 ? "Presupuesto rebasado" : "Presupuesto mensual",
        used > 1
          ? `Excediste el límite por ${money(metrics.totalExpense - metrics.budget)}.`
          : `Has utilizado ${Math.round(used * 100)}% del presupuesto.`,
        used > 1 ? "danger" : used > 0.8 ? "warning" : "neutral",
      ]);
    }

    const top = categoryTotals(expenses)[0];
    if (top) {
      insights.push([
        "Principal categoría",
        `${top[0]} concentra ${money(top[1])} del gasto mensual.`,
        "neutral",
      ]);
    }

    insights.slice(0, 3).forEach(([title, copy, tone]) => {
      const item = document.createElement("div");
      item.className = `insight-item insight-${tone}`;
      item.innerHTML = `<span class="insight-dot"></span><div><strong>${title}</strong><p>${copy}</p></div>`;
      list.appendChild(item);
    });
  }

  function renderAccounts(accounts, incomes, expenses) {
    const list = document.getElementById("account-list");
    const visible = filterScope(accounts).filter(
      (account) => account.isActive !== false,
    );
    if (!visible.length) {
      list.appendChild(
        emptyMessage("Todavía no has configurado cuentas o tarjetas."),
      );
      return;
    }

    visible.forEach((account) => {
      const incoming = incomes
        .filter((item) => item.accountId === account.id)
        .reduce((sum, item) => sum + paidIncome(item), 0);
      const outgoing = expenses
        .filter((item) => item.accountId === account.id)
        .reduce((sum, item) => sum + expenseAmount(item), 0);
      const balance =
        Number(account.startingBalance || 0) + incoming - outgoing;
      const row = document.createElement("div");
      row.className = "account-row";
      row.innerHTML = `<span class="account-color" style="--account-color:${account.color}"></span><div><strong>${account.name}</strong><small>${account.institution || account.type}</small></div><b>${money(balance)}</b>`;
      list.appendChild(row);
    });
  }

  function renderCategories(expenses) {
    const container = document.getElementById("category-bars");
    const rows = categoryTotals(expenses).slice(0, 6);
    if (!rows.length) {
      container.appendChild(emptyMessage("Aún no hay gastos este mes."));
      return;
    }
    const max = rows[0][1] || 1;
    rows.forEach(([name, amount]) => {
      const row = document.createElement("div");
      row.className = "category-bar-row";
      row.innerHTML = `<div><span>${name}</span><strong>${money(amount)}</strong></div><div class="category-track"><span style="width:${Math.max(5, (amount / max) * 100)}%"></span></div>`;
      container.appendChild(row);
    });
  }

  function ruleSchedule(rule) {
    if (rule.frequency === "biweekly") {
      return `Días ${rule.dayOne || 15} y ${rule.dayTwo || "fin de mes"}`;
    }
    if (rule.frequency === "weekly") return "Cada semana";
    return `Día ${rule.dayOne || 1} de cada mes`;
  }

  function renderCommitments(rules, accounts) {
    const list = document.getElementById("commitment-list");
    const visible = filterScope(rules).filter(
      (rule) => rule.isActive !== false,
    );
    if (!visible.length) {
      list.appendChild(
        emptyMessage("Agrega quincenas o gastos fijos en Cuentas y reglas."),
      );
      return;
    }
    visible.slice(0, 7).forEach((rule) => {
      const account = accounts.find((item) => item.id === rule.accountId);
      const row = document.createElement("div");
      row.className = "commitment-row";
      row.innerHTML = `<span class="transaction-icon ${rule.type}">${rule.type === "income" ? "+" : "−"}</span><div><strong>${rule.name}</strong><small>${ruleSchedule(rule)}${account ? ` · ${account.name}` : ""}</small></div><b>${money(rule.amount)}</b>`;
      list.appendChild(row);
    });
  }

  function renderRecent(incomes, expenses, accounts) {
    const body = document.getElementById("recent-activity-body");
    const rows = [
      ...incomes.map((item) => ({
        ...item,
        kind: "Ingreso",
        amountValue: paidIncome(item),
      })),
      ...expenses.map((item) => ({
        ...item,
        kind: "Gasto",
        amountValue: expenseAmount(item),
      })),
    ]
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
      .slice(0, 10);

    if (!rows.length) {
      const row = document.createElement("tr");
      row.innerHTML = `<td colspan="6" class="table-empty-cell">No hay movimientos registrados.</td>`;
      body.appendChild(row);
      return;
    }

    rows.forEach((item) => {
      const row = document.createElement("tr");
      const account = accounts.find((entry) => entry.id === item.accountId);
      const cells = [
        SCOPES[item.scope || "morfo"]?.label || "Morfo",
        item.kind,
        item.concept || item.client || "Movimiento",
        account?.name || item.paymentMethod || "-",
        formatDate(item.date),
        money(item.amountValue),
      ];
      cells.forEach((value, index) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        if (index === 5) {
          cell.className =
            item.kind === "Ingreso" ? "amount-positive" : "amount-negative";
        }
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
  }

  function renderCommercial(clients, quotes, pending) {
    if (activeScope !== "morfo") return;
    document.getElementById("morfo-commercial-panel").hidden = false;
    document.getElementById("active-clients").textContent = String(
      clients.filter((item) => normalizeText(item.status) === "activo").length,
    );
    document.getElementById("quotes-follow-up").textContent = String(
      quotes.filter((item) =>
        ["enviada", "aprobada"].includes(normalizeText(item.status)),
      ).length,
    );
    document.getElementById("morfo-pending").textContent = money(pending);
  }

  try {
    configurePage();
    const [
      allIncomes,
      allExpenses,
      accounts,
      rules,
      settings,
      clients,
      quotes,
    ] = await Promise.all([
      getIncomeCollection(),
      getExpensesCollection(),
      getAccountsCollection(),
      getRecurringRules(),
      getSettingsRecord(),
      activeScope === "morfo" ? getClientsCollection() : Promise.resolve([]),
      activeScope === "morfo" ? getQuotesCollection() : Promise.resolve([]),
    ]);
    const incomes = filterScope(allIncomes);
    const expenses = filterScope(allExpenses);
    const metrics = renderMetrics(incomes, expenses, settings);
    renderScopeOverview(allIncomes, allExpenses);
    renderInsights(metrics, expenses);
    renderAccounts(accounts, incomes, expenses);
    renderCategories(expenses);
    renderCommitments(rules, accounts);
    renderRecent(incomes, expenses, accounts);
    renderCommercial(clients, quotes, metrics.pending);
  } catch (error) {
    console.error("No se pudo cargar el dashboard financiero:", error);
    document
      .getElementById("insight-list")
      .appendChild(
        emptyMessage(error.message || "No se pudo cargar la información."),
      );
  } finally {
    setPageLoading(false);
  }
});
