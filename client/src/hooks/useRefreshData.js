import { useState } from "react";
import {
  addStockData,
  saveFundamentals,
  saveNewsArticles,
  saveEarnings,
  getQuarterly,
  getEarnings,
} from "../db";
import LambdaService from "../LambdaService";
import { mergeEarningsIntoQuarterly } from "../utils/mergeEarningsIntoQuarterly";
import {
  useSnackbar,
  useRefreshProgress,
} from "../components/SnackbarProvider";
import { emitRefreshAllSignal, emitRefreshSignal } from "./useRefreshSignal";
import calculateRange from "../utils/calculateRange";

const FUNDAMENTALS_RANGE = calculateRange(365 * 25);
const ALL_RANGE = calculateRange(365 * 25);
const DEFAULT_RANGE = calculateRange(180);

// Fetch from Lambda, persist to IndexedDB, and return the shape useSymbolData expects.
async function fetchAndPersist(symbol, range) {
  const [historicalData, fundamentalsData, newsData] = await Promise.all([
    LambdaService.fetchHistoricalData(symbol, range.startDate, range.endDate),
    LambdaService.fetchFundamentals(
      symbol,
      FUNDAMENTALS_RANGE.startDate,
      FUNDAMENTALS_RANGE.endDate,
    ),
    LambdaService.fetchNews(symbol),
  ]);

  await Promise.all([
    addStockData(historicalData),
    saveFundamentals(symbol, fundamentalsData),
    saveNewsArticles(symbol, newsData),
    saveEarnings(symbol, fundamentalsData.earningsResult),
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
    chartData: historicalData,
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
      // Home view has no chart range selected — always fetch full history so
      // watchlist sparklines and symbol views stay up to date.
      const refreshRange = range ?? ALL_RANGE;
      const promises = storedSymbolsWithNames.map(async ({ symbol }) => {
        try {
          const updates = await fetchAndPersist(symbol, refreshRange);
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
