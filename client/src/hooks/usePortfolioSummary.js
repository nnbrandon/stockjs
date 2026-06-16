import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLatestCandles } from "../db";
import { computePositionMetrics } from "../utils/computePositionMetrics";
import { isTradeableTickerSymbol } from "../utils/parseFidelityCsv";
import {
  useRefreshAllSignal,
  useRefreshSignalForSymbols,
} from "./useRefreshSignal";

export default function usePortfolioSummary(positions) {
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasLoadedRef = useRef(false);
  // Bumps each refresh; lets a newer run discard a slower one's stale result.
  const runIdRef = useRef(0);
  const refreshAllVersion = useRefreshAllSignal();

  const tradeablePositions = useMemo(
    () => positions.filter((p) => isTradeableTickerSymbol(p.symbol)),
    [positions],
  );

  // Recompute when the live poll refreshes ANY holding's price, so the totals
  // (current value, today's gain/loss) stay live during market hours instead of
  // only updating on a full "Refresh all".
  const liveVersion = useRefreshSignalForSymbols(
    useMemo(() => tradeablePositions.map((p) => p.symbol), [tradeablePositions]),
  );

  const refresh = useCallback(async () => {
    if (!tradeablePositions.length) {
      setSummary(null);
      setIsLoading(false);
      hasLoadedRef.current = false;
      return;
    }

    const runId = ++runIdRef.current;
    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }

    // Read all holdings' latest candles in parallel.
    const candlesBySymbol = await Promise.all(
      tradeablePositions.map((position) => getLatestCandles(position.symbol, 2)),
    );
    // A newer refresh started while we were reading — let it win.
    if (runId !== runIdRef.current) return;

    const holdings = [];
    let totalValue = 0;
    let totalCost = 0;
    let totalGainLoss = 0;
    let todayGainLoss = 0;

    tradeablePositions.forEach((position, i) => {
      const metrics = computePositionMetrics(position, candlesBySymbol[i]);
      holdings.push({ ...position, metrics });

      if (!metrics) return;

      totalValue += metrics.currentValue;
      totalCost += metrics.costBasisTotal;
      totalGainLoss += metrics.totalGainLoss;
      todayGainLoss += metrics.todayGainLoss;
    });

    const todayStartValue = totalValue - todayGainLoss;

    setSummary({
      holdings,
      totalValue,
      totalCost,
      totalGainLoss,
      totalGainLossPct: totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0,
      todayGainLoss,
      todayGainLossPct:
        todayStartValue > 0 ? (todayGainLoss / todayStartValue) * 100 : 0,
    });
    hasLoadedRef.current = true;
    setIsLoading(false);
  }, [tradeablePositions]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshAllVersion, liveVersion]);

  return {
    summary,
    isLoading,
    refresh,
    tradeablePositions,
    tradeableCount: tradeablePositions.length,
  };
}
