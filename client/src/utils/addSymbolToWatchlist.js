import LambdaService from "../LambdaService";
import {
  addStockData,
  getStoredSymbols,
  saveFundamentals,
  saveEarnings,
  saveNewsArticles,
} from "../db";
import calculateRange from "./calculateRange";

const ALL_RANGE = calculateRange(365 * 25);

export async function addSymbolToWatchlist(symbol) {
  const storedSymbols = await getStoredSymbols();
  if (storedSymbols.includes(symbol)) {
    return { alreadyStored: true };
  }

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

  await Promise.all([
    addStockData(historicalData),
    saveFundamentals(symbol, fundamentalsData),
    saveEarnings(symbol, fundamentalsData.earningsResult),
    saveNewsArticles(symbol, news),
  ]);

  return { alreadyStored: false };
}
