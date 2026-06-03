import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const settingsRouter = Router();

const SETTINGS_ID = "app";

const DEFAULT_SERVICE_TEMPLATES = {
  "Redes sociales": {
    title: "Plan mensual de redes sociales",
    description:
      "Gestión mensual de redes sociales enfocada en mantener presencia constante, comunicar la propuesta de valor de la marca y fortalecer la relación con la comunidad digital.",
    includes:
      "Planeación estratégica mensual de contenido.\nCalendario editorial para redes sociales.\nDiseño de publicaciones para feed e historias.\nRedacción de copies adaptados a la marca.\nProgramación y publicación de contenido.\nCommunity management básico.\nReporte mensual de desempeño y recomendaciones.",
  },
  "Publicidad digital": {
    title: "Plan mensual + pauta digital",
    description:
      "Estrategia de publicidad digital enfocada en generar alcance, tráfico, mensajes o conversiones mediante campañas pagadas en plataformas como Meta Ads.",
    includes:
      "Definición de objetivo publicitario.\nConfiguración de campañas en Meta Ads.\nSegmentación de audiencias.\nCreación de estructura de campaña, conjuntos y anuncios.\nMonitoreo y optimización básica durante el periodo activo.\nReporte de resultados y lectura de métricas.\nNota: la inversión en pauta se paga directamente a la plataforma y no forma parte del servicio de gestión.",
  },
  "Página web": {
    title: "Desarrollo de página web",
    description:
      "Diseño y desarrollo de sitio web profesional para presentar la marca, sus servicios y canales de contacto. El desarrollo puede realizarse con código personalizado o en WordPress según el alcance del proyecto.",
    includes:
      "Levantamiento de requerimientos del sitio.\nArquitectura básica de secciones.\nDiseño visual adaptado a la identidad de la marca.\nDesarrollo en WordPress o código según el proyecto.\nConfiguración inicial en hosting, preferentemente Hostinger.\nDiseño responsive para escritorio y móvil.\nIntegración de formulario o canales de contacto.\nPruebas básicas de navegación antes de entrega.",
  },
  "Mantenimiento web": {
    title: "Mantenimiento web mensual",
    description:
      "Servicio de mantenimiento para sitios web en WordPress alojados en Hostinger, enfocado en conservar el sitio actualizado, funcional y estable.",
    includes:
      "Revisión general del sitio web.\nActualización controlada de WordPress, tema y plugins.\nRespaldo básico antes de cambios importantes.\nRevisión de formularios y enlaces principales.\nAjustes menores de contenido solicitados durante el periodo.\nMonitoreo básico de funcionamiento.\nSoporte preventivo para reducir errores visibles al usuario.",
  },
  "Hosting / Dominio": {
    title: "Hosting y dominio",
    description:
      "Gestión y configuración básica de hosting y dominio para mantener un sitio web disponible en línea, incluyendo orientación técnica para servicios como Hostinger.",
    includes:
      "Asesoría o gestión básica de compra de dominio.\nConfiguración inicial de hosting.\nVinculación de dominio con hosting.\nConfiguración básica de DNS cuando aplique.\nInstalación inicial de WordPress si el proyecto lo requiere.\nRevisión de acceso al panel de hosting.\nAcompañamiento básico para renovación o administración del servicio.",
  },
  Personalizado: {
    title: "Plan personalizado de marketing digital",
    description:
      "Propuesta personalizada de servicios digitales según las necesidades del cliente, ideal para combinar manejo de redes sociales, publicidad digital, levantamiento de contenido y acciones puntuales de comunicación.",
    includes:
      "Diagnóstico inicial de necesidades.\nDefinición de alcance personalizado.\nManejo o acompañamiento en redes sociales.\nPlaneación de contenido.\nLevantamiento de contenido básico según disponibilidad.\nApoyo en campañas publicitarias digitales.\nRecomendaciones de mejora para presencia digital.\nEntregables ajustados al objetivo comercial del cliente.",
  },
};

