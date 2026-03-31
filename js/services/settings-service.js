import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { STORAGE_KEYS, getData, saveData } from "./storage.js";
import { db, isFirebaseConfigured } from "./firebase-config.js";

const SETTINGS_COLLECTION = "app";
const SETTINGS_DOC_ID = "settings";

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
};

function getSettingsDocRef() {
  return doc(db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
}

function mergeSettingsWithDefaults(settings = {}) {
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
  });

  const settingsRef = getSettingsDocRef();
  const snapshot = await getDoc(settingsRef);

  const payload = {
    agency: nextSettings.agency,
    terms: nextSettings.terms,
    invoice: nextSettings.invoice,
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
