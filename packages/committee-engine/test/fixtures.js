// Deterministic synthetic inputs for the committee tests. No network, no
// randomness — every field is computed from the index so a fixture always
// produces the same verdict. Dates are anchored to "today" so that
// year-ago matching (±45 days) and score-momentum (Date.now based) behave
// the way they do in production.

const DAY_MS = 24 * 60 * 60 * 1000;

export const iso = (msFromNow) => new Date(Date.now() + msFromNow).toISOString();

/**
 * OHLCV candles, oldest → newest, ending "today". `trend` is the daily
 * compounding drift (e.g. +0.0015 ≈ steady uptrend, -0.0015 ≈ downtrend).
 */
export function makeCandles({
  days = 400,
  startClose = 100,
  trend = 0.0015,
  symbol = "TEST",
} = {}) {
  const out = [];
  let close = startClose;
  for (let i = days - 1; i >= 0; i--) {
    close = close * (1 + trend);
    // A gentle deterministic wave so high/low/volume aren't degenerate.
    const wave = Math.sin(i / 9) * 0.01;
    const high = close * (1 + Math.abs(wave) + 0.005);
    const low = close * (1 - Math.abs(wave) - 0.005);
    out.push({
      symbol,
      name: symbol,
      instrumentType: "EQUITY",
      date: iso(-i * DAY_MS),
      open: close * (1 - wave),
      high,
      low,
      close,
      adjclose: close,
      volume: 1_000_000 + Math.round(Math.sin(i / 5) * 100_000),
    });
  }
  return out;
}

/**
 * `n` quarterly statement rows, newest first spacing of ~91 days back from
 * today. `grow` is the per-year fractional growth applied to revenue, net
 * income and free cash flow. `opts` overrides let a fixture drop a field
 * (e.g. no dividends) or flip a sign (losses, dilution).
 */
export function makeQuarterly({
  n = 8,
  baseRevenue = 1000,
  baseNetIncome = 200,
  baseFcf = 180,
  grow = 0.15,
  shares = 1000,
  shareTrendPerYear = -0.02, // negative = buybacks
  dividendPerQuarter = 5, // 0 = non-payer
  eps = 1.0,
  totalDebt = 300,
  equity = 1500,
  // Optional forensic fields (v8 quality-of-earnings checks). Left off unless
  // a fixture opts in, so every existing fixture stays byte-for-byte the same.
  receivablesBase = null, // accountsReceivable on the newest row
  receivablesGrowPerYear = grow, // its own growth, independent of revenue
  inventoryBase = null,
  inventoryGrowPerYear = grow,
  sbcPerQuarter = null, // stockBasedCompensation per quarter
} = {}) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const yearsAgo = (i * 91) / 365;
    const factor = Math.pow(1 + grow, -yearsAgo);
    const shareFactor = Math.pow(1 + shareTrendPerYear, -yearsAgo);
    const row = {
      date: iso(-i * 91 * DAY_MS),
      totalRevenue: baseRevenue * factor,
      netIncome: baseNetIncome * factor,
      freeCashFlow: baseFcf * factor,
      totalDebt,
      stockholdersEquity: equity * factor,
      cashAndCashEquivalents: equity * 0.5,
      cashCashEquivalentsAndShortTermInvestments: equity * 0.6,
      dilutedAverageShares: shares * shareFactor,
      basicAverageShares: shares * shareFactor,
      dilutedEPS: eps * factor,
    };
    if (dividendPerQuarter > 0) {
      // Yahoo reports dividends paid as a negative cash-flow figure.
      row.cashDividendsPaid = -dividendPerQuarter * factor;
    }
    if (receivablesBase != null) {
      row.accountsReceivable =
        receivablesBase * Math.pow(1 + receivablesGrowPerYear, -yearsAgo);
    }
    if (inventoryBase != null) {
      row.inventory =
        inventoryBase * Math.pow(1 + inventoryGrowPerYear, -yearsAgo);
    }
    if (sbcPerQuarter != null) {
      row.stockBasedCompensation = sbcPerQuarter * factor;
    }
    rows.push(row);
  }
  return rows;
}

/** `n` annual rows, newest first, spaced ~365 days. */
export function makeAnnual({
  n = 4,
  baseRevenue = 4000,
  baseNetIncome = 800,
  grow = 0.15,
  everyYearProfit = true,
} = {}) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const factor = Math.pow(1 + grow, -i);
    rows.push({
      date: iso(-i * 365 * DAY_MS),
      totalRevenue: baseRevenue * factor,
      netIncome: everyYearProfit
        ? baseNetIncome * factor
        : i % 2 === 0
          ? baseNetIncome * factor
          : -baseNetIncome * 0.3 * factor,
    });
  }
  return rows;
}

/** A healthy, growing company on a steady uptrend — should score a Buy. */
export function strongFixture() {
  return {
    chartData: makeCandles({ trend: 0.0016 }),
    quarterly: makeQuarterly(),
    annual: makeAnnual(),
    earnings: [],
    news: [],
  };
}

/**
 * Candles that rose to a peak then fell well below it — a strong business on
 * sale. `peakAt` is the fraction of the window where price tops out.
 */
export function makeDiscountCandles({
  days = 400,
  startClose = 100,
  peakClose = 220,
  endClose = 150, // ~32% below the peak
  peakAt = 0.6,
  symbol = "TEST",
} = {}) {
  const peakIndex = Math.floor(days * peakAt);
  const out = [];
  for (let pos = 0; pos < days; pos++) {
    let close;
    if (pos <= peakIndex) {
      close = startClose + (peakClose - startClose) * (pos / peakIndex);
    } else {
      close =
        peakClose +
        (endClose - peakClose) * ((pos - peakIndex) / (days - 1 - peakIndex));
    }
    const wave = Math.sin(pos / 9) * 0.008;
    out.push({
      symbol,
      name: symbol,
      instrumentType: "EQUITY",
      date: iso(-(days - 1 - pos) * DAY_MS),
      open: close * (1 - wave),
      high: close * (1 + Math.abs(wave) + 0.004),
      low: close * (1 - Math.abs(wave) - 0.004),
      close,
      adjclose: close,
      volume: 1_000_000,
    });
  }
  return out;
}

/** Strong finances, but the stock trades far below its 52-week high. */
export function discountFixture() {
  return {
    chartData: makeDiscountCandles(),
    quarterly: makeQuarterly({ grow: 0.15 }),
    annual: makeAnnual(),
    earnings: [],
    news: [],
  };
}

/** A shrinking, unprofitable company in a downtrend — should score a Sell. */
export function weakFixture() {
  return {
    chartData: makeCandles({ trend: -0.0016, startClose: 200 }),
    quarterly: makeQuarterly({
      grow: -0.12,
      baseNetIncome: -50,
      baseFcf: -40,
      shareTrendPerYear: 0.06, // dilution
      dividendPerQuarter: 0,
      eps: -0.2,
      totalDebt: 2000,
      equity: 400,
    }),
    annual: makeAnnual({ grow: -0.1, everyYearProfit: false }),
    earnings: [],
    news: [],
  };
}
