const NAV_NAME_RE =
  /\b(index\s+fund|mutual\s+fund|money\s+market|target\s+date)\b/i;
const NAV_NAME_LOOSE_RE = /\bindex\b.*\b(fund|fu)\b/i;

function isFlatCandle({ open, high, low, close }) {
  if (!Number.isFinite(close)) return false;
  const eps = 0.005;
  return (
    Math.abs(high - low) <= eps ||
    (Math.abs(open - close) <= eps && Math.abs(high - low) <= eps)
  );
}

function hasNavName(name) {
  if (!name || typeof name !== "string") return false;
  return NAV_NAME_RE.test(name) || NAV_NAME_LOOSE_RE.test(name);
}

/**
 * Detect mutual funds / index funds that publish a single daily NAV instead of
 * intraday OHLC. These have flat candles and zero volume in our price feed.
 */
export default function isNavPricedAsset(chartData, { name } = {}) {
  const resolvedName = name ?? chartData?.[0]?.name;
  if (hasNavName(resolvedName)) return true;
  if (!chartData?.length || chartData.length < 3) return false;

  const sample = chartData.slice(-Math.min(chartData.length, 30));
  let flatCount = 0;
  let zeroVolCount = 0;

  for (const row of sample) {
    if (isFlatCandle(row)) flatCount += 1;
    if (!row.volume || row.volume === 0) zeroVolCount += 1;
  }

  const n = sample.length;
  return flatCount / n >= 0.8 && zeroVolCount / n >= 0.8;
}
