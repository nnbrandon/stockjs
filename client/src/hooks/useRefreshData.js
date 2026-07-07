import { useState } from "react";
import {
  addStockData,
  saveAnalysis,
  saveFundamentals,
  saveNewsArticles,
  saveEarnings,
  getQuarterly,
  getEarnings,
} from "../db";
import LambdaService from "../LambdaService";
import { mergeEarningsIntoQuarterly } from "@stockjs/committee-engine/mergeEarningsIntoQuarterly.js";
import {
  useSnackbar,
  useRefreshProgress,
} from "../components/SnackbarProvider";
import { emitRefreshAllSignal, emitRefreshSignal } from "./useRefreshSignal";
import calculateRange from "../utils/calculateRange";
import priceRangeSinceLastCandle from "../utils/priceRangeSinceLastCandle";

const FUNDAMENTALS_RANGE = calculateRange(365 * 25);
const ALL_RANGE = calculateRange(365 * 25);
const DEFAULT_RANGE = calculateRange(180);

// Fetch from Lambda, persist to IndexedDB, and return the supplemental updates
// useSymbolData applies optimistically. Prices are fetched only from the last
// stored candle forward (see priceRangeSinceLastCandle) so the response stays
// small instead of re-downloading months/years of unchanged history; full
// history is seeded once when a ticker is first added. `seedRange` is the
// fallback for a symbol with no stored candles yet.
//
// chartData is intentionally omitted: the emitRefreshSignal that follows each
// refresh makes useSymbolData re-read the currently displayed range from
// IndexedDB (now including the freshly upserted candles), so handing back the
// narrow fetched array here would briefly shrink the chart.
async function fetchAndPersist(symbol, seedRange) {
  const priceRange = await priceRangeSinceLastCandle(symbol, seedRange);

  const [historicalData, fundamentalsData, newsData, analysisData] =
    await Promise.all([
      LambdaService.fetchHistoricalData(
        symbol,
        priceRange.startDate,
        priceRange.endDate,
      ),
      LambdaService.fetchFundamentals(
        symbol,
        FUNDAMENTALS_RANGE.startDate,
        FUNDAMENTALS_RANGE.endDate,
      ),
      LambdaService.fetchNews(symbol),
      LambdaService.fetchAnalysis(symbol), // best-effort, resolves to null
    ]);

  await Promise.all([
    addStockData(historicalData),
    saveFundamentals(symbol, fundamentalsData),
    saveNewsArticles(symbol, newsData),
    saveEarnings(symbol, fundamentalsData.earningsResult),
    analysisData ? saveAnalysis(symbol, analysisData) : Promise.resolve(),
  ]);

  const [quarterlyRaw, earningsRows] = await Promise.all([
    getQuarterly(
      symbol,
      FUNDAMENTALS_RANGE.startDate,
      FUNDAMENTALS_RANGE.endDate,
    ),
    getEarnings(symbol),
  ]);

  return {
    quarterlyFundamentalsData: mergeEarningsIntoQuarterly(
      quarterlyRaw ?? [],
      earningsRows ?? [],
    ),
    annualFundamentalsData: fundamentalsData.annualResult,
    earnings: earningsRows ?? [],
    news: newsData,
  };
}

export default function useRefreshData({
  selectedSymbol,
  range,
  storedSymbolsWithNames,
  applyRefresh,
}) {
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const showSnackbar = useSnackbar();
  const refreshProgress = useRefreshProgress();

  const refreshSymbol = async () => {
    setIsRefreshingData(true);
    try {
      // Tops up prices since the last stored candle; the second arg is only
      // the seed range used if this symbol somehow has no stored history.
      const updates = await fetchAndPersist(
        selectedSymbol,
        range ?? DEFAULT_RANGE,
      );
      applyRefresh(updates);
      // Wake up any other subscribers (sidebar sparklines, etc.) so they
      // re-read this symbol's data from IndexedDB.
      emitRefreshSignal(selectedSymbol);
      showSnackbar("Data refreshed!", "success");
    } catch (error) {
      console.error("Error fetching stock data:", error);
      showSnackbar("Error refreshing data", "error");
    } finally {
      setIsRefreshingData(false);
    }
  };

  const refreshAll = async () => {
    if (!storedSymbolsWithNames.length) return;

    setIsRefreshingAll(true);
    refreshProgress.start(storedSymbolsWithNames.map(({ symbol }) => symbol));
    try {
      // Each symbol only tops up prices since its last stored candle, so this
      // stays cheap even across the whole watchlist. ALL_RANGE is just the seed
      // fallback for any symbol with no stored history (full history was
      // fetched when the ticker was first added).
      const seedRange = range ?? ALL_RANGE;
      const promises = storedSymbolsWithNames.map(async ({ symbol }) => {
        try {
          const updates = await fetchAndPersist(symbol, seedRange);
          if (symbol === selectedSymbol) {
            applyRefresh(updates);
          }
          emitRefreshSignal(symbol);
          refreshProgress.markDone(symbol);
        } catch (error) {
          refreshProgress.markError(symbol);
          throw error;
        }
      });

      await Promise.allSettled(promises);
      emitRefreshAllSignal();
    } catch (error) {
      console.error("Error refreshing all tickers:", error.message);
      showSnackbar("Error refreshing all tickers", "error");
    } finally {
      setIsRefreshingAll(false);
    }
  };

  return { refreshSymbol, refreshAll, isRefreshingData, isRefreshingAll };
}
