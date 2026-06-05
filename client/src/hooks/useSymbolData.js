import { useCallback, useEffect, useState } from "react";
import {
  getStockDataByDateRange,
  getQuarterly,
  getAnnual,
  getAverageVolumePast30Days,
  getNewsBySymbol,
} from "../db";
import { analyzePatternsFromStockData } from "../utils/patternRecognizer";
import { useRefreshSignal } from "./useRefreshSignal";
import calculateRange from "../utils/calculateRange";

export default function useSymbolData(symbol, range) {
  const [chartData, setChartData] = useState([]);
  const [patternTableData, setPatternTableData] = useState([]);
  const [quarterlyFundamentalsData, setQuarterlyFundamentalsData] =
    useState(null);
  const [annualFundamentalsData, setAnnualFundamentalsData] = useState(null);
  const [averageVolumePast30Days, setAverageVolumePast30Days] = useState(null);
  const [news, setNews] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Re-read from IndexedDB whenever a refresh for this symbol is signaled
  // (e.g. by useRefreshData after writing fresh Lambda data to IDB).
  const refreshVersion = useRefreshSignal(symbol);

  useEffect(() => {
    if (!symbol || !range) return;

    setIsLoading(true);
    getStockDataByDateRange(symbol, range.startDate, range.endDate)
      .then((data) => {
        if (data && data.length) {
          setChartData(data);
          setPatternTableData(analyzePatternsFromStockData(data));
        }
      })
      .finally(() => {
        setTimeout(() => {
          // Simulate a delay to show the loading state
          setIsLoading(false);
        }, 300);
      });

    const ALL_RANGE = calculateRange(365 * 25);
    getQuarterly(symbol, ALL_RANGE.startDate, ALL_RANGE.endDate).then(
      setQuarterlyFundamentalsData,
    );
    getAnnual(symbol, ALL_RANGE.startDate, ALL_RANGE.endDate).then(
      setAnnualFundamentalsData,
    );
    getAverageVolumePast30Days(symbol).then(setAverageVolumePast30Days);
    getNewsBySymbol(symbol).then(setNews);
  }, [symbol, range, refreshVersion]);

  const applyRefresh = useCallback((updates) => {
    if (updates.chartData !== undefined) setChartData(updates.chartData);
    if (updates.patternTableData !== undefined)
      setPatternTableData(updates.patternTableData);
    if (updates.quarterlyFundamentalsData !== undefined)
      setQuarterlyFundamentalsData(updates.quarterlyFundamentalsData);
    if (updates.annualFundamentalsData !== undefined)
      setAnnualFundamentalsData(updates.annualFundamentalsData);
    if (updates.news !== undefined) setNews(updates.news);
  }, []);

  return {
    chartData,
    patternTableData,
    quarterlyFundamentalsData,
    annualFundamentalsData,
    averageVolumePast30Days,
    news,
    isLoading,
    applyRefresh,
  };
}
