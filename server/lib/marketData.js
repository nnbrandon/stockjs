// Yahoo fetch logic shared by the public API handlers and the internal daily
// report. The public handlers stay thin wrappers around these functions so
// their behavior (shapes, error semantics) is identical to what the client
// has always received.

import { yahooFinance } from "./yahooFinance.js";
import { fetchEarningsHistory } from "../handlers/earningsHistory.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const toYmd = (d) => new Date(d).toISOString().slice(0, 10);

/** Raw Yahoo chart result — exactly what the public prices handler returns. */
export function fetchChartData(symbol, start, end) {
  return yahooFinance.chart(
    symbol,
    { period1: start, period2: end },
    { validateResult: false },
  );
}

/**
 * Daily OHLCV candles mapped to the exact row shape the client persists in
 * IndexedDB (see LambdaService.fetchHistoricalData): `{date, open, high, low,
 * close, volume, adjclose, name, symbol, instrumentType}`, oldest → newest,
 * rows without a close dropped, dates as ISO strings.
 */
export async function fetchDailyCandles(symbol, days = 420) {
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY_MS);
  const data = await fetchChartData(symbol, toYmd(start), toYmd(end));

  const instrumentType = data?.meta?.instrumentType ?? null;
  const name = data?.meta?.shortName ?? null;

  return (data?.quotes ?? [])
    .filter((item) => item.close != null)
    .map((item) => ({
      name,
      symbol,
      instrumentType,
      ...item,
      date:
        item.date instanceof Date ? item.date.toISOString() : String(item.date),
    }));
}

// Reporting-period ends usually match exactly across statement modules; the
// tolerance absorbs the occasional off-by-days period end.
const MERGE_TOLERANCE_MS = 10 * DAY_MS;

// One fundamentalsTimeSeries call, resolved to [] on failure so a missing
// statement module (common for foreign listings, ADRs, funds) never wipes out
// the income-statement data the client already depends on.
function fetchModule(symbol, { start, end }, type, module) {
  return yahooFinance
    .fundamentalsTimeSeries(
      symbol,
      { period1: start, period2: end, type, module },
      { validateResult: false },
    )
    .then((rows) => (Array.isArray(rows) ? rows : []))
    .catch((err) => {
      console.error(`fundamentals ${module}/${type} failed:`, err.message);
      return [];
    });
}

// Merge statement rows from different modules into one row per reporting
// date. Rows merge on exact date first, then nearest-within-tolerance, so the
// client keeps seeing a single quarterly/annual series with income-statement,
// cash-flow, and balance-sheet fields side by side.
function mergeRowsByDate(base, ...extraArrays) {
  const rows = base.map((r) => ({ ...r }));
  const timeOf = (r) => new Date(r.date).getTime();

  for (const extras of extraArrays) {
    for (const extra of extras) {
      const t = timeOf(extra);
      if (!Number.isFinite(t)) continue;

      let best = null;
      let bestDiff = Infinity;
      for (const row of rows) {
        const diff = Math.abs(timeOf(row) - t);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = row;
        }
      }
      if (best && bestDiff <= MERGE_TOLERANCE_MS) {
        // Income-statement fields win any name collision.
        for (const [k, v] of Object.entries(extra)) {
          if (!(k in best)) best[k] = v;
        }
      } else {
        rows.push({ ...extra });
      }
    }
  }
  return rows;
}

/**
 * Quarterly + annual statements (income, cash-flow, balance-sheet merged per
 * reporting date) plus the analyst earnings history — the exact payload the
 * public fundamentals endpoint returns.
 *
 * @returns {Promise<{quarterlyResult: Array, annualResult: Array, earningsResult: object}>}
 */
