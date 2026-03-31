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

const COLLECTION_NAME = "expenses";

function sortExpenses(expenses) {
  return [...expenses].sort((a, b) => {
    const dateDiff = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateDiff !== 0) return dateDiff;

    const updatedA = Number(a.updatedAtMs || a.createdAtMs || 0);
    const updatedB = Number(b.updatedAtMs || b.createdAtMs || 0);
    return updatedB - updatedA;
  });
}

function mapExpenseFromDoc(snapshot) {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    ...data,
    createdAtMs: data.createdAt?.toMillis?.() || 0,
    updatedAtMs: data.updatedAt?.toMillis?.() || 0,
  };
}

function getLegacyExpenses() {
  return getData(STORAGE_KEYS.EXPENSES, []);
}

async function migrateLegacyExpensesIfNeeded() {
  const legacyExpenses = getLegacyExpenses();

  if (!legacyExpenses.length) return;

  const collectionRef = collection(db, COLLECTION_NAME);
  const snapshot = await getDocs(collectionRef);

  if (!snapshot.empty) return;

  await Promise.all(
    legacyExpenses.map((expense) =>
      setDoc(doc(db, COLLECTION_NAME, String(expense.id)), {
        ...expense,
        legacyId: expense.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    ),
  );
}

export function isExpensesRemoteEnabled() {
  return Boolean(isFirebaseConfigured && db);
}

export async function getExpensesCollection() {
  if (!isExpensesRemoteEnabled()) {
    return sortExpenses(getLegacyExpenses());
  }

  await migrateLegacyExpensesIfNeeded();

  const snapshot = await getDocs(collection(db, COLLECTION_NAME));
  const expenses = snapshot.docs.map(mapExpenseFromDoc);

  saveData(STORAGE_KEYS.EXPENSES, expenses);
  return sortExpenses(expenses);
}

export async function saveExpenseRecord(expense) {
  if (!isExpensesRemoteEnabled()) {
    const expenses = getLegacyExpenses();

    if (expense.id) {
      const updated = expenses.map((item) => (item.id === expense.id ? expense : item));
      saveData(STORAGE_KEYS.EXPENSES, updated);
      return expense;
    }

    const newExpense = { ...expense, id: Date.now() };
    expenses.push(newExpense);
    saveData(STORAGE_KEYS.EXPENSES, expenses);
    return newExpense;
  }

  const payload = {
    ...expense,
    updatedAt: serverTimestamp(),
  };

  if (expense.id) {
    const rest = { ...payload };
    delete rest.id;
    await updateDoc(doc(db, COLLECTION_NAME, String(expense.id)), rest);
    return { ...expense };
  }

  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
    ...payload,
    createdAt: serverTimestamp(),
  });

  return { ...expense, id: docRef.id };
}

export async function deleteExpenseRecord(expenseId) {
  if (!isExpensesRemoteEnabled()) {
    const expenses = getLegacyExpenses().filter(
      (expense) => String(expense.id) !== String(expenseId),
    );
    saveData(STORAGE_KEYS.EXPENSES, expenses);
    return;
  }

  await deleteDoc(doc(db, COLLECTION_NAME, String(expenseId)));
}
