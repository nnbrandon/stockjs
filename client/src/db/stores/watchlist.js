import { db } from "../database";
import { withLog } from "../utils";
import { getStoredSymbolsWithNames } from "./stockData";

const STORE = "watchlist";

// Explicit watchlist membership. A row is just `{ symbol }`; a symbol's
// display name and market data live in the stockData cache (membership always
// implies its data was seeded first). This store is deliberately decoupled
// from the data cache so browsing/deep-linking a ticker can seed its data
// without silently adding it to the watchlist.

export async function getWatchlistSymbols() {
  return db[STORE].toCollection().primaryKeys();
}

export async function isInWatchlist(symbol) {
  return Boolean(await db[STORE].get(symbol));
}

export async function addToWatchlist(symbol) {
  return withLog(`watchlist: add ${symbol}`, () => db[STORE].put({ symbol }));
}

export async function removeFromWatchlist(symbol) {
  return withLog(`watchlist: remove ${symbol}`, () => db[STORE].delete(symbol));
}

// Watchlist members joined with their display names from the data cache. Used
// by the Navbar; ordered alphabetically for a stable list.
export async function getWatchlistWithNames() {
  const [members, withNames] = await Promise.all([
    getWatchlistSymbols(),
    getStoredSymbolsWithNames(),
  ]);
  const nameBySymbol = new Map(withNames.map((s) => [s.symbol, s.name]));
  return members
    .map((symbol) => ({ symbol, name: nameBySymbol.get(symbol) ?? null }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}
