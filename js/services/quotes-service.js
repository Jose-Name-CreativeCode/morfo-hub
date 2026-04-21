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

const COLLECTION_NAME = "quotes";
const MIGRATED_KEY = `${STORAGE_KEYS.QUOTES}_firestore_migrated`;

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
    ...data,
    id: snapshot.id,
    legacyId: data.legacyId || data.id || "",
    createdAtMs: data.createdAt?.toMillis?.() || 0,
    updatedAtMs: data.updatedAt?.toMillis?.() || 0,
  };
}

function getLegacyQuotes() {
  return getData(STORAGE_KEYS.QUOTES, []);
}

async function migrateLegacyQuotesIfNeeded() {
  if (localStorage.getItem(MIGRATED_KEY) === "true") return;

  const legacyQuotes = getLegacyQuotes();

  if (!legacyQuotes.length) {
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
    legacyQuotes.map((quote) =>
      setDoc(doc(db, COLLECTION_NAME, String(quote.id)), {
        ...quote,
        legacyId: quote.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    ),
  );

  localStorage.setItem(MIGRATED_KEY, "true");
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
      const exists = quotes.some((item) => String(item.id) === String(quote.id));
      const updated = exists
        ? quotes.map((item) =>
            String(item.id) === String(quote.id) ? quote : item,
          )
        : [...quotes, quote];
      saveData(STORAGE_KEYS.QUOTES, sortQuotes(updated));
      return quote;
    }

    const newQuote = { ...quote, id: Date.now() };
    quotes.push(newQuote);
    saveData(STORAGE_KEYS.QUOTES, sortQuotes(quotes));
    return newQuote;
  }

  const payload = {
    ...quote,
    updatedAt: serverTimestamp(),
  };

  if (quote.id) {
    const rest = { ...payload };
    delete rest.id;
    await setDoc(
      doc(db, COLLECTION_NAME, String(quote.id)),
      {
        ...rest,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    const updatedQuote = { ...quote };
    const cachedQuotes = getLegacyQuotes();
    const nextQuotes = cachedQuotes.some(
      (item) => String(item.id) === String(quote.id),
    )
      ? cachedQuotes.map((item) =>
          String(item.id) === String(quote.id) ? updatedQuote : item,
        )
      : [...cachedQuotes, updatedQuote];
    saveData(STORAGE_KEYS.QUOTES, sortQuotes(nextQuotes));
    return updatedQuote;
  }

  const docRef = doc(collection(db, COLLECTION_NAME));
  const rest = { ...payload };
  delete rest.id;

  await setDoc(docRef, {
    ...rest,
    createdAt: serverTimestamp(),
  });

  const newQuote = { ...quote, id: docRef.id };
  saveData(STORAGE_KEYS.QUOTES, sortQuotes([...getLegacyQuotes(), newQuote]));
  return newQuote;
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

  const cachedQuotes = getLegacyQuotes().filter(
    (quote) => String(quote.id) !== String(quoteId),
  );
  saveData(STORAGE_KEYS.QUOTES, sortQuotes(cachedQuotes));
  localStorage.setItem(MIGRATED_KEY, "true");
}
