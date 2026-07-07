const isDev = import.meta.env?.DEV;

/**
 * Wrap a DB op with consistent logging. Errors are logged + re-thrown so
 * callers can still react. Success messages only print in dev.
 */
export async function withLog(label, fn) {
  try {
    const result = await fn();
    if (isDev) console.log(`[db] ${label}`);
    return result;
  } catch (err) {
    console.error(`[db] ${label} failed:`, err);
    throw err;
  }
}

// Single definition lives in the shared engine package (the server needs it
// too); re-exported here so db-layer callers keep their import path.
export { toIsoDate } from "@stockjs/committee-engine/dateUtils.js";

/**
 * Shared filter for "is this row's `date` between startDate and endDate".
 * Returns a predicate suitable for `Collection.and(...)`.
 */
export function inDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return (row) => {
    const d = new Date(row.date);
    return d >= start && d <= end;
  };
}
