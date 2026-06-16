import { useEffect, useRef, useState } from "react";
import { getStockDataByDateRange } from "../db";
import { useRefreshSignal } from "./useRefreshSignal";

/**
 * Lightweight, chart-only read for watchlist sparklines: just the candles in
 * `range`, re-read whenever the symbol's refresh signal fires.
 *
 * Unlike useSymbolData this does NOT also load quarterly/annual fundamentals,
 * earnings, and news on every refresh — a sidebar of N sparklines was issuing
 * ~5×N IndexedDB reads per live poll (4×N of them unused). This issues one read
 * per sparkline.
 */
export default function useSymbolChartData(symbol, range) {
  const [chartData, setChartData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const hasDataRef = useRef(false);
  const refreshVersion = useRefreshSignal(symbol);

  useEffect(() => {
    hasDataRef.current = false;
    setChartData([]);
  }, [symbol]);

  useEffect(() => {
    if (!symbol || !range) return undefined;

    let cancelled = false;
    if (!hasDataRef.current) setIsLoading(true);

    getStockDataByDateRange(symbol, range.startDate, range.endDate)
      .then((data) => {
        if (cancelled) return;
        if (data?.length) {
          setChartData(data);
          hasDataRef.current = true;
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, range?.startDate, range?.endDate, refreshVersion]);

  return { chartData, isLoading };
}
