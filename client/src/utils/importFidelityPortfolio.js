import { getStoredSymbols, upsertPositions } from "../db";
import { addSymbolToWatchlist } from "./addSymbolToWatchlist";
import { parseFidelityCsv } from "./parseFidelityCsv";

/**
 * Import parsed Fidelity positions: persist holdings, then ensure each
 * symbol is on the watchlist (fetching market data when needed).
 */
export async function importFidelityPortfolio(csvText, { onProgress } = {}) {
  const { positions, skipped } = parseFidelityCsv(csvText);

  if (!positions.length) {
    return { imported: [], skipped, failed: [], watchlistAdded: [] };
  }

  await upsertPositions(positions);

  const storedSymbols = await getStoredSymbols();
  const imported = [];
  const failed = [];
  const watchlistAdded = [];

  for (let i = 0; i < positions.length; i++) {
    const { symbol, quantity, averageCostBasis } = positions[i];
    onProgress?.({
      current: i + 1,
      total: positions.length,
      symbol,
      phase: storedSymbols.includes(symbol) ? "saved" : "fetching",
    });

    imported.push({ symbol, quantity, averageCostBasis });

    if (storedSymbols.includes(symbol)) continue;

    try {
      const result = await addSymbolToWatchlist(symbol);
      storedSymbols.push(symbol);
      if (!result.alreadyStored) {
        watchlistAdded.push(symbol);
      }
    } catch (error) {
      failed.push({
        symbol,
        error: error?.message ?? "Failed to fetch market data",
      });
    }
  }

  return { imported, skipped, failed, watchlistAdded };
}
