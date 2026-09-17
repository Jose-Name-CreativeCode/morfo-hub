import { protectPage } from "../services/auth.js";
import {
  getQuotesCollection,
  saveQuoteRecord,
} from "../services/quotes-service.js";
import { getIncomeCollection } from "../services/income-service.js";
import { getActiveScope, withScopeParam } from "../scopes.js";
import {
  QUOTE_STAGES,
  daysSince,
  getQuoteFunnelStage,
} from "../quote-stages.js";
import {
  formatCurrency,
  getTodayISO,
  setPageLoading,
  showToast,
} from "../utils.js";

// Una cotización enviada sin respuesta después de estos días se marca en naranja.
const COLD_DAYS = 7;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function remainingOf(income) {
  const total = Number(income.totalAmount || 0);
  const paid = Number(income.paidAmount || 0);
  const remaining =
    income.remainingAmount !== undefined && income.remainingAmount !== null
      ? Number(income.remainingAmount || 0)
      : total - paid;
  return Math.max(0, remaining);
}

document.addEventListener("DOMContentLoaded", async () => {
  const scope = getActiveScope();

  // El embudo es sólo de Morfo; Personal y Casa tienen su propio Resumen.
  if (scope !== "morfo") {
    window.location.replace(withScopeParam("resumen.html", scope));
    return;
  }

  setPageLoading(true);
  const user = await protectPage();
  if (!user) return;

  const today = getTodayISO();
  const state = { quotes: [], incomes: [], sheetQuoteId: null };

  const $ = (id) => document.getElementById(id);
  const backdrop = $("cm-backdrop");
  const sheet = $("cm-sheet");

  async function loadData() {
    const [quotes, incomes] = await Promise.all([
      getQuotesCollection(),
      getIncomeCollection(),
    ]);
    state.quotes = quotes;
    state.incomes = incomes.filter(
      (income) => String(income.scope || "morfo") === "morfo",
    );
  }

  /* ---------- Números de arriba ---------- */

  function renderKpis() {
    const openCharges = state.incomes.filter(
      (income) => remainingOf(income) > 0,
    );
    const pending = openCharges.reduce(
      (sum, income) => sum + remainingOf(income),
      0,
    );
    const month = today.slice(0, 7);
    const collected = state.incomes
      .filter((income) => String(income.date || "").startsWith(month))
      .reduce((sum, income) => sum + Number(income.paidAmount || 0), 0);

    const openQuotes = state.quotes.filter((quote) =>
      ["prospect", "sent"].includes(getQuoteFunnelStage(quote).key),
    );
    const pipeline = openQuotes.reduce(
      (sum, quote) => sum + Number(quote.total || 0),
      0,
    );
    const sentCount = state.quotes.filter(
      (quote) => getQuoteFunnelStage(quote).key === "sent",
    ).length;

    $("cm-pending").textContent = formatCurrency(pending);
    $("cm-pending-note").textContent = openCharges.length
      ? `${openCharges.length} ${openCharges.length === 1 ? "cobro abierto" : "cobros abiertos"}`
      : "Sin cobros pendientes";
    $("cm-collected").textContent = formatCurrency(collected);
    $("cm-collected-note").textContent = "Pagos recibidos este mes";
    $("cm-pipeline").textContent = formatCurrency(pipeline);
    $("cm-pipeline-note").textContent =
      `${openQuotes.length} sin cerrar · ${sentCount} enviadas`;
  }

  /* ---------- Embudo ---------- */

  function renderFunnel() {
    const container = $("cm-funnel");
    container.replaceChildren();

    QUOTE_STAGES.forEach((stage) => {
      const quotes = state.quotes.filter(
        (quote) => getQuoteFunnelStage(quote).key === stage.key,
      );
      const total = quotes.reduce(
        (sum, quote) => sum + Number(quote.total || 0),
        0,
      );

      const column = el("div", "cm-col");
      const head = el("div", "cm-col-head");
      head.append(el("b", "", stage.label), el("i", "", String(quotes.length)));
      column.append(head, el("div", "cm-col-total", formatCurrency(total)));

      if (!quotes.length) {
        column.appendChild(el("p", "cm-col-empty", "Nada aquí todavía"));
      }

      quotes.forEach((quote) => {
        const card = el("button", "cm-deal");
        card.type = "button";
        card.append(
          el("b", "", quote.client || "Sin cliente"),
          el("span", "", quote.title || "Sin título"),
        );

        const foot = el("div", "cm-deal-foot");
        foot.appendChild(el("strong", "", formatCurrency(quote.total)));

        const age = daysSince(quote.date, today);
        const isCold =
          age > COLD_DAYS && ["prospect", "sent"].includes(stage.key);
        foot.appendChild(
          el(
            "span",
            `cm-age${isCold ? " is-cold" : ""}`,
            isCold
              ? `${age} días sin respuesta`
              : quote.publicId || quote.date || "",
          ),
        );

        card.appendChild(foot);
        card.addEventListener("click", () => openSheet(quote.id));
        column.appendChild(card);
      });

      container.appendChild(column);
    });
  }

  /* ---------- Cobros ---------- */

  function renderCharges() {
    const container = $("cm-charges");
    container.replaceChildren();

    const rows = [...state.incomes].sort(
      (a, b) =>
        remainingOf(b) - remainingOf(a) ||
        String(b.date).localeCompare(String(a.date)),
    );

    if (!rows.length) {
      container.appendChild(
        el("p", "cm-col-empty", "Todavía no hay cobros registrados."),
      );
      return;
    }

    rows.slice(0, 6).forEach((income) => {
      const left = remainingOf(income);
      const link = el("a", "cm-row");
      link.href = "income.html?scope=morfo";

      link.appendChild(
        el("span", "cm-dot", (income.client || "?").charAt(0).toUpperCase()),
      );

      const text = el("span", "cm-row-text");
      text.append(
        el("b", "", income.client || "Sin cliente"),
        el("small", "", income.concept || "Sin concepto"),
      );
      link.appendChild(text);

      const amount = el("span", "cm-row-amount");
      amount.appendChild(
        el("strong", "", formatCurrency(left || income.totalAmount)),
      );
      amount.appendChild(
        el(
          "span",
          `cm-pill${left ? "" : " is-ok"}`,
          left ? "Por cobrar" : "Pagado",
        ),
      );
      link.appendChild(amount);

      container.appendChild(link);
    });
  }

  function render() {
    renderKpis();
    renderFunnel();
    renderCharges();
  }

  /* ---------- Ficha de la cotización ---------- */

  function closeSheet() {
    sheet.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove("rs-sheet-open");
    state.sheetQuoteId = null;
  }

  function openSheet(quoteId) {
    const quote = state.quotes.find(
      (item) => String(item.id) === String(quoteId),
    );
    if (!quote) return;

    state.sheetQuoteId = quote.id;
    const stage = getQuoteFunnelStage(quote);

    $("cm-sheet-title").textContent = quote.client || "Cotización";
    $("cm-sheet-meta").textContent =
      `${quote.publicId || ""} · ${quote.title || ""}`;
    $("cm-sheet-amount").textContent = formatCurrency(quote.total);

    const list = $("cm-sheet-list");
    list.replaceChildren();
    [
      ["Etapa", stage.label],
      ["Fecha", quote.date || "-"],
      ["Sin respuesta", `${daysSince(quote.date, today)} días`],
      ["Servicio", quote.serviceType || "-"],
    ].forEach(([label, value]) => {
      const row = el("div");
      row.append(el("dt", "", label), el("dd", "", value));
      list.appendChild(row);
    });

    renderStageActions(quote, stage);
    $("cm-sheet-open").href =
      `quotes.html?scope=morfo&quote=${encodeURIComponent(quote.id)}`;

    backdrop.hidden = false;
    sheet.hidden = false;
    document.body.classList.add("rs-sheet-open");
  }

  /**
   * Sólo los cambios de etapa que no mueven dinero. Aprobar y cobrar sigue en
   * la ficha de la cotización, donde ya se crea el cobro.
   */
  function renderStageActions(quote, stage) {
    const picker = $("cm-stage-picker");
    picker.replaceChildren();

    const actions = [];
    if (stage.key === "prospect") {
      actions.push(["Marcar como enviada", "enviada"]);
    }
    if (stage.key === "sent") {
      actions.push(["Regresar a prospecto", "borrador"]);
    }
    if (stage.key !== "paid") {
      actions.push(["Archivar", "archivada"]);
    }

    actions.forEach(([label, status]) => {
      const button = el("button", "cm-chip", label);
      button.type = "button";
      button.addEventListener("click", () => changeStatus(quote, status));
      picker.appendChild(button);
    });
  }

  async function changeStatus(quote, status) {
    try {
      await saveQuoteRecord({ ...quote, status });
      await loadData();
      closeSheet();
      render();
      showToast(
        status === "archivada"
          ? "Cotización archivada."
          : `Cotización marcada como ${status}.`,
        { type: "success" },
      );
    } catch (error) {
      console.error("No se pudo cambiar la etapa:", error);
      showToast(error?.message || "No se pudo cambiar la etapa.", {
        type: "error",
      });
    }
  }

  $("cm-sheet-close").addEventListener("click", closeSheet);
  backdrop.addEventListener("click", closeSheet);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !backdrop.hidden) closeSheet();
  });

  window.addEventListener("focus", async () => {
    if (!backdrop.hidden) return;
    try {
      await loadData();
      render();
    } catch (error) {
      console.warn("No se pudo actualizar el embudo:", error);
    }
  });

  try {
    await loadData();
    render();
  } catch (error) {
    console.error("No se pudo cargar el embudo:", error);
    showToast(error?.message || "No se pudo cargar la información.", {
      type: "error",
      duration: 5000,
    });
  } finally {
    setPageLoading(false);
  }
});
