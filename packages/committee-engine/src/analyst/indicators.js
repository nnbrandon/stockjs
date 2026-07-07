// Pure technical-indicator math. Everything here is deterministic and
// dependency-free — no network, no LLM. Inputs are plain arrays of numbers
// (or OHLC candle objects), outputs are numbers or null when there isn't
// enough data to compute the indicator honestly.

export function toCloses(candles = []) {
  return candles.map((c) => Number(c.close)).filter(Number.isFinite);
}

export function sma(values, period) {
  if (!values || values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

// Wilder's RSI. Returns 0..100, or null if insufficient data.
export function rsi(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// Average True Range (Wilder). Needs OHLC candles. Returns price units.
export function atr(candles, period = 14) {
  if (!candles || candles.length < period + 1) return null;

  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const high = Number(candles[i].high);
    const low = Number(candles[i].low);
    const prevClose = Number(candles[i - 1].close);
    if (![high, low, prevClose].every(Number.isFinite)) continue;
    trueRanges.push(
      Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose),
      ),
    );
  }
  if (trueRanges.length < period) return null;

  let value = trueRanges.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    value = (value * (period - 1) + trueRanges[i]) / period;
  }
  return value;
}

// Percent return over the last `days` closes.
export function momentum(closes, days) {
  if (!closes || closes.length < days + 1) return null;
  const now = closes.at(-1);
  const then = closes.at(-1 - days);
  if (!then) return null;
  return ((now - then) / then) * 100;
}

// Annualized volatility (%) from daily close-to-close returns.
export function annualizedVolatility(closes, lookback = 60) {
  if (!closes || closes.length < 20) return null;
  const slice = closes.slice(-(lookback + 1));
  const returns = [];
  for (let i = 1; i < slice.length; i++) {
    returns.push(slice[i] / slice[i - 1] - 1);
  }
  if (returns.length < 2) return null;

  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance =
    returns.reduce((s, v) => s + (v - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

// Largest peak-to-trough decline (%) within the window.
export function maxDrawdown(closes, lookback = 252) {
  if (!closes || closes.length < 2) return null;
  const slice = closes.slice(-lookback);
  let peak = slice[0];
  let worst = 0;
  for (const price of slice) {
    if (price > peak) peak = price;
    const dd = (price - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return worst * 100;
}

// Where the latest price sits between window low and high (0..100).
export function rangePosition(candles, lookback = 252) {
  if (!candles || candles.length === 0) return null;
  const slice = candles.slice(-lookback);
  const highs = slice.map((c) => Number(c.high)).filter(Number.isFinite);
  const lows = slice.map((c) => Number(c.low)).filter(Number.isFinite);
  if (!highs.length || !lows.length) return null;

  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const current = Number(slice.at(-1).close);
  if (high === low) return 50;
  return ((current - low) / (high - low)) * 100;
}

// Sum the last four quarters of EPS → trailing-twelve-month EPS. Prefers the
// fundamentals feed's dilutedEPS but falls back to the earnings feed's epsActual
// so the most recent (earnings-only) quarters still count — otherwise TTM EPS,
// and the trailing P/E derived from it, goes stale right after a fresh report.
export function ttmEps(quarterly = []) {
  const withEps = quarterly
    .map((q) => {
      const eps = Number.isFinite(Number(q.dilutedEPS))
        ? Number(q.dilutedEPS)
        : Number.isFinite(Number(q.epsActual))
          ? Number(q.epsActual)
          : null;
      return { date: q.date, eps };
    })
    .filter((q) => q.eps != null)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 4);
  if (withEps.length < 4) return null;
  return withEps.reduce((s, q) => s + q.eps, 0);
}

// Average volume over the last `lookback` candles, ignoring missing values.
export function avgVolume(candles, lookback) {
  if (!candles || !candles.length) return null;
  const vols = candles
    .slice(-lookback)
    .map((c) => Number(c.volume))
    .filter((v) => Number.isFinite(v) && v >= 0);
  if (!vols.length) return null;
  return vols.reduce((s, v) => s + v, 0) / vols.length;
}

// Recent average volume relative to a longer baseline. >1 means volume is
// picking up (a move with conviction), <1 means it's fading. Returns null when
// there isn't enough history or there's no real volume (e.g. NAV funds).
export function volumeTrend(candles, recent = 10, baseline = 60) {
  if (!candles || candles.length < baseline) return null;
  const recentAvg = avgVolume(candles, recent);
  const baseAvg = avgVolume(candles, baseline);
  if (!Number.isFinite(recentAvg) || !Number.isFinite(baseAvg) || baseAvg <= 0)
    return null;
  return recentAvg / baseAvg;
}

// Pearson correlation of daily returns between two close-price series
// (aligned from the end, up to `lookback` shared days). Returns -1..1, or
// null with fewer than `minDays` shared observations.
export function correlation(closesA, closesB, lookback = 90, minDays = 60) {
  if (!closesA || !closesB) return null;
  const n = Math.min(closesA.length, closesB.length, lookback + 1);
  if (n < minDays + 1) return null;

  const returns = (closes) => {
    const slice = closes.slice(-n);
    const out = [];
    for (let i = 1; i < slice.length; i++) {
      out.push(slice[i] / slice[i - 1] - 1);
    }
    return out;
  };
  const ra = returns(closesA);
  const rb = returns(closesB);

  const meanA = ra.reduce((s, v) => s + v, 0) / ra.length;
  const meanB = rb.reduce((s, v) => s + v, 0) / rb.length;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < ra.length; i++) {
    const da = ra[i] - meanA;
    const db = rb[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  if (varA === 0 || varB === 0) return null;
  return cov / Math.sqrt(varA * varB);
}

// Clamp a value into [min, max].
export function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

// Map a value from one linear range into another, clamped to the output.
export function scaleClamp(value, inMin, inMax, outMin = 0, outMax = 100) {
  if (!Number.isFinite(value)) return null;
  const t = (value - inMin) / (inMax - inMin);
  return clamp(outMin + t * (outMax - outMin), outMin, outMax);
}
