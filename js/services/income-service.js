import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { STORAGE_KEYS, getData, saveData } from "./storage.js";
import { db, isFirebaseConfigured } from "./firebase-config.js";

const COLLECTION_NAME = "income";
const MIGRATED_KEY = `${STORAGE_KEYS.INCOME}_firestore_migrated`;

function sortIncomes(incomes) {
  return [...incomes].sort((a, b) => {
    const dateDiff = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateDiff !== 0) return dateDiff;

    const updatedA = Number(a.updatedAtMs || a.createdAtMs || 0);
    const updatedB = Number(b.updatedAtMs || b.createdAtMs || 0);
    return updatedB - updatedA;
  });
}

function mapIncomeFromDoc(snapshot) {
  const data = snapshot.data();

  return {
    ...data,
    id: snapshot.id,
    legacyId: data.legacyId || data.id || "",
    createdAtMs: data.createdAt?.toMillis?.() || 0,
    updatedAtMs: data.updatedAt?.toMillis?.() || 0,
  };
}

function getLegacyIncomes() {
  return getData(STORAGE_KEYS.INCOME, []);
}

async function migrateLegacyIncomesIfNeeded() {
  if (localStorage.getItem(MIGRATED_KEY) === "true") return;

  const legacyIncomes = getLegacyIncomes();

  if (!legacyIncomes.length) {
    localStorage.setItem(MIGRATED_KEY, "true");
    return;
  }

  const collectionRef = collection(db, COLLECTION_NAME);
  const snapshot = await getDocs(collectionRef);

  if (!snapshot.empty) {
    localStorage.setItem(MIGRATED_KEY, "true");
    return;
  }

  await Promise.all(
    legacyIncomes.map((income) =>
      setDoc(doc(db, COLLECTION_NAME, String(income.id)), {
        ...income,
        legacyId: income.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    ),
  );

  localStorage.setItem(MIGRATED_KEY, "true");
}

export function isIncomeRemoteEnabled() {
  return Boolean(isFirebaseConfigured && db);
}

export async function getIncomeCollection() {
  if (!isIncomeRemoteEnabled()) {
    return sortIncomes(getLegacyIncomes());
  }

  await migrateLegacyIncomesIfNeeded();

  const snapshot = await getDocs(collection(db, COLLECTION_NAME));
  const incomes = snapshot.docs.map(mapIncomeFromDoc);

  saveData(STORAGE_KEYS.INCOME, incomes);
  return sortIncomes(incomes);
}

export async function saveIncomeRecord(income) {
  if (!isIncomeRemoteEnabled()) {
    const incomes = getLegacyIncomes();

    if (income.id) {
      const exists = incomes.some(
        (item) => String(item.id) === String(income.id),
      );
      const updated = exists
        ? incomes.map((item) =>
            String(item.id) === String(income.id) ? income : item,
          )
        : [...incomes, income];
      saveData(STORAGE_KEYS.INCOME, sortIncomes(updated));
      return income;
    }

    const newIncome = { ...income, id: Date.now() };
    incomes.push(newIncome);
    saveData(STORAGE_KEYS.INCOME, sortIncomes(incomes));
    return newIncome;
  }

  const payload = {
    ...income,
    updatedAt: serverTimestamp(),
  };

  if (income.id) {
    const rest = { ...payload };
    delete rest.id;
    await setDoc(doc(db, COLLECTION_NAME, String(income.id)), rest, {
      merge: true,
    });
    const updatedIncome = { ...income };
    const cachedIncomes = getLegacyIncomes();
    const nextIncomes = cachedIncomes.some(
      (item) => String(item.id) === String(income.id),
    )
      ? cachedIncomes.map((item) =>
          String(item.id) === String(income.id) ? updatedIncome : item,
        )
      : [...cachedIncomes, updatedIncome];
    saveData(STORAGE_KEYS.INCOME, sortIncomes(nextIncomes));
    return updatedIncome;
  }

  const docRef = doc(collection(db, COLLECTION_NAME));
  const rest = { ...payload };
  delete rest.id;

  await setDoc(docRef, {
    ...rest,
    createdAt: serverTimestamp(),
  });

  const newIncome = { ...income, id: docRef.id };
  saveData(STORAGE_KEYS.INCOME, sortIncomes([...getLegacyIncomes(), newIncome]));
  return newIncome;
}

export async function replaceIncomeCollection(incomes) {
  await Promise.all(incomes.map((income) => saveIncomeRecord(income)));
  saveData(STORAGE_KEYS.INCOME, incomes);
  return incomes;
}

export async function deleteIncomeRecord(incomeId) {
  if (!isIncomeRemoteEnabled()) {
    const incomes = getLegacyIncomes().filter(
      (income) => String(income.id) !== String(incomeId),
    );
    saveData(STORAGE_KEYS.INCOME, incomes);
    return;
  }

  await deleteDoc(doc(db, COLLECTION_NAME, String(incomeId)));

  const cachedIncomes = getLegacyIncomes().filter(
    (income) => String(income.id) !== String(incomeId),
  );
  saveData(STORAGE_KEYS.INCOME, sortIncomes(cachedIncomes));
  localStorage.setItem(MIGRATED_KEY, "true");
}
