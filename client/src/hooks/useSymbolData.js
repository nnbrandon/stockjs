import { useCallback, useEffect, useRef, useState } from "react";
import {
  getStockDataByDateRange,
  getQuarterly,
  getAnnual,
  getAverageVolumePast30Days,
  getNewsBySymbol,
  getEarnings,
} from "../db";
import { mergeEarningsIntoQuarterly } from "../utils/mergeEarningsIntoQuarterly";
import { useRefreshSignal } from "./useRefreshSignal";
import calculateRange from "../utils/calculateRange";

export default function useSymbolData(symbol, range) {
  const [chartData, setChartData] = useState([]);
  const [quarterlyFundamentalsData, setQuarterlyFundamentalsData] =
    useState(null);
  const [annualFundamentalsData, setAnnualFundamentalsData] = useState(null);
  const [averageVolumePast30Days, setAverageVolumePast30Days] = useState(null);
  const [earnings, setEarnings] = useState([]);
  const [news, setNews] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupplementalDataReady, setIsSupplementalDataReady] = useState(false);
  const hasChartDataRef = useRef(false);

  // Re-read from IndexedDB whenever a refresh for this symbol is signaled
  // (e.g. by useRefreshData after writing fresh Lambda data to IDB).
  const refreshVersion = useRefreshSignal(symbol);

  useEffect(() => {
    hasChartDataRef.current = false;
    setChartData([]);
    setIsLoading(false);
    setIsSupplementalDataReady(false);
  }, [symbol]);

  useEffect(() => {
    if (!symbol || !range) return;

    let cancelled = false;

    if (!hasChartDataRef.current) {
      setIsLoading(true);
    }

    getStockDataByDateRange(symbol, range.startDate, range.endDate)
      .then((data) => {
        if (cancelled) return;
        if (data?.length) {
          setChartData(data);
          hasChartDataRef.current = true;
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    const ALL_RANGE = calculateRange(365 * 25);
    let quarterlyDone = false;
    let annualDone = false;
    let newsDone = false;
    const markSupplementalReady = () => {
      if (quarterlyDone && annualDone && newsDone && !cancelled) {
        setIsSupplementalDataReady(true);
      }
    };

    Promise.all([
      getQuarterly(symbol, ALL_RANGE.startDate, ALL_RANGE.endDate),
      getEarnings(symbol),
    ])
      .then(([quarterly, earningsRows]) => {
        if (cancelled) return;
        setEarnings(earningsRows ?? []);
        setQuarterlyFundamentalsData(
          mergeEarningsIntoQuarterly(quarterly ?? [], earningsRows ?? []),
        );
      })
      .catch(() => {
        if (cancelled) return;
        setEarnings([]);
        setQuarterlyFundamentalsData([]);
      })
      .finally(() => {
        quarterlyDone = true;
        markSupplementalReady();
      });
    getAnnual(symbol, ALL_RANGE.startDate, ALL_RANGE.endDate)
      .then((rows) => {
        if (cancelled) return;
        setAnnualFundamentalsData(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setAnnualFundamentalsData([]);
      })
      .finally(() => {
        annualDone = true;
        markSupplementalReady();
      });
    getNewsBySymbol(symbol)
      .then((rows) => {
        if (cancelled) return;
        setNews(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setNews([]);
      })
      .finally(() => {
        newsDone = true;
        markSupplementalReady();
      });

    // Avg 30-day volume for the StatRow (independent of the supplemental-ready
    // gate; best-effort).
    getAverageVolumePast30Days(symbol)
      .then((v) => {
        if (!cancelled) setAverageVolumePast30Days(v);
      })
      .catch(() => {
        if (!cancelled) setAverageVolumePast30Days(null);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, range?.startDate, range?.endDate, refreshVersion]);

  const applyRefresh = useCallback((updates) => {
    if (updates.chartData !== undefined) setChartData(updates.chartData);
    if (updates.quarterlyFundamentalsData !== undefined)
      setQuarterlyFundamentalsData(updates.quarterlyFundamentalsData);
    if (updates.annualFundamentalsData !== undefined)
      setAnnualFundamentalsData(updates.annualFundamentalsData);
    if (updates.earnings !== undefined) setEarnings(updates.earnings);
    if (updates.news !== undefined) setNews(updates.news);
  }, []);

  return {
    chartData,
    quarterlyFundamentalsData,
    annualFundamentalsData,
    averageVolumePast30Days,
    earnings,
    news,
    isLoading,
    isSupplementalDataReady,
    applyRefresh,
  };
}
