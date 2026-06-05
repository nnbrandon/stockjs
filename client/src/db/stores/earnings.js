import { db } from "../database";
import { withLog } from "../utils";

const STORE = "earnings";

export async function saveEarnings(symbol, earningsResult) {
  const history = earningsResult?.history;
  if (!history?.length) return 0;

  const rows = history.map((item) => ({
    ...item,
    symbol,
    date: item.date,
  }));

  return withLog(`earnings: saved ${rows.length} rows for ${symbol}`, () =>
    db[STORE].bulkPut(rows),
  );
}

export function getEarnings(symbol) {
  return db[STORE].where("symbol").equals(symbol).toArray();
}

export function deleteEarningsForSymbol(symbol) {
  return db[STORE].where("symbol").equals(symbol).delete();
}
