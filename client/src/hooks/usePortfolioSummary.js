import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLatestCandles } from "../db";
import { computePositionMetrics } from "../utils/computePositionMetrics";
import { isTradeableTickerSymbol } from "../utils/parseFidelityCsv";
import { useRefreshAllSignal } from "./useRefreshSignal";

export default function usePortfolioSummary(positions) {
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasLoadedRef = useRef(false);
  const refreshAllVersion = useRefreshAllSignal();

  const tradeablePositions = useMemo(
    () => positions.filter((p) => isTradeableTickerSymbol(p.symbol)),
    [positions],
  );

  const refresh = useCallback(async () => {
    if (!tradeablePositions.length) {
      setSummary(null);
      setIsLoading(false);
      hasLoadedRef.current = false;
      return;
    }

    if (!hasLoadedRef.current) {
      setIsLoading(true);
    }

    const holdings = [];
    let totalValue = 0;
    let totalCost = 0;
    let totalGainLoss = 0;
    let todayGainLoss = 0;

    for (const position of tradeablePositions) {
      const candles = await getLatestCandles(position.symbol, 2);
      const metrics = computePositionMetrics(position, candles);

      holdings.push({ ...position, metrics });

      if (!metrics) continue;

      totalValue += metrics.currentValue;
      totalCost += metrics.costBasisTotal;
      totalGainLoss += metrics.totalGainLoss;
      todayGainLoss += metrics.todayGainLoss;
    }

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
  }, [refresh, refreshAllVersion]);

  return {
    summary,
    isLoading,
    refresh,
    tradeablePositions,
    tradeableCount: tradeablePositions.length,
  };
}