export async function fetchFundamentalsData(symbol, { start, end }) {
  const range = { start, end };
  const [
    quarterlyIncome,
    annualIncome,
    quarterlyCashFlow,
    annualCashFlow,
    quarterlyBalance,
    annualBalance,
    earningsResult,
  ] = await Promise.all([
    fetchModule(symbol, range, "quarterly", "financials"),
    fetchModule(symbol, range, "annual", "financials"),
    fetchModule(symbol, range, "quarterly", "cash-flow"),
    fetchModule(symbol, range, "annual", "cash-flow"),
    fetchModule(symbol, range, "quarterly", "balance-sheet"),
    fetchModule(symbol, range, "annual", "balance-sheet"),
    fetchEarningsHistory(symbol),
  ]);

  return {
    quarterlyResult: mergeRowsByDate(
      quarterlyIncome,
      quarterlyCashFlow,
      quarterlyBalance,
    ),
    annualResult: mergeRowsByDate(annualIncome, annualCashFlow, annualBalance),
    earningsResult,
  };
}

// Forward-looking analyst data: estimate revisions, forward valuation,
// consensus. Flattened to a stable shape — Yahoo's nesting churns, and the
// client caches this, so the contract must not.
const num = (v) =>
  Number.isFinite(v) ? v : Number.isFinite(v?.raw) ? v.raw : null;

function trendFor(earningsTrend, period) {
  return earningsTrend?.trend?.find((t) => t.period === period) ?? null;
}

/**
 * Analyst estimates/consensus, flattened. Throws on Yahoo failure — callers
 * decide whether that means "empty payload" (public handler) or "no analysis
 * pillar today" (daily report).
 */
export async function fetchAnalysisData(symbol) {
  const result = await yahooFinance.quoteSummary(
    symbol,
    {
      // assetProfile rides along on this existing call (no extra request) to
      // give the committee the sector for peer-relative valuation. Missing on
      // some foreign listings/ADRs → sector resolves to null, a safe no-op.
      modules: [
        "earningsTrend",
        "financialData",
        "defaultKeyStatistics",
        "assetProfile",
      ],
    },
    { validateResult: false },
  );

  const nextYear = trendFor(result?.earningsTrend, "+1y");
  const epsTrend = nextYear?.epsTrend ?? {};
  const revisions = nextYear?.epsRevisions ?? {};
  const fin = result?.financialData ?? {};
  const stats = result?.defaultKeyStatistics ?? {};

  return {
    symbol: symbol.toUpperCase(),
    fetchedAt: new Date().toISOString(),
    sector: result?.assetProfile?.sector ?? null,
    industry: result?.assetProfile?.industry ?? null,
    forwardEps: num(epsTrend.current),
    eps30dAgo: num(epsTrend["30daysAgo"]),
    eps90dAgo: num(epsTrend["90daysAgo"]),
    forwardEpsGrowth: num(nextYear?.growth),
    revisionsUp30d: num(revisions.upLast30days),
    revisionsDown30d: num(revisions.downLast30days),
    analystCount: num(nextYear?.earningsEstimate?.numberOfAnalysts),
    targetMeanPrice: num(fin.targetMeanPrice),
    recommendationMean: num(fin.recommendationMean),
    recommendationKey: fin.recommendationKey ?? null,
    forwardPE: num(stats.forwardPE),
    pegRatio: num(stats.pegRatio),
    beta: num(stats.beta),
  };
}

/**
 * Recent news for a symbol, mapped to the article shape the client persists:
 * `{id, title, publisher, link, date (ISO), thumbnail}`.
 */
export async function fetchNewsData(symbol) {
  // Yahoo's search feed has no date-range support — it returns the N most
  // recent articles, capped server-side (usually well under this). Ask for
  // the max anyway; the rolling archive in committee-state.json is what
  // turns these shallow daily fetches into a 30-day window, and
  // selectNewsForAnalysis samples evenly across that window.
  const result = await yahooFinance.search(
    symbol,
    {
      lang: "en-US",
      region: "US",
      quotesCount: 6,
      newsCount: 50,
    },
    { validateResult: false },
  );

  return (result?.news ?? []).map((item) => ({
    id: item.uuid,
    title: item.title,
    publisher: item.publisher,
    link: item.link,
    // v3 returns a Date for providerPublishTime; older shape was unix-seconds.
    date:
      item.providerPublishTime instanceof Date
        ? item.providerPublishTime.toISOString()
        : typeof item.providerPublishTime === "number"
          ? new Date(item.providerPublishTime * 1000).toISOString()
          : new Date(item.providerPublishTime).toISOString(),
    thumbnail: item.thumbnail,
  }));
}