const DEFAULT_SETTINGS = {
  agency: {
    name: "Morfo Studio",
    email: "",
    phone: "",
    address: "",
    website: "",
  },
  terms: "",
  invoice: {
    tax: 16,
    note: "",
  },
  commercial: {
    advancePercent: 50,
    paymentMethods: ["Transferencia", "Efectivo", "Tarjeta", "Otro"],
    bankDetails: "",
    bankDetailsInvoice:
      "Banco: BBVA\nTitular: Morfo Studio S.A. de C.V.\nCLABE: 012345678901234567\nRFC: MOR000000XXX\nConcepto: Nombre del cliente + servicio",
    bankDetailsNoInvoice:
      "Banco: Nu\nTitular: Nombre Apellido\nCLABE: 987654321098765432\nConcepto: Nombre del cliente + servicio",
    legalNote: "",
  },
  serviceTemplates: DEFAULT_SERVICE_TEMPLATES,
};

function safeParseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function mapSettingsRecord(record) {
  if (!record) return DEFAULT_SETTINGS;

  return {
    agency: {
      name: record.agencyName,
      email: record.agencyEmail,
      phone: record.agencyPhone,
      address: record.agencyAddress,
      website: record.agencyWebsite,
    },
    terms: record.terms,
    invoice: {
      tax: record.invoiceTax,
      note: record.invoiceNote,
    },
    commercial: {
      advancePercent: record.advancePercent,
      paymentMethods: safeParseJson(
        record.paymentMethodsJson,
        DEFAULT_SETTINGS.commercial.paymentMethods,
      ),
      bankDetails: record.bankDetails,
      bankDetailsInvoice: record.bankDetailsInvoice,
      bankDetailsNoInvoice: record.bankDetailsNoInvoice,
      legalNote: record.legalNote,
    },
    serviceTemplates: safeParseJson(
      record.serviceTemplatesJson,
      DEFAULT_SETTINGS.serviceTemplates,
    ),
  };
}

function mapSettingsPayload(body = {}) {
  const agency = body.agency || {};
  const invoice = body.invoice || {};
  const commercial = body.commercial || {};

  return {
    agencyName: String(agency.name || DEFAULT_SETTINGS.agency.name),
    agencyEmail: String(agency.email || ""),
    agencyPhone: String(agency.phone || ""),
    agencyAddress: String(agency.address || ""),
    agencyWebsite: String(agency.website || ""),
    terms: String(body.terms || ""),
    invoiceTax: Number(invoice.tax ?? DEFAULT_SETTINGS.invoice.tax),
    invoiceNote: String(invoice.note || ""),
    advancePercent: Number(
      commercial.advancePercent ?? DEFAULT_SETTINGS.commercial.advancePercent,
    ),
    paymentMethodsJson: JSON.stringify(
      Array.isArray(commercial.paymentMethods)
        ? commercial.paymentMethods
        : DEFAULT_SETTINGS.commercial.paymentMethods,
    ),
    bankDetails: String(commercial.bankDetails || ""),
    bankDetailsInvoice: String(
      commercial.bankDetailsInvoice ||
        DEFAULT_SETTINGS.commercial.bankDetailsInvoice,
    ),
    bankDetailsNoInvoice: String(
      commercial.bankDetailsNoInvoice ||
        DEFAULT_SETTINGS.commercial.bankDetailsNoInvoice,
    ),
    legalNote: String(commercial.legalNote || ""),
    serviceTemplatesJson: JSON.stringify(
      body.serviceTemplates || DEFAULT_SETTINGS.serviceTemplates,
    ),
  };
}

async function getOrCreateSettings() {
  const existing = await prisma.appSettings.findUnique({
    where: { id: SETTINGS_ID },
  });

  if (existing) {
    return existing;
  }

  return prisma.appSettings.create({
    data: {
      id: SETTINGS_ID,
      ...mapSettingsPayload(DEFAULT_SETTINGS),
    },
  });
}

settingsRouter.get("/", async (_request, response) => {
  const settings = await getOrCreateSettings();
  response.json(mapSettingsRecord(settings));
});

settingsRouter.put("/", async (request, response) => {
  const existing = await getOrCreateSettings();
  const nextSettings = await prisma.appSettings.update({
    where: { id: existing.id },
    data: mapSettingsPayload(request.body),
  });

  response.json(mapSettingsRecord(nextSettings));
});
