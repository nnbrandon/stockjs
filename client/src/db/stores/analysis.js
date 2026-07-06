import { db } from "../database";

const STORE = "analysis";
const STALE_MS = 24 * 60 * 60 * 1000;

/** One row per symbol, replaced on every fetch. */
export async function saveAnalysis(symbol, row) {
  if (!symbol || !row) return;
  try {
    await db[STORE].put({ ...row, symbol });
  } catch (err) {
    console.warn(`analysis: failed to save ${symbol}`, err);
  }
}

export async function getAnalysis(symbol) {
  if (!symbol) return null;
  try {
    return (await db[STORE].get(symbol)) ?? null;
  } catch {
    return null;
  }
}

/** True when there's no cached row or it's older than 24h. */
export function isAnalysisStale(row) {
  if (!row?.fetchedAt) return true;
  const t = new Date(row.fetchedAt).getTime();
  return !Number.isFinite(t) || Date.now() - t > STALE_MS;
}

export function deleteAnalysisForSymbol(symbol) {
  return db[STORE].delete(symbol);
}
