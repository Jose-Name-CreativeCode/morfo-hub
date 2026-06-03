import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { apiRequest, shouldUseLocalApi } from "./api-client.js";
import { STORAGE_KEYS, getData, saveData } from "./storage.js";
import { db, isFirebaseConfigured } from "./firebase-config.js";

const SETTINGS_COLLECTION = "app";
const SETTINGS_DOC_ID = "settings";

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

function getSettingsDocRef() {
  return doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
}

function mergeSettingsWithDefaults(settings = {}) {
  const hasServiceTemplates = Object.prototype.hasOwnProperty.call(
    settings,
    "serviceTemplates",
  );

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    agency: {
      ...DEFAULT_SETTINGS.agency,
      ...(settings.agency || {}),
    },
    invoice: {
      ...DEFAULT_SETTINGS.invoice,
      ...(settings.invoice || {}),
    },
    commercial: {
      ...DEFAULT_SETTINGS.commercial,
      ...(settings.commercial || {}),
    },
    serviceTemplates: hasServiceTemplates
      ? settings.serviceTemplates || {}
      : DEFAULT_SETTINGS.serviceTemplates,
  };
}

function getLegacySettings() {
  return mergeSettingsWithDefaults(getData(STORAGE_KEYS.SETTINGS, {}));
}

async function migrateLegacySettingsIfNeeded() {
  const legacySettings = getData(STORAGE_KEYS.SETTINGS, {});

  if (!legacySettings || Object.keys(legacySettings).length === 0) return;

  const settingsRef = getSettingsDocRef();
  const snapshot = await getDoc(settingsRef);

  if (snapshot.exists()) return;

  const merged = mergeSettingsWithDefaults(legacySettings);

  await setDoc(settingsRef, {
    ...merged,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function isSettingsRemoteEnabled() {
  return Boolean(isFirebaseConfigured && db);
}

export async function getSettingsRecord() {
  if (shouldUseLocalApi()) {
    const settings = mergeSettingsWithDefaults(await apiRequest("/settings"));
    saveData(STORAGE_KEYS.SETTINGS, settings);
    return settings;
  }

  if (!isSettingsRemoteEnabled()) {
    return getLegacySettings();
  }

  await migrateLegacySettingsIfNeeded();

  const snapshot = await getDoc(getSettingsDocRef());

  if (!snapshot.exists()) {
    const defaults = mergeSettingsWithDefaults();
    saveData(STORAGE_KEYS.SETTINGS, defaults);
    return defaults;
  }

  const settings = mergeSettingsWithDefaults(snapshot.data());
  saveData(STORAGE_KEYS.SETTINGS, settings);
  return settings;
}

export async function saveSettingsRecord(partialSettings) {
  if (shouldUseLocalApi()) {
    const current = getLegacySettings();
    const nextSettings = mergeSettingsWithDefaults({
      ...current,
      ...partialSettings,
      agency: {
        ...current.agency,
        ...(partialSettings.agency || {}),
      },
      invoice: {
        ...current.invoice,
        ...(partialSettings.invoice || {}),
      },
      commercial: {
        ...current.commercial,
        ...(partialSettings.commercial || {}),
      },
      serviceTemplates:
        partialSettings.serviceTemplates !== undefined
          ? partialSettings.serviceTemplates
          : current.serviceTemplates,
    });

    const savedSettings = mergeSettingsWithDefaults(
      await apiRequest("/settings", {
        method: "PUT",
        body: JSON.stringify(nextSettings),
      }),
    );
    saveData(STORAGE_KEYS.SETTINGS, savedSettings);
    return savedSettings;
  }

  if (!isSettingsRemoteEnabled()) {
    const current = getLegacySettings();
    const nextSettings = mergeSettingsWithDefaults({
      ...current,
      ...partialSettings,
      agency: {
        ...current.agency,
        ...(partialSettings.agency || {}),
      },
      invoice: {
        ...current.invoice,
        ...(partialSettings.invoice || {}),
      },
      commercial: {
        ...current.commercial,
        ...(partialSettings.commercial || {}),
      },
      serviceTemplates:
        partialSettings.serviceTemplates !== undefined
          ? partialSettings.serviceTemplates
          : current.serviceTemplates,
    });

    saveData(STORAGE_KEYS.SETTINGS, nextSettings);
    return nextSettings;
  }

  const current = await getSettingsRecord();
  const nextSettings = mergeSettingsWithDefaults({
    ...current,
    ...partialSettings,
    agency: {
      ...current.agency,
      ...(partialSettings.agency || {}),
    },
    invoice: {
      ...current.invoice,
      ...(partialSettings.invoice || {}),
    },
    commercial: {
      ...current.commercial,
      ...(partialSettings.commercial || {}),
    },
    serviceTemplates:
      partialSettings.serviceTemplates !== undefined
        ? partialSettings.serviceTemplates
        : current.serviceTemplates,
  });

  const settingsRef = getSettingsDocRef();
  const snapshot = await getDoc(settingsRef);

  const payload = {
    agency: nextSettings.agency,
    terms: nextSettings.terms,
    invoice: nextSettings.invoice,
    commercial: nextSettings.commercial,
    serviceTemplates: nextSettings.serviceTemplates,
    updatedAt: serverTimestamp(),
  };

  if (snapshot.exists()) {
    await updateDoc(settingsRef, payload);
  } else {
    await setDoc(settingsRef, {
      ...payload,
      createdAt: serverTimestamp(),
    });
  }

  saveData(STORAGE_KEYS.SETTINGS, nextSettings);
  return nextSettings;
}
