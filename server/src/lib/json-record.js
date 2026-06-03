export function parseJsonRecord(rawJson, fallback = {}) {
  try {
    return rawJson ? JSON.parse(rawJson) : fallback;
  } catch {
    return fallback;
  }
}

export function withTimestamps(record, fallback = {}) {
  return {
    ...fallback,
    ...record,
    createdAtMs: record?.createdAtMs || 0,
    updatedAtMs: record?.updatedAtMs || 0,
  };
}
