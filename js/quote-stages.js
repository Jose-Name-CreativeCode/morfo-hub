import { normalizeText } from "./utils.js";

/**
 * Etapa de una cotización dentro del embudo comercial.
 * Se deduce del estado de la cotización y de lo que ya se pagó, para que la
 * página de Cotizaciones y el embudo muestren siempre lo mismo.
 */

export const QUOTE_STAGES = [
  { key: "prospect", label: "Prospecto", className: "funnel-prospect" },
  { key: "sent", label: "Cotización enviada", className: "funnel-sent" },
  { key: "advance", label: "Anticipo", className: "funnel-advance" },
  { key: "paid", label: "Pagado total", className: "funnel-paid" },
];

export function getQuoteFunnelStage(quote) {
  const paymentStatus = normalizeText(quote?.paymentStatus || "no pagada");
  const status = normalizeText(quote?.status || "borrador");

  if (status === "archivada") {
    return {
      key: "archived",
      label: "Archivada",
      className: "funnel-archived",
    };
  }

  if (paymentStatus === "pagada total") {
    return { key: "paid", label: "Pagado total", className: "funnel-paid" };
  }

  if (paymentStatus === "anticipo pagado") {
    return {
      key: "advance",
      label: "Anticipo recibido",
      className: "funnel-advance",
    };
  }

  if (status === "aprobada") {
    return {
      key: "advance",
      label: "Esperando anticipo",
      className: "funnel-advance",
    };
  }

  if (status === "enviada") {
    return {
      key: "sent",
      label: "Cotización enviada",
      className: "funnel-sent",
    };
  }

  return { key: "prospect", label: "Prospecto", className: "funnel-prospect" };
}

/** Días desde que se hizo la cotización, para detectar las que se enfriaron. */
export function daysSince(isoDate, today) {
  if (!isoDate) return 0;
  const start = Date.parse(`${String(isoDate).slice(0, 10)}T12:00:00`);
  const end = Date.parse(`${today}T12:00:00`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86400000);
}
