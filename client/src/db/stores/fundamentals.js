import { db } from "../database";
import { inDateRange, toIsoDate, withLog } from "../utils";

const QUARTERLY = "quarterlyResult";
const ANNUAL = "annualResult";

function attachSymbolWithIsoDate(symbol, items = []) {
  return items.map((item) => ({
    ...item,
    symbol,
    date: toIsoDate(item.date),
  }));
}

export async function saveFundamentals(symbol, data) {
  const quarterly = attachSymbolWithIsoDate(symbol, data?.quarterlyResult);
  const annual = attachSymbolWithIsoDate(symbol, data?.annualResult);

  return withLog(`fundamentals: saved ${symbol}`, () =>
    db.transaction("rw", db[QUARTERLY], db[ANNUAL], async () => {
      if (quarterly.length) await db[QUARTERLY].bulkPut(quarterly);
      if (annual.length) await db[ANNUAL].bulkPut(annual);
    }),
  );
}

export function getQuarterly(symbol, startDate, endDate) {
  return db[QUARTERLY]
    .where("symbol")
    .equals(symbol)
    .and(inDateRange(startDate, endDate))
    .toArray();
}

export function getAnnual(symbol, startDate, endDate) {
  return db[ANNUAL]
    .where("symbol")
    .equals(symbol)
    .and(inDateRange(startDate, endDate))
    .toArray();
}

export function deleteFundamentalsForSymbol(symbol) {
  return Promise.all([
    db[QUARTERLY].where("symbol").equals(symbol).delete(),
    db[ANNUAL].where("symbol").equals(symbol).delete(),
  ]);
}
