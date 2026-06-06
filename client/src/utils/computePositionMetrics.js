export function computePositionMetrics(position, chartData) {
  if (!position || !chartData?.length) return null;

  const latest = chartData[chartData.length - 1];
  const prev = chartData.length >= 2 ? chartData[chartData.length - 2] : latest;
  const { quantity, averageCostBasis } = position;

  if (!Number.isFinite(quantity) || !Number.isFinite(averageCostBasis)) {
    return null;
  }

  const costBasisTotal = quantity * averageCostBasis;
  const currentValue = quantity * latest.close;
  const totalGainLoss = currentValue - costBasisTotal;
  const totalGainLossPct =
    costBasisTotal > 0 ? (totalGainLoss / costBasisTotal) * 100 : 0;
  const lastPrice = latest.close;
  const lastPriceChange = latest.close - prev.close;
  const lastPriceChangePct =
    prev.close > 0 ? (lastPriceChange / prev.close) * 100 : 0;
  const todayGainLoss = quantity * lastPriceChange;
  const todayGainLossPct = lastPriceChangePct;

  return {
    lastPrice,
    lastPriceChange,
    lastPriceChangePct,
    costBasisTotal,
    currentValue,
    totalGainLoss,
    totalGainLossPct,
    todayGainLoss,
    todayGainLossPct,
  };
}

export function formatDollars(value, { signed = false } = {}) {
  if (!Number.isFinite(value)) return "—";
  const sign = signed && value > 0 ? "+" : signed && value < 0 ? "−" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value, { signed = false } = {}) {
  if (!Number.isFinite(value)) return "—";
  const sign = signed && value > 0 ? "+" : signed && value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(2)}%`;
}
