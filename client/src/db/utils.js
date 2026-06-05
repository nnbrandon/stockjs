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

/**
 * Coerce any date-like value (Date, ISO string, unix seconds, unix ms) to
 * an ISO string. Centralized so individual save functions don't each have
 * to second-guess Yahoo's response shape.
 */
export function toIsoDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    return new Date(value < 1e11 ? value * 1000 : value).toISOString();
  }
  return new Date(value).toISOString();
}

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
