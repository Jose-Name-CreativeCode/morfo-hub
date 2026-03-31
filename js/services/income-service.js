import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { STORAGE_KEYS, getData, saveData } from "./storage.js";
import { db, isFirebaseConfigured } from "./firebase-config.js";

const COLLECTION_NAME = "income";

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
    id: snapshot.id,
    ...data,
    createdAtMs: data.createdAt?.toMillis?.() || 0,
    updatedAtMs: data.updatedAt?.toMillis?.() || 0,
  };
}

function getLegacyIncomes() {
  return getData(STORAGE_KEYS.INCOME, []);
}

async function migrateLegacyIncomesIfNeeded() {
  const legacyIncomes = getLegacyIncomes();

  if (!legacyIncomes.length) return;

  const collectionRef = collection(db, COLLECTION_NAME);
  const snapshot = await getDocs(collectionRef);

  if (!snapshot.empty) return;

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
      const updated = incomes.map((item) => (item.id === income.id ? income : item));
      saveData(STORAGE_KEYS.INCOME, updated);
      return income;
    }

    const newIncome = { ...income, id: Date.now() };
    incomes.push(newIncome);
    saveData(STORAGE_KEYS.INCOME, incomes);
    return newIncome;
  }

  const payload = {
    ...income,
    updatedAt: serverTimestamp(),
  };

  if (income.id) {
    const rest = { ...payload };
    delete rest.id;
    await updateDoc(doc(db, COLLECTION_NAME, String(income.id)), rest);
    return { ...income };
  }

  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
    ...payload,
    createdAt: serverTimestamp(),
  });

  return { ...income, id: docRef.id };
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
}
