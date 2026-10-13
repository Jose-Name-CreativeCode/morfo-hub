import { protectPage } from "../services/auth.js";
import {
  getSettingsRecord,
  saveSettingsRecord,
} from "../services/settings-service.js";
import { getActiveScope, getFinanceConfig, withScopeParam } from "../scopes.js";
import { buildBudget, splitBudgetByQuincena } from "../casa-costs.js";
import {
  CAR_TEMPLATE,
  DEFAULT_CUSHION,
  EVERY_MONTH,
  EVERY_WEEK,
  EVERY_YEAR,
  buildDecision,
  paidByMe,
  savingsFromCuts,
  variableItems,
} from "../casa-decisions.js";
import { FUNDED_BY_ME, FUNDED_BY_PAPA } from "../card-ledger.js";
import { monthlyAmount } from "../reminders.js";
import { setPageLoading, showToast } from "../utils.js";

function money(amount) {
  const value = Number(amount || 0);
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

function parseAmount(text) {
  const value = Number(String(text || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function plainNumber(value) {
  return value ? Number(value).toLocaleString("es-MX") : "";
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const HALVES = [
  {
    key: "first",
    name: "1ª quincena",
    range: "del 1 al 15",
    in: "la 1ª quincena",
  },
  {
    key: "second",
    name: "2ª quincena",
    range: "del 16 al fin de mes",
    in: "la 2ª quincena",
  },
];

const VERDICT_TAGS = {
  "sin-ingreso": "Falta un dato",
  "sin-costos": "Falta un dato",
  alcanza: "Sí alcanza",
  justo: "Justo",
  "no-alcanza": "No alcanza",
};

document.addEventListener("DOMContentLoaded", async () => {
  const scope = getActiveScope();

  // Decidir trabaja con los gastos de la casa; los demás espacios no lo tienen.
  if (scope !== "casa") {
    window.location.replace(withScopeParam("resumen.html", scope));
    return;
  }

  setPageLoading(true);
  const user = await protectPage();
  if (!user) return;

  const state = {
    settings: null,
    items: [],
    fixedCategories: [],
    budget: buildBudget(),
    paymentMethods: [],
    // A papá le pagan por quincena: todo se compara contra eso.
    incomeQ: 0,
    half: "",
    cushion: DEFAULT_CUSHION,
    title: "Carro",
    lines: [],
    cuts: {},
  };

  const $ = (id) => document.getElementById(id);

  async function loadData() {
    state.settings = await getSettingsRecord();
    const finance = getFinanceConfig(state.settings, "casa");
    state.items = finance.reminders;
    state.fixedCategories = finance.fixedCategories;
    state.paymentMethods = finance.paymentMethods;
    state.budget = buildBudget(state.items, state.fixedCategories);

    const saved = state.settings.finance?.casa?.decision || {};
    state.incomeQ = Number(
      saved.incomePerQuincena ?? (saved.income ? saved.income / 2 : 0),
    );
    state.half = saved.half || "";
    state.cushion = Number(saved.cushion ?? DEFAULT_CUSHION);
    state.title = saved.title || "Carro";
    state.lines =
      Array.isArray(saved.lines) && saved.lines.length
        ? saved.lines
        : CAR_TEMPLATE.map((line) => ({ ...line }));
    state.cuts = saved.cuts || {};
  }

  /** Lo que se escribe aquí se guarda en Ajustes de Casa, junto a sus gastos. */
  async function save() {
    try {
      const finance = state.settings.finance || {};
      state.settings = await saveSettingsRecord({
        ...state.settings,
        finance: {
          ...finance,
          casa: {
            ...(finance.casa || {}),
            decision: {
              incomePerQuincena: state.incomeQ,
              half: state.half,
              cushion: state.cushion,
              title: state.title,
              lines: state.lines,
              cuts: state.cuts,
            },
          },
        },
      });
    } catch (error) {
      console.error("No se pudo guardar la decisión:", error);
      showToast(error?.message || "No se pudo guardar.", { type: "error" });
    }
  }

  /** Los gastos de la casa con los recortes ya aplicados. */
  function adjustedItems() {
    return state.items.map((item) => {
      const cut = Number(state.cuts[item.id] || 0);
      return cut
        ? { ...item, amount: Number(item.amount || 0) * (1 - cut / 100) }
        : item;
    });
  }

  function currentHalves() {
    return splitBudgetByQuincena(adjustedItems(), state.paymentMethods);
  }

  /** Dónde se pagaría: lo que se eligió o, si no, la quincena más holgada. */
  function chosenIndex(halves) {
    if (state.half) return state.half === "first" ? 0 : 1;
    return halves[1].total <= halves[0].total ? 1 : 0;
  }

  function decisionFor(half) {
    return buildDecision({
      income: state.incomeQ,
      budgetTotal: half.total,
      cushion: state.cushion,
      lines: state.lines,
    });
  }

  /* ---------- 1. Cómo estamos cada quincena ---------- */

  function renderHalves(halves, chosen) {
    const container = $("dc-halves");
    container.replaceChildren();

    halves.forEach((half, index) => {
      const info = HALVES[index];
      const free = state.incomeQ - half.total;
      const card = el("article", "dc-half");
      card.classList.toggle("is-chosen", index === chosen);

      const head = el("header", "dc-half-head");
      head.append(el("strong", "", info.name), el("span", "", info.range));
      if (index === chosen) {
        head.appendChild(
          el(
            "em",
            "dc-half-badge",
            `Aquí: ${state.title.trim() || "lo nuevo"}`,
          ),
        );
      }

      const nums = el("div", "dc-half-nums");
      const out = el("div");
      out.append(el("span", "", "Sale"), el("strong", "", money(half.total)));
      const left = el("div");
      const leftValue = el(
        "strong",
        free < 0 ? "is-negative" : "",
        state.incomeQ ? money(free) : "—",
      );
      left.append(el("span", "", "Sobra"), leftValue);
      if (state.incomeQ) {
        left.appendChild(
          el(
            "small",
            "",
            `${Math.round((free / state.incomeQ) * 100)}% de ${money(state.incomeQ)}`,
          ),
        );
      }
      nums.append(out, left);

      const bar = el("div", "dc-bar");
      bar.setAttribute("aria-hidden", "true");
      [
        ["is-out", half.total],
        ["is-free", state.incomeQ ? Math.max(0, free) : 0],
      ].forEach(([className, amount]) => {
        if (amount <= 0) return;
        const piece = el("i", className);
        piece.style.flexGrow = String(amount);
        bar.appendChild(piece);
      });

      const details = el("details", "dc-half-list");
      details.appendChild(el("summary", "", `Qué sale (${half.items.length})`));
      const list = el("ul");
      half.items.forEach((row) => {
        const item = el("li");
        const text = el("span", "", row.name);
        text.appendChild(el("small", "", row.when));
        item.append(text, el("b", "", money(row.amount)));
        list.appendChild(item);
      });
      details.appendChild(list);

      card.append(head, nums, bar, details);
      container.appendChild(card);
    });

    const total = halves[0].total + halves[1].total;
    const note = $("dc-now-note");
    note.replaceChildren();
    if (!state.budget.total) {
      note.append("Primero agrega los gastos de la casa en ");
      const link = el("a", "", "Ajustes");
      link.href = "finance-settings.html?scope=casa";
      note.append(link, ".");
    } else if (!state.incomeQ) {
      note.textContent =
        "Escribe cuánto entra cada quincena para ver cuánto sobra en cada una.";
    } else {
      note.textContent = `Al mes entran ${money(state.incomeQ * 2)}, salen ${money(total)} y sobran ${money(state.incomeQ * 2 - total)}. Lo de la tarjeta sale el 17, en la 2ª quincena.`;
    }
  }

  /* ---------- 2. Lo que se quiere decidir ---------- */

  function renderLines() {
    const container = $("dc-lines");
    container.replaceChildren();

    state.lines.forEach((line, index) => {
      const row = el("div", "dc-line");

      const name = el("input", "dc-line-name");
      name.type = "text";
      name.value = line.name || "";
      name.placeholder = "Concepto";
      name.setAttribute("aria-label", "Concepto");
      name.addEventListener("input", () => {
        line.name = name.value;
      });
      name.addEventListener("change", save);

      const amountBox = el("span", "dc-money dc-line-amount", "$");
      const amount = el("input");
      amount.inputMode = "decimal";
      amount.placeholder = "0";
      amount.autocomplete = "off";
      amount.value = plainNumber(line.amount);
      amount.setAttribute(
        "aria-label",
        `Monto de ${line.name || "este costo"}`,
      );
      amount.addEventListener("input", () => {
        line.amount = parseAmount(amount.value);
        render();
      });
      amount.addEventListener("blur", () => {
        amount.value = plainNumber(line.amount);
      });
      amount.addEventListener("change", save);
      amountBox.appendChild(amount);

      const every = el("select", "dc-line-every");
      every.setAttribute("aria-label", "Cada cuándo");
      [
        [EVERY_WEEK, "semanal"],
        [EVERY_MONTH, "mensual"],
        [EVERY_YEAR, "anual"],
      ].forEach(([value, label]) => {
        const option = el("option", "", label);
        option.value = value;
        every.appendChild(option);
      });
      every.value = line.every || EVERY_MONTH;
      every.addEventListener("change", () => {
        line.every = every.value;
        render();
        save();
      });

      // Lo que paga Manolo no sale de la casa: se cuenta aparte.
      const payer = el("select", "dc-line-payer");
      payer.setAttribute("aria-label", "Quién lo paga");
      [
        [FUNDED_BY_PAPA, "Papá"],
        [FUNDED_BY_ME, "Manolo"],
      ].forEach(([value, label]) => {
        const option = el("option", "", label);
        option.value = value;
        payer.appendChild(option);
      });
      payer.value = paidByMe(line) ? FUNDED_BY_ME : FUNDED_BY_PAPA;
      payer.classList.toggle("is-mine", paidByMe(line));
      payer.addEventListener("change", () => {
        line.paidBy = payer.value;
        payer.classList.toggle("is-mine", paidByMe(line));
        render();
        save();
      });

      row.append(name, amountBox, every, payer);

      // La mensualidad no se quita: es con la que se calcula el máximo.
      if (!line.main) {
        const remove = el("button", "dc-line-remove", "×");
        remove.type = "button";
        remove.setAttribute("aria-label", `Quitar ${line.name || "costo"}`);
        remove.addEventListener("click", () => {
          state.lines.splice(index, 1);
          renderLines();
          render();
          save();
        });
        row.appendChild(remove);
      } else {
        row.appendChild(el("span", "dc-line-remove is-placeholder"));
      }

      container.appendChild(row);
    });
  }

  /* ---------- 3. El veredicto ---------- */

  function renderVerdict(result, other, chosen) {
    const title = state.title.trim() || "Esto";
    const here = HALVES[chosen].in;
    const there = HALVES[1 - chosen].in;
    const section = $("dc-verdict");
    section.className = `dc-verdict is-${result.verdict}`;
    $("dc-verdict-tag").textContent = VERDICT_TAGS[result.verdict];

    const pct = result.freeAfterPercent;
    const copy = {
      "sin-ingreso": [
        "Escribe cuánto entra cada quincena",
        "Con eso te digo si alcanza y en qué quincena conviene pagarlo.",
      ],
      "sin-costos": [
        "Escribe lo que cuesta",
        "Empieza por la mensualidad; luego el seguro y lo demás.",
      ],
      alcanza: [
        `${title}: sí cabe en ${here}`,
        `Después de pagar su parte, en ${here} sobrarían ${money(result.freeAfter)} de ${money(state.incomeQ)}, el ${pct}%. Tu colchón del ${state.cushion}% sigue completo.`,
      ],
      justo: [
        `${title}: cabe en ${here}, pero sin colchón`,
        `En esa quincena sobrarían ${money(result.freeAfter)} (${pct}%), menos del ${state.cushion}% que quieres que sobre.`,
      ],
      "no-alcanza": [
        `${title}: no cabe en ${here}`,
        `En esa quincena faltarían ${money(-result.freeAfter)}.`,
      ],
    }[result.verdict];
    $("dc-verdict-title").textContent = copy[0];
    // Lo de Manolo no cambia el veredicto, pero conviene tenerlo a la vista.
    const mine = state.lines.filter(
      (line) => paidByMe(line) && Number(line.amount) > 0,
    );
    const mineNote =
      result.income && result.mineMonthly > 0
        ? ` Aparte, tú pondrías ${money(result.mineMonthly)} al mes (${mine
            .map((line) => (line.name || "otro costo").toLowerCase())
            .join(" y ")}).`
        : "";
    $("dc-verdict-text").textContent =
      result.verdict === "sin-ingreso" || result.verdict === "sin-costos"
        ? copy[1]
        : copy[1] + mineNote;

    const after = $("dc-after");
    after.textContent = result.income ? money(result.freeAfter) : "—";
    after.classList.toggle(
      "is-negative",
      result.income > 0 && result.freeAfter < 0,
    );

    $("dc-max-label").textContent = result.hasMain
      ? "Mensualidad máxima"
      : "Lo máximo";
    const max = result.hasMain ? result.maxMain : result.maxCommit;
    $("dc-max").textContent = !result.income
      ? "—"
      : max > 0
        ? money(max)
        : "No cabe";

    const notes = [];
    if (result.income) {
      // Si no alcanza, lo útil es saber cuánto tendría que entrar.
      if (result.verdict === "no-alcanza" || result.verdict === "justo") {
        notes.push(
          `Para pagarlo en ${here} y que siga sobrando tu ${state.cushion}%, tendría que entrar ${money(result.incomeNeeded)} por quincena.`,
        );
      } else if (result.hasMain && result.extras > 0) {
        notes.push(
          `La mensualidad máxima ya descuenta ${money(result.extras)} al mes de lo demás que también paga papá.`,
        );
      }
      const otherMax = other.hasMain ? other.maxMain : other.maxCommit;
      notes.push(
        otherMax > 0
          ? `En ${there}, la máxima sería ${money(otherMax)}.`
          : `En ${there} no cabría.`,
      );
    }
    $("dc-max-note").textContent = notes.join(" ");
  }

  /* ---------- 4. Recortes ---------- */

  function renderCuts() {
    const container = $("dc-cuts");
    container.replaceChildren();
    const variables = variableItems(state.items, state.fixedCategories);

    if (!variables.length) {
      container.appendChild(
        el("p", "rs-empty", "No hay gastos variables en tu lista."),
      );
      return;
    }

    variables.forEach((item) => {
      const monthly = monthlyAmount(item);
      const row = el("div", "dc-cut");

      const head = el("div", "dc-cut-head");
      head.append(el("strong", "", item.name), el("span", "", money(monthly)));

      const slider = el("input");
      slider.type = "range";
      slider.min = "0";
      slider.max = "50";
      slider.step = "5";
      slider.value = String(state.cuts[item.id] || 0);
      slider.setAttribute("aria-label", `Recortar ${item.name}`);

      const output = el("span", "dc-cut-out");
      const paint = () => {
        const percent = Number(slider.value);
        output.textContent = percent
          ? `−${percent}% · liberas ${money((monthly * percent) / 100)}`
          : "Sin recorte";
        output.classList.toggle("is-on", percent > 0);
      };
      paint();

      slider.addEventListener("input", () => {
        const percent = Number(slider.value);
        if (percent) state.cuts[item.id] = percent;
        else delete state.cuts[item.id];
        paint();
        render();
      });
      slider.addEventListener("change", save);

      row.append(head, slider, output);
      container.appendChild(row);
    });
  }

  function render() {
    const halves = currentHalves();
    const chosen = chosenIndex(halves);
    const result = decisionFor(halves[chosen]);
    renderHalves(halves, chosen);
    $("dc-half-pick").value = HALVES[chosen].key;
    $("dc-plan-total").textContent = money(result.planMonthly);
    $("dc-plan-mine").textContent = money(result.mineMonthly);
    renderVerdict(result, decisionFor(halves[1 - chosen]), chosen);

    const saved = savingsFromCuts(
      variableItems(state.items, state.fixedCategories),
      state.cuts,
    );
    $("dc-cuts-note").textContent = saved
      ? `Recortando liberas ${money(saved)} al mes; ya está contado arriba.`
      : "Mueve una barra para ver cuánto se libera.";
  }

  /* ---------- Campos fijos ---------- */

  const incomeInput = $("dc-income");
  incomeInput.addEventListener("input", () => {
    state.incomeQ = parseAmount(incomeInput.value);
    render();
  });
  incomeInput.addEventListener("blur", () => {
    incomeInput.value = plainNumber(state.incomeQ);
  });
  incomeInput.addEventListener("change", save);

  $("dc-half-pick").addEventListener("change", (event) => {
    state.half = event.target.value;
    render();
    save();
  });

  const cushionInput = $("dc-cushion");
  cushionInput.addEventListener("input", () => {
    state.cushion = Math.min(80, Math.max(0, Number(cushionInput.value || 0)));
    render();
  });
  cushionInput.addEventListener("change", save);

  const titleInput = $("dc-title");
  titleInput.addEventListener("input", () => {
    state.title = titleInput.value;
    render();
  });
  titleInput.addEventListener("change", save);

  $("dc-add-line").addEventListener("click", () => {
    state.lines.push({
      id: `costo-${Date.now()}`,
      name: "",
      amount: 0,
      every: EVERY_MONTH,
      paidBy: FUNDED_BY_PAPA,
    });
    renderLines();
    render();
    $("dc-lines").querySelector(".dc-line:last-child .dc-line-name")?.focus();
  });

  try {
    await loadData();
    incomeInput.value = plainNumber(state.incomeQ);
    cushionInput.value = String(state.cushion);
    titleInput.value = state.title;
    renderLines();
    renderCuts();
    render();
  } catch (error) {
    console.error("No se pudo cargar Decidir:", error);
    showToast(error?.message || "No se pudo cargar la información.", {
      type: "error",
      duration: 5000,
    });
  } finally {
    setPageLoading(false);
  }
});
