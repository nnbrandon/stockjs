import { getStockDataBySymbol, upsertPositions } from "../db";
import { addSymbolToWatchlist } from "./addSymbolToWatchlist";
import { parseFidelityCsv } from "./parseFidelityCsv";

/**
 * Import parsed Fidelity positions: persist holdings, then ensure every
 * symbol is an explicit watchlist member (seeding market data when needed).
 * With data/membership split, imported holdings must be added to the
 * watchlist explicitly — membership no longer follows automatically from
 * having seeded data.
 */
export async function importFidelityPortfolio(csvText, { onProgress } = {}) {
  const { positions, skipped } = parseFidelityCsv(csvText);

  if (!positions.length) {
    return { imported: [], skipped, failed: [], watchlistAdded: [] };
  }

  await upsertPositions(positions);

  const imported = [];
  const failed = [];
  const watchlistAdded = [];

  for (let i = 0; i < positions.length; i++) {
    const { symbol, quantity, averageCostBasis } = positions[i];
    const alreadySeeded = (await getStockDataBySymbol(symbol))?.length > 0;
    onProgress?.({
      current: i + 1,
      total: positions.length,
      symbol,
      phase: alreadySeeded ? "saved" : "fetching",
    });

    imported.push({ symbol, quantity, averageCostBasis });

    try {
      const result = await addSymbolToWatchlist(symbol);
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
