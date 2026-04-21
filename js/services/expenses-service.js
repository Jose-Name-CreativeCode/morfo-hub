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

const COLLECTION_NAME = "expenses";
const MIGRATED_KEY = `${STORAGE_KEYS.EXPENSES}_firestore_migrated`;

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
    ...data,
    id: snapshot.id,
    legacyId: data.legacyId || data.id || "",
    createdAtMs: data.createdAt?.toMillis?.() || 0,
    updatedAtMs: data.updatedAt?.toMillis?.() || 0,
  };
}

function getLegacyExpenses() {
  return getData(STORAGE_KEYS.EXPENSES, []);
}

async function migrateLegacyExpensesIfNeeded() {
  if (localStorage.getItem(MIGRATED_KEY) === "true") return;

  const legacyExpenses = getLegacyExpenses();

  if (!legacyExpenses.length) {
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
    legacyExpenses.map((expense) =>
      setDoc(doc(db, COLLECTION_NAME, String(expense.id)), {
        ...expense,
        legacyId: expense.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    ),
  );

  localStorage.setItem(MIGRATED_KEY, "true");
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
      const exists = expenses.some(
        (item) => String(item.id) === String(expense.id),
      );
      const updated = exists
        ? expenses.map((item) =>
            String(item.id) === String(expense.id) ? expense : item,
          )
        : [...expenses, expense];
      saveData(STORAGE_KEYS.EXPENSES, sortExpenses(updated));
      return expense;
    }

    const newExpense = { ...expense, id: Date.now() };
    expenses.push(newExpense);
    saveData(STORAGE_KEYS.EXPENSES, sortExpenses(expenses));
    return newExpense;
  }

  const payload = {
    ...expense,
    updatedAt: serverTimestamp(),
  };

  if (expense.id) {
    const rest = { ...payload };
    delete rest.id;
    await setDoc(doc(db, COLLECTION_NAME, String(expense.id)), rest, {
      merge: true,
    });
    const updatedExpense = { ...expense };
    const cachedExpenses = getLegacyExpenses();
    const nextExpenses = cachedExpenses.some(
      (item) => String(item.id) === String(expense.id),
    )
      ? cachedExpenses.map((item) =>
          String(item.id) === String(expense.id) ? updatedExpense : item,
        )
      : [...cachedExpenses, updatedExpense];
    saveData(STORAGE_KEYS.EXPENSES, sortExpenses(nextExpenses));
    return updatedExpense;
  }

  const docRef = doc(collection(db, COLLECTION_NAME));
  const rest = { ...payload };
  delete rest.id;

  await setDoc(docRef, {
    ...rest,
    createdAt: serverTimestamp(),
  });

  const newExpense = { ...expense, id: docRef.id };
  saveData(
    STORAGE_KEYS.EXPENSES,
    sortExpenses([...getLegacyExpenses(), newExpense]),
  );
  return newExpense;
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

  const cachedExpenses = getLegacyExpenses().filter(
    (expense) => String(expense.id) !== String(expenseId),
  );
  saveData(STORAGE_KEYS.EXPENSES, sortExpenses(cachedExpenses));
  localStorage.setItem(MIGRATED_KEY, "true");
}
