import LambdaService from "../LambdaService";
import {
  addStockData,
  addToWatchlist,
  getStockDataBySymbol,
  isInWatchlist,
  saveFundamentals,
  saveEarnings,
  saveNewsArticles,
} from "../db";
import calculateRange from "./calculateRange";

const ALL_RANGE = calculateRange(365 * 25);

/**
 * Seed a symbol's DATA cache (candles, fundamentals, earnings, news) without
 * touching watchlist membership. This is what a deep link / browse / trending
 * tap needs: the detail page works, but the symbol is not tracked until the
 * user explicitly opts in via the Add-to-watchlist button.
 *
 * No-ops if the symbol already has cached candles. Throws if the fetch fails
 * or returns no price history (a well-formed but nonexistent ticker), so the
 * caller can render an error state instead of an endless spinner — nothing is
 * persisted in that case.
 */
export async function seedSymbolData(symbol) {
  const existing = await getStockDataBySymbol(symbol);
  if (existing?.length) return { alreadySeeded: true };

  const [historicalData, fundamentalsData, news] = await Promise.all([
    LambdaService.fetchHistoricalData(
      symbol,
      ALL_RANGE.startDate,
      ALL_RANGE.endDate,
    ),
    LambdaService.fetchFundamentals(
      symbol,
      ALL_RANGE.startDate,
      ALL_RANGE.endDate,
    ),
    LambdaService.fetchNews(symbol),
  ]);

  if (!historicalData?.length) {
    throw new Error(`No market data found for ${symbol}`);
  }

  await Promise.all([
    addStockData(historicalData),
    saveFundamentals(symbol, fundamentalsData),
    saveEarnings(symbol, fundamentalsData.earningsResult),
    saveNewsArticles(symbol, news),
  ]);

  return { alreadySeeded: false };
}

/**
 * Add a symbol to the watchlist: seed its data cache (if needed) and record
 * explicit membership. Used by the add-ticker flow, the Fidelity import, and
 * the detail page's Add button.
 */
export async function addSymbolToWatchlist(symbol) {
  if (await isInWatchlist(symbol)) {
    return { alreadyStored: true };
  }

  await seedSymbolData(symbol);
  await addToWatchlist(symbol);

  return { alreadyStored: false };
}
