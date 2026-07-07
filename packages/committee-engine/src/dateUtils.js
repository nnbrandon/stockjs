/**
 * Coerce any date-like value (Date, ISO string, unix seconds, unix ms) to
 * an ISO string. Single definition shared by the engine and the client's
 * Dexie layer (client/src/db/utils.js re-exports this).
 */
export function toIsoDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    return new Date(value < 1e11 ? value * 1000 : value).toISOString();
  }
  return new Date(value).toISOString();
}
