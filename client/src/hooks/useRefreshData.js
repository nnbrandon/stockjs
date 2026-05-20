import { useState } from "react";
import { addStockData, saveFundamentals, saveNewsArticles } from "../db";
import LambdaService from "../LambdaService";
import { analyzePatternsFromStockData } from "../utils/patternRecognizer";
import { useSnackbar } from "../components/SnackbarProvider";

// Fetch from Lambda, persist to IndexedDB, and return the shape useSymbolData expects.
async function fetchAndPersist(symbol, range) {
  const [historicalData, fundamentalsData, newsData] = await Promise.all([
    LambdaService.fetchHistoricalData(symbol, range.startDate, range.endDate),
    LambdaService.fetchFundamentals(symbol, range.startDate, range.endDate),
    LambdaService.fetchNews(symbol),
  ]);

  await Promise.all([
    addStockData(historicalData),
    saveFundamentals(symbol, fundamentalsData),
    saveNewsArticles(symbol, newsData),
  ]);

  return {
    chartData: historicalData,
    patternTableData: analyzePatternsFromStockData(historicalData),
    quarterlyFundamentalsData: fundamentalsData.quarterlyResult,
    annualFundamentalsData: fundamentalsData.annualResult,
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

  const refreshSymbol = async () => {
    setIsRefreshingData(true);
    try {
      const updates = await fetchAndPersist(selectedSymbol, range);
      applyRefresh(updates);
      showSnackbar("Data refreshed!", "success");
    } catch (error) {
      console.error("Error fetching stock data:", error);
      showSnackbar("Error refreshing data", "error");
    } finally {
      setIsRefreshingData(false);
    }
  };

  const refreshAll = async () => {
    setIsRefreshingAll(true);
    try {
      const promises = storedSymbolsWithNames.map(async ({ symbol }) => {
        const updates = await fetchAndPersist(symbol, range);
        if (symbol === selectedSymbol) {
          applyRefresh(updates);
        }
      });

      await Promise.allSettled(promises);
      showSnackbar("All tickers refreshed!", "success");
    } catch (error) {
      console.error("Error refreshing all tickers:", error.message);
      showSnackbar("Error refreshing all tickers", "error");
    } finally {
      setIsRefreshingAll(false);
    }
  };

  return { refreshSymbol, refreshAll, isRefreshingData, isRefreshingAll };
}
