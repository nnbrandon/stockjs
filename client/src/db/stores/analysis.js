import { db } from "../database";

const STORE = "analysis";

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

export function deleteAnalysisForSymbol(symbol) {
  return db[STORE].delete(symbol);
}
