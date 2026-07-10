import { getStockDataBySymbol, upsertPositions } from "../db";
import { addSymbolToWatchlist } from "./addSymbolToWatchlist";

/**
 * Persist holdings, then ensure every symbol is an explicit watchlist member
 * (seeding market data when needed). With data/membership split, imported
 * holdings must be added to the watchlist explicitly — membership no longer
 * follows automatically from having seeded data.
 *
 * Shared by the Fidelity CSV import and the server pull (fetch synced
 * holdings) so both land positions on the device the exact same way.
 */
export async function applyImportedPositions(positions, { onProgress } = {}) {
  if (!positions.length) {
    return { imported: [], failed: [], watchlistAdded: [] };
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

  return { imported, failed, watchlistAdded };
}
