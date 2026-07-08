// Same shape the server enforces (server/handlers/committee.js SYMBOL_RE).
// Deep-link and hand-edited URLs go through here: uppercase, then validate.
// Returns the normalized symbol, or null if it doesn't look like a ticker.
const SYMBOL_RE = /^[A-Z0-9.-]{1,12}$/;

export default function normalizeSymbol(raw) {
  if (!raw) return null;
  const symbol = String(raw).trim().toUpperCase();
  return SYMBOL_RE.test(symbol) ? symbol : null;
}
