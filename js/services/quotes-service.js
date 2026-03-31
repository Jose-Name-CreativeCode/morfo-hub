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

const COLLECTION_NAME = "quotes";

function sortQuotes(quotes) {
  return [...quotes].sort((a, b) => {
    const dateDiff = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateDiff !== 0) return dateDiff;

    const updatedA = Number(a.updatedAtMs || a.createdAtMs || 0);
    const updatedB = Number(b.updatedAtMs || b.createdAtMs || 0);
    return updatedB - updatedA;
  });
}

function mapQuoteFromDoc(snapshot) {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    ...data,
    createdAtMs: data.createdAt?.toMillis?.() || 0,
    updatedAtMs: data.updatedAt?.toMillis?.() || 0,
  };
}

function getLegacyQuotes() {
  return getData(STORAGE_KEYS.QUOTES, []);
}

async function migrateLegacyQuotesIfNeeded() {
  const legacyQuotes = getLegacyQuotes();

  if (!legacyQuotes.length) return;

  const collectionRef = collection(db, COLLECTION_NAME);
  const snapshot = await getDocs(collectionRef);

  if (!snapshot.empty) return;

  await Promise.all(
    legacyQuotes.map((quote) =>
      setDoc(doc(db, COLLECTION_NAME, String(quote.id)), {
        ...quote,
        legacyId: quote.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    ),
  );
}

export function isQuotesRemoteEnabled() {
  return Boolean(isFirebaseConfigured && db);
}

export async function getQuotesCollection() {
  if (!isQuotesRemoteEnabled()) {
    return sortQuotes(getLegacyQuotes());
  }

  await migrateLegacyQuotesIfNeeded();

  const snapshot = await getDocs(collection(db, COLLECTION_NAME));
  const quotes = snapshot.docs.map(mapQuoteFromDoc);

  saveData(STORAGE_KEYS.QUOTES, quotes);
  return sortQuotes(quotes);
}

export async function saveQuoteRecord(quote) {
  if (!isQuotesRemoteEnabled()) {
    const quotes = getLegacyQuotes();

    if (quote.id) {
      const updated = quotes.map((item) => (item.id === quote.id ? quote : item));
      saveData(STORAGE_KEYS.QUOTES, updated);
      return quote;
    }

    const newQuote = { ...quote, id: Date.now() };
    quotes.push(newQuote);
    saveData(STORAGE_KEYS.QUOTES, quotes);
    return newQuote;
  }

  const payload = {
    ...quote,
    updatedAt: serverTimestamp(),
  };

  if (quote.id) {
    const rest = { ...payload };
    delete rest.id;
    await updateDoc(doc(db, COLLECTION_NAME, String(quote.id)), rest);
    return { ...quote };
  }

  const docRef = await addDoc(collection(db, COLLECTION_NAME), {
    ...payload,
    createdAt: serverTimestamp(),
  });

  return { ...quote, id: docRef.id };
}

export async function replaceQuotesCollection(quotes) {
  await Promise.all(quotes.map((quote) => saveQuoteRecord(quote)));
  saveData(STORAGE_KEYS.QUOTES, quotes);
  return quotes;
}

export async function deleteQuoteRecord(quoteId) {
  if (!isQuotesRemoteEnabled()) {
    const quotes = getLegacyQuotes().filter(
      (quote) => String(quote.id) !== String(quoteId),
    );
    saveData(STORAGE_KEYS.QUOTES, quotes);
    return;
  }

  await deleteDoc(doc(db, COLLECTION_NAME, String(quoteId)));
}
