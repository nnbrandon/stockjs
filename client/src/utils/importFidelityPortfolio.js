import { applyImportedPositions } from "./applyImportedPositions";
import { parseFidelityCsv } from "./parseFidelityCsv";

/**
 * Import parsed Fidelity positions: persist holdings, then ensure every
 * symbol is an explicit watchlist member (seeding market data when needed).
 */
export async function importFidelityPortfolio(csvText, { onProgress } = {}) {
  const { positions, skipped } = parseFidelityCsv(csvText);

  if (!positions.length) {
    return { imported: [], skipped, failed: [], watchlistAdded: [] };
  }

  const result = await applyImportedPositions(positions, { onProgress });
  return { ...result, skipped };
}
