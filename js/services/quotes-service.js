import { apiRequest } from "./api-client.js";
import { STORAGE_KEYS, getData, saveData } from "./storage.js";

function sortQuotes(quotes) {
  return [...quotes].sort((a, b) => {
    const dateDiff = String(b.date || "").localeCompare(String(a.date || ""));
    if (dateDiff !== 0) return dateDiff;

    const updatedA = Number(a.updatedAtMs || a.createdAtMs || 0);
    const updatedB = Number(b.updatedAtMs || b.createdAtMs || 0);
    return updatedB - updatedA;
  });
}

function getCachedQuotes() {
  return getData(STORAGE_KEYS.QUOTES, []);
}

function hasCachedQuote(quoteId) {
  return getCachedQuotes().some((quote) => String(quote.id) === String(quoteId));
}

export async function getQuotesCollection() {
  const quotes = await apiRequest("/quotes");
  saveData(STORAGE_KEYS.QUOTES, quotes);
  return sortQuotes(quotes);
}

export async function saveQuoteRecord(quote) {
  const shouldUpdate = quote.id && hasCachedQuote(quote.id);

  const savedQuote = shouldUpdate
    ? await apiRequest(`/quotes/${quote.id}`, {
        method: "PUT",
        body: JSON.stringify(quote),
      })
    : await apiRequest("/quotes", {
        method: "POST",
        body: JSON.stringify(quote),
      });

  const quotes = getCachedQuotes();
  const nextQuotes = quotes.some(
    (item) => String(item.id) === String(savedQuote.id),
  )
    ? quotes.map((item) =>
        String(item.id) === String(savedQuote.id) ? savedQuote : item,
      )
    : [...quotes, savedQuote];

  saveData(STORAGE_KEYS.QUOTES, sortQuotes(nextQuotes));
  return savedQuote;
}

export async function replaceQuotesCollection(quotes) {
  const savedQuotes = await Promise.all(
    quotes.map((quote) =>
      saveQuoteRecord({
        ...quote,
      }),
    ),
  );
  saveData(STORAGE_KEYS.QUOTES, sortQuotes(savedQuotes));
  return savedQuotes;
}

export async function deleteQuoteRecord(quoteId) {
  await apiRequest(`/quotes/${quoteId}`, {
    method: "DELETE",
  });

  const quotes = getCachedQuotes().filter(
    (quote) => String(quote.id) !== String(quoteId),
  );
  saveData(STORAGE_KEYS.QUOTES, quotes);
}
