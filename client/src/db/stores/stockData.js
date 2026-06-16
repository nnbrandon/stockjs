import { db } from "../database";
import { withLog } from "../utils";

const STORE = "stockData";

export async function addStockData(records) {
  if (!records?.length) return 0;

  const enriched = records.map((item) => ({
    ...item,
    shortenedDate: item.date.split("T")[0],
  }));

  return withLog(`stockData: stored ${enriched.length} rows`, () =>
    db[STORE].bulkPut(enriched),
  );
}

export function getStockDataBySymbol(symbol) {
  return db[STORE].where("symbol").equals(symbol).sortBy("date");
}

export function getStockDataByDateRange(symbol, startDate, endDate) {
  return db[STORE].where("symbol")
    .equals(symbol)
    .and((row) => row.date >= startDate && row.date <= endDate)
    .sortBy("date");
}

// The watchlist's distinct symbols, derived from the [symbol+shortenedDate]
// primary keys.
//
// We deliberately avoid `orderBy("symbol").uniqueKeys()`: that opens a
// unique-direction key cursor over the compound primary key, which Safari/
// WebKit refuses with "UnknownError: Unable to open cursor". `primaryKeys()`
// is backed by getAllKeys() (no cursor), so it works across browsers; we
// dedupe the leading `symbol` component in JS.
async function getSymbolToKey() {
  const keys = await db[STORE].toCollection().primaryKeys(); // [[symbol, date], ...]
  const symbolToKey = new Map();
  for (const key of keys) {
    const symbol = key[0];
    if (!symbolToKey.has(symbol)) symbolToKey.set(symbol, key);
  }
  return symbolToKey;
}

export async function getStoredSymbols() {
  return [...(await getSymbolToKey()).keys()];
}

export async function getStoredSymbolsWithNames() {
  const symbolToKey = await getSymbolToKey();
  return Promise.all(
    [...symbolToKey].map(async ([symbol, key]) => {
      // get() by exact primary key — also cursor-free.
      const record = await db[STORE].get(key);
      return { symbol, name: record?.name ?? null };
    }),
  );
}

export async function get52WeekStats(symbol) {
  const lastYear = new Date();
  lastYear.setFullYear(lastYear.getFullYear() - 1);

  const data = await db[STORE].where("symbol")
    .equals(symbol)
    .and((row) => new Date(row.date) >= lastYear)
    .sortBy("date");

  if (data.length === 0) return null;

  return {
    low52: Math.min(...data.map((d) => d.low)),
    high52: Math.max(...data.map((d) => d.high)),
    current: data.at(-1).close,
  };
}

export async function getAverageVolumePast30Days(symbol) {
  const past30Days = new Date();
  past30Days.setDate(past30Days.getDate() - 30);

  const data = await db[STORE].where("symbol")
    .equals(symbol)
    .and((row) => new Date(row.date) >= past30Days)
    .sortBy("date");

  if (data.length === 0) return null;

  const total = data.reduce((sum, row) => sum + row.volume, 0);
  return total / data.length;
}

/** Last N candles for a symbol (newest last). */
export async function getLatestCandles(symbol, count = 2) {
  const rows = await db[STORE].where("symbol").equals(symbol).sortBy("date");
  return rows.slice(-count);
}

export function deleteStockDataForSymbol(symbol) {
  return db[STORE].where("symbol").equals(symbol).delete();
}
