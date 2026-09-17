import { protectPage } from "../services/auth.js";
import {
  getIncomeCollection,
  saveIncomeRecord,
} from "../services/income-service.js";
import { getExpensesCollection } from "../services/expenses-service.js";
import { getSettingsRecord } from "../services/settings-service.js";
import { getActiveScope, withScopeParam } from "../scopes.js";
import { IVA_RATE, buildMonthlyTaxSummary, isInvoiced } from "../tax-mx.js";
import {
  formatCurrency,
  getTodayISO,
  setButtonLoading,
  setPageLoading,
  showToast,
} from "../utils.js";

const MONTHS = [
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

// Repartos que se usan seguido; "Otro" abre los porcentajes a mano.
const SPLIT_PRESETS = [
  [50, 50],
  [60, 40],
  [80, 20],
  [40, 60],
  [20, 80],
];

const DEFAULT_PARTNERS = [
  { key: "jose", name: "Jose", share: 50 },
  { key: "vero", name: "Vero", share: 50 },
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function monthLabel(month) {
  const [year, index] = month.split("-").map(Number);
  return `${MONTHS[index - 1]} ${year}`;
}

function shiftMonth(month, delta) {
  const [year, index] = month.split("-").map(Number);
  const cursor = new Date(year, index - 1 + delta, 1);
  return `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  const scope = getActiveScope();

  if (scope !== "morfo") {
    window.location.replace(withScopeParam("resumen.html", scope));
    return;
  }

  setPageLoading(true);
  const user = await protectPage();
  if (!user) return;

  const today = getTodayISO();
  const state = {
    month: today.slice(0, 7),
    incomes: [],
    expenses: [],
    partners: DEFAULT_PARTNERS,
    sheetIncomeId: null,
    form: { invoiced: false, split: {} },
  };

  const $ = (id) => document.getElementById(id);
  const backdrop = $("dn-backdrop");
  const sheet = $("dn-sheet");

  async function loadData() {
    const [incomes, expenses, settings] = await Promise.all([
      getIncomeCollection(),
      getExpensesCollection(),
      getSettingsRecord(),
    ]);

    const isMorfo = (record) => String(record.scope || "morfo") === "morfo";
    state.incomes = incomes.filter(isMorfo);
    state.expenses = expenses.filter(isMorfo);

    const saved = settings?.finance?.morfo?.partners;
    state.partners =
      Array.isArray(saved) && saved.length ? saved : DEFAULT_PARTNERS;
  }

  function summary() {
    return buildMonthlyTaxSummary({
      incomes: state.incomes,
      expenses: state.expenses,
      month: state.month,
      partners: state.partners,
    });
  }

  /* ---------- Pantalla ---------- */

  function renderTotals(data) {
    $("dn-month").textContent = monthLabel(state.month);
    $("dn-collected").textContent = formatCurrency(data.collected);
    $("dn-collected-note").textContent =
      `${formatCurrency(data.collectedInvoiced)} facturado · ${formatCurrency(data.collectedPlain)} sin factura`;
    $("dn-expenses").textContent = formatCurrency(data.expensesTotal);
    $("dn-expenses-note").textContent =
      `IVA acreditable ${formatCurrency(data.ivaCredit)}`;
    $("dn-profit").textContent = formatCurrency(data.profit);
  }

  function renderTaxes(data) {
    $("dn-taxes-total").textContent = formatCurrency(data.taxesToPay);
    $("dn-tax-due").textContent =
      `Declara antes del 17 de ${MONTHS[Number(state.month.slice(5, 7)) - 1].toLowerCase()}`;

    const list = $("dn-tax-list");
    list.replaceChildren();
    [
      ["IVA cobrado", formatCurrency(data.ivaCharged)],
      ["IVA de tus gastos", `− ${formatCurrency(data.ivaCredit)}`],
      ["IVA por pagar", formatCurrency(data.ivaToPay)],
      [
        `ISR RESICO (${(data.isrRate * 100).toFixed(2)}%)`,
        formatCurrency(data.isrTotal),
      ],
      ["ISR que ya te retuvieron", `− ${formatCurrency(data.withheld)}`],
      ["ISR por pagar", formatCurrency(data.isrToPay)],
    ].forEach(([label, value]) => {
      const row = el("div");
      row.append(el("dt", "", label), el("dd", "", value));
      list.appendChild(row);
    });

    $("dn-tax-note").textContent = data.collectedPlain
      ? `Los ${formatCurrency(data.collectedPlain)} sin factura no entran en el cálculo. Confirma siempre con tu contador.`
      : "Cálculo estimado sobre lo cobrado y facturado. Confirma con tu contador.";
  }

  function renderPartners(data) {
    const container = $("dn-partners");
    container.replaceChildren();

    data.partnerTotals.forEach((partner) => {
      const row = el("div", "cm-row");
      row.appendChild(el("span", "cm-dot", partner.name.charAt(0)));

      const text = el("span", "cm-row-text");
      text.append(
        el("b", "", partner.name),
        el("small", "", "Antes de impuestos, sobre lo cobrado"),
      );
      row.appendChild(text);

      const amount = el("span", "cm-row-amount");
      amount.appendChild(el("strong", "", formatCurrency(partner.amount)));
      row.appendChild(amount);

      container.appendChild(row);
    });
  }

  function renderIncomes(data) {
    const container = $("dn-incomes");
    container.replaceChildren();
    $("dn-income-count").textContent =
      `${data.incomes.length} ${data.incomes.length === 1 ? "cobro" : "cobros"}`;

    if (!data.incomes.length) {
      container.appendChild(
        el("p", "cm-col-empty", "No hay cobros registrados en este mes."),
      );
      return;
    }

    [...data.incomes]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .forEach((income) => {
        const row = el("button", "cm-row");
        row.type = "button";
        row.style.width = "100%";
        row.appendChild(
          el("span", "cm-dot", (income.client || "?").charAt(0).toUpperCase()),
        );

        const shares = state.partners
          .map((partner) => {
            const value = income.split?.[partner.key];
            return `${partner.name} ${value ?? partner.share}%`;
          })
          .join(" · ");

        const text = el("span", "cm-row-text");
        text.append(
          el("b", "", income.client || income.concept || "Cobro"),
          el("small", "", shares),
        );
        row.appendChild(text);

        const amount = el("span", "cm-row-amount");
        amount.appendChild(el("strong", "", formatCurrency(income.paidAmount)));
        amount.appendChild(
          el(
            "span",
            `cm-pill${isInvoiced(income) ? " is-ok" : ""}`,
            isInvoiced(income) ? "Facturado" : "Sin factura",
          ),
        );
        row.appendChild(amount);

        row.addEventListener("click", () => openSheet(income.id));
        container.appendChild(row);
      });
  }

  function render() {
    const data = summary();
    renderTotals(data);
    renderTaxes(data);
    renderPartners(data);
    renderIncomes(data);
  }

  /* ---------- Ficha del cobro ---------- */

  function closeSheet() {
    sheet.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove("rs-sheet-open");
    state.sheetIncomeId = null;
  }

  function currentIncome() {
    return state.incomes.find(
      (income) => String(income.id) === String(state.sheetIncomeId),
    );
  }

  function renderChips(container, options, isSelected, onPick) {
    container.replaceChildren();
    options.forEach((option) => {
      const chip = el("button", "rs-chip", option.label);
      chip.type = "button";
      const selected = isSelected(option);
      chip.classList.toggle("is-active", selected);
      chip.setAttribute("aria-pressed", String(selected));
      chip.addEventListener("click", () => onPick(option));
      container.appendChild(chip);
    });
  }

  function renderSheetChips() {
    const [first, second] = state.partners;

    renderChips(
      $("dn-invoiced-chips"),
      [
        { label: "Sí, con factura", value: true },
        { label: "Sin factura", value: false },
      ],
      (option) => option.value === state.form.invoiced,
      (option) => {
        state.form.invoiced = option.value;
        renderSheetChips();
      },
    );

    $("dn-withheld-field").hidden = !state.form.invoiced;

    renderChips(
      $("dn-split-chips"),
      SPLIT_PRESETS.map(([a, b]) => ({
        label: `${first.name} ${a} · ${second.name} ${b}`,
        value: { [first.key]: a, [second.key]: b },
      })),
      (option) =>
        Number(state.form.split[first.key]) === option.value[first.key] &&
        Number(state.form.split[second.key]) === option.value[second.key],
      (option) => {
        state.form.split = { ...option.value };
        renderSheetChips();
      },
    );

    const income = currentIncome();
    const base = state.form.invoiced
      ? Number(income?.paidAmount || 0) / (1 + IVA_RATE)
      : Number(income?.paidAmount || 0);
    $("dn-split-note").textContent = state.partners
      .map(
        (partner) =>
          `${partner.name}: ${formatCurrency((base * Number(state.form.split[partner.key] || 0)) / 100)}`,
      )
      .join(" · ");
  }

  function openSheet(incomeId) {
    state.sheetIncomeId = incomeId;
    const income = currentIncome();
    if (!income) return;

    const [first, second] = state.partners;
    state.form = {
      invoiced: isInvoiced(income),
      split: {
        [first.key]: Number(income.split?.[first.key] ?? first.share),
        [second.key]: Number(income.split?.[second.key] ?? second.share),
      },
    };

    $("dn-sheet-title").textContent = income.client || "Cobro";
    $("dn-sheet-meta").textContent =
      `${income.concept || ""} · ${income.date || ""}`;
    $("dn-sheet-amount").textContent = formatCurrency(income.paidAmount);
    $("dn-withheld").value = income.withheldIsr
      ? String(income.withheldIsr)
      : "";
    $("dn-sheet-error").textContent = "";
    renderSheetChips();

    backdrop.hidden = false;
    sheet.hidden = false;
    document.body.classList.add("rs-sheet-open");
  }

  sheet.addEventListener("submit", async (event) => {
    event.preventDefault();
    const income = currentIncome();
    if (!income) return;

    const button = $("dn-sheet-submit");
    setButtonLoading(button, true, "Guardando...");

    try {
      await saveIncomeRecord({
        ...income,
        invoiced: state.form.invoiced ? "Sí" : "No",
        withheldIsr: state.form.invoiced
          ? Number(String($("dn-withheld").value).replace(/[^0-9.]/g, "") || 0)
          : 0,
        split: state.form.split,
      });
      await loadData();
      closeSheet();
      render();
      showToast("Cobro actualizado.", { type: "success" });
    } catch (error) {
      console.error("No se pudo guardar el cobro:", error);
      $("dn-sheet-error").textContent =
        error?.message || "No se pudo guardar. Intenta de nuevo.";
    } finally {
      setButtonLoading(button, false);
    }
  });

  $("dn-sheet-close").addEventListener("click", closeSheet);
  backdrop.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !backdrop.hidden) closeSheet();
  });
  $("dn-prev").addEventListener("click", () => {
    state.month = shiftMonth(state.month, -1);
    render();
  });
  $("dn-next").addEventListener("click", () => {
    state.month = shiftMonth(state.month, 1);
    render();
  });

  try {
    await loadData();
    render();
  } catch (error) {
    console.error("No se pudo cargar el dinero de Morfo:", error);
    showToast(error?.message || "No se pudo cargar la información.", {
      type: "error",
      duration: 5000,
    });
  } finally {
    setPageLoading(false);
  }
});
