const MAX_MATCH_MS = 7 * 24 * 60 * 60 * 1000;

/** Snap each earnings report to the nearest candle in the visible series. */
export function matchEarningsToChart(earnings = [], chartData = []) {
  if (!earnings.length || !chartData.length) return [];

  const candles = chartData.map((d, index) => ({
    index,
    time: new Date(d.date).getTime(),
  }));

  return earnings
    .filter((e) => e.reportedDate)
    .map((earning) => {
      const reported = new Date(earning.reportedDate).getTime();
      if (!Number.isFinite(reported)) return null;

      let bestIdx = 0;
      let bestDelta = Infinity;
      for (const c of candles) {
        const delta = Math.abs(c.time - reported);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestIdx = c.index;
        }
      }

      if (bestDelta > MAX_MATCH_MS) return null;
      return { earning, index: bestIdx };
    })
    .filter(Boolean);
}
