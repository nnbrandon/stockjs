// The committee pipeline — the ONE place market data is fetched, news is
// FinBERT-scored, and the committee engine runs for product surfaces. Both
// the scheduled daily email and the on-demand action=runCommittee execute
// this; the UI (action=committeeResults) reads what it stored. That is the
// single-source-of-truth invariant: every surface shows the same stored run.
//
// Heavy imports (engine, FinBERT, Yahoo) live here on purpose — handlers
// that only READ state must import lib/reportState.js instead and lazy-load
// this module when they actually need an analysis run.

import {
  COMMITTEE_ENGINE_VERSION,
  runAnalystCommittee,
} from "@stockjs/committee-engine/analyst/index.js";
import {
  getPreviousSnapshot,
  getTierChange,
} from "@stockjs/committee-engine/analyst/verdictHistory.js";
import { mergeEarningsIntoQuarterly } from "@stockjs/committee-engine/mergeEarningsIntoQuarterly.js";
import { analyzePortfolioHealth } from "@stockjs/committee-engine/portfolioHealth.js";
import { isFundSymbol } from "@stockjs/committee-engine/isFundSymbol.js";
import {
  hasFinbertScore,
  selectNewsForAnalysis,
} from "@stockjs/committee-engine/selectNewsForAnalysis.js";

import {
  fetchAnalysisData,
  fetchDailyCandles,
  fetchFundamentalsData,
  fetchNewsData,
} from "./marketData.js";
import { getClassifier, scoreNewArticles } from "./sentiment.js";

const CANDLE_DAYS = 420;
// Match the client's fundamentals cache window (loadCommitteeData).
const FUNDAMENTALS_YEARS = 25;
const ARCHIVE_WINDOW_DAYS = 30;
export const MAX_HISTORY_ROWS = 60;
const FIRST_RUN_SCORE_CAP = 25;
const SYMBOL_CONCURRENCY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD in America/Los_Angeles (the Lambda clock is UTC). */
export function pacificDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Merge two article pools by id, preferring the version that carries a
 * FinBERT score — this is how the browser's already-scored archive beats the
 * server's unscored copy of the same article.
 */
export function mergeScoredArticles(base = [], extra = []) {
  const byId = new Map();
  for (const a of base) {
    if (a?.id != null) byId.set(a.id, a);
  }
  for (const a of extra) {
    if (a?.id == null) continue;
    const existing = byId.get(a.id);
    if (!existing || (!hasFinbertScore(existing) && hasFinbertScore(a))) {
      byId.set(a.id, a);
    }
  }
  return [...byId.values()];
}

/** Union history rows by day; `preferred` rows win. Oldest → newest. */
export function mergeHistoryRows(preferred = [], extra = []) {
  const byDay = new Map();
  for (const r of extra) {
    if (r?.day) byDay.set(r.day, r);
  }
  for (const r of preferred) {
    if (r?.day) byDay.set(r.day, r);
  }
  return [...byDay.values()]
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .slice(-MAX_HISTORY_ROWS);
}

/**
 * Pool every user's browser-synced evidence per symbol, so the per-symbol
 * committee run sees the union of what all the browsers saw.
 */
export function collectSyncedEvidence(users) {
  const bySymbol = new Map();
  for (const u of users) {
    for (const [symbol, entry] of Object.entries(u.symbols ?? {})) {
      const agg = bySymbol.get(symbol) ?? { articles: [], history: [] };
      agg.articles = mergeScoredArticles(agg.articles, entry?.articles ?? []);
      agg.history = mergeHistoryRows(agg.history, entry?.history ?? []);
      bySymbol.set(symbol, agg);
    }
  }
  return bySymbol;
}

/**
 * Merge today's fetched articles into the rolling archive: dedupe by id,
 * drop rows older than the window, newest first (selectNewsForAnalysis
 * expects the client's newest-first ordering).
 */
export function updateArticleArchive(archive = [], fresh = []) {
  const byId = new Map();
  for (const a of archive) {
    if (a?.id != null) byId.set(a.id, a);
  }
  for (const item of fresh) {
    if (item?.id == null || byId.has(item.id)) continue;
    // Store only the compact fields — bodies are crawled at scoring time and
    // discarded, so the S3 state stays small.
    byId.set(item.id, {
      id: item.id,
      title: item.title,
      publisher: item.publisher,
      link: item.link,
      date: item.date,
      ...(item.summary ? { summary: item.summary } : {}),
    });
  }

  const cutoff = Date.now() - ARCHIVE_WINDOW_DAYS * DAY_MS;
  return [...byId.values()]
    .filter((a) => {
      const t = new Date(a.date).getTime();
      return Number.isFinite(t) && t >= cutoff;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

/** How many days the archive spans (for the "warming up" footer note). */
export function archiveSpanDays(archive = []) {
  const times = archive
    .map((a) => new Date(a.date).getTime())
    .filter(Number.isFinite);
  if (!times.length) return 0;
  return (Math.max(...times) - Math.min(...times)) / DAY_MS;
}

function hasAnalysisCoverage(analysis) {
  if (!analysis) return false;
  return [
    analysis.forwardEps,
    analysis.analystCount,
    analysis.targetMeanPrice,
    analysis.recommendationMean,
  ].some(Number.isFinite);
}

/** Network phase for one holding — everything except FinBERT + committee. */
async function fetchSymbolData(holding, symbolState, synced) {
  const { symbol } = holding;
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - FUNDAMENTALS_YEARS);
  const ymd = (d) => d.toISOString().slice(0, 10);

  const [candles, fundamentals, analysis, freshNews] = await Promise.all([
    fetchDailyCandles(symbol, CANDLE_DAYS),
    fetchFundamentalsData(symbol, { start: ymd(start), end: ymd(end) }),
    fetchAnalysisData(symbol).catch((err) => {
      // Thin coverage is normal (funds, small caps) — not a symbol failure.
      console.error(`pipeline: analysis ${symbol} failed:`, err.message);
      return null;
    }),
    fetchNewsData(symbol).catch((err) => {
      console.error(`pipeline: news ${symbol} failed:`, err.message);
      return [];
    }),
  ]);

  // Browser-synced articles join the pool first (their FinBERT scores win
  // over unscored copies), then today's fetch tops it up.
  const pooled = mergeScoredArticles(
    symbolState?.articles ?? [],
    synced?.articles ?? [],
  );
  const archive = updateArticleArchive(pooled, freshNews);

  return { holding, candles, fundamentals, analysis, archive };
}

/** Run pool of `limit` workers over `items`. Results keep input order. */
async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
}

/**
 * The full analysis for a set of unique holdings: fetch market data, score
 * unseen news with FinBERT, run the committee, compute history/tier changes.
 * Returns per-symbol results (keyed off state.symbols for continuity) plus
 * run metadata. Pure with respect to `state` — callers persist.
 */
export async function analyzeSymbols(
  uniqueHoldings,
  state,
  syncedEvidence = new Map(),
) {
  const symbolState = state.symbols || {};
  const day = pacificDay();

  const fetched = await mapPool(
    uniqueHoldings,
    SYMBOL_CONCURRENCY,
    async (h) => {
      try {
        return await fetchSymbolData(
          h,
          symbolState[h.symbol],
          syncedEvidence.get(h.symbol),
        );
      } catch (err) {
        console.error(`pipeline: ${h.symbol} fetch failed:`, err);
        return { holding: h, error: err.message || "fetch failed" };
      }
    },
  );

  // ── Sentiment: score never-seen articles, sequentially per symbol ───────
  // (crawling has its own internal concurrency; FinBERT inference is
  // CPU-bound so interleaving symbols buys nothing).
  let articlesScored = 0;
  let sentimentPartial = false;

  // Funds are never scored, so their (perpetually unscored) archives must not
  // trigger a model load.
  const anyUnscored = fetched.some(
    (f) =>
      !f.error &&
      !isFundSymbol(f.candles) &&
      (f.archive ?? []).some((a) => !hasFinbertScore(a)),
  );
  if (anyUnscored) {
    try {
      await getClassifier(); // warm once so per-symbol errors are real errors
      for (const f of fetched) {
        if (f.error || isFundSymbol(f.candles)) continue;
        const unseen = (f.archive ?? [])
          .filter((a) => !hasFinbertScore(a))
          .slice(0, FIRST_RUN_SCORE_CAP);
        if (!unseen.length) continue;
        try {
          articlesScored += await scoreNewArticles(unseen);
        } catch (err) {
          console.error(`pipeline: scoring ${f.holding.symbol} failed:`, err);
          sentimentPartial = true;
        }
      }
    } catch (err) {
      // Model download/load failed — run with whatever scores the archive
      // already has. Never fail the whole run over sentiment.
      console.error("pipeline: FinBERT unavailable:", err);
      sentimentPartial = true;
    }
  }

  // ── Committee + history per symbol (user-independent) ───────────────────
  const generatedAt = new Date().toISOString();
  const symbolResults = fetched.map((f) => {
    const { symbol } = f.holding;
    if (f.error) {
      return { symbol, error: f.error };
    }

    const prevState = symbolState[symbol] || {};
    // The browser's synced history fills days the server never saw (its own
    // rows win on collisions), so tier-change detection and the engine's
    // history-aware rules match what the UI would conclude.
    const history = mergeHistoryRows(
      Array.isArray(prevState.history) ? prevState.history : [],
      syncedEvidence.get(symbol)?.history ?? [],
    );

    const quarterly = mergeEarningsIntoQuarterly(
      f.fundamentals.quarterlyResult ?? [],
      f.fundamentals.earningsResult?.history ?? [],
    );
    const earnings = f.fundamentals.earningsResult?.history ?? [];

    const isFund =
      isFundSymbol(f.candles) ||
      (!quarterly.length && !hasAnalysisCoverage(f.analysis));

    const base = {
      symbol,
      isFund,
      candles: f.candles,
      articles: f.archive,
      history,
      error: null,
    };

    if (isFund) return { ...base, report: null };

    const news = selectNewsForAnalysis(f.archive);
    const report = runAnalystCommittee({
      chartData: f.candles,
      quarterly,
      annual: f.fundamentals.annualResult ?? [],
      earnings,
      news,
      history,
      analysis: f.analysis,
    });

    if (!report) return { ...base, report: null };

    // Baseline must be read before today's row lands in history.
    const previousSnapshot = getPreviousSnapshot(history);
    const tierChange = getTierChange(report, previousSnapshot);

    // Same row shape as the client's committeeHistory store; same-day
    // re-runs overwrite, like the client.
    const bearAgent = report.agents?.find((a) => a.key === "bear");
    const row = {
      symbol,
      day,
      engineVersion: COMMITTEE_ENGINE_VERSION,
      composite: report.verdict.composite,
      tier: report.verdict.tier,
      action: report.verdict.action,
      conviction: report.verdict.conviction,
      technical: report.pillars?.technical ?? null,
      fundamental: report.pillars?.fundamental ?? null,
      sentiment: report.pillars?.sentiment ?? null,
      exitSignals: bearAgent?.exitSignals ?? null,
      generatedAt: report.generatedAt,
    };
    const newHistory = [...history.filter((r) => r.day !== day), row]
      .sort((a, b) => (a.day < b.day ? -1 : 1))
      .slice(-MAX_HISTORY_ROWS);

    const sentimentAgent = report.agents?.find((a) => a.key === "sentiment");

    return {
      ...base,
      history: newHistory,
      report,
      previousSnapshot,
      tierChange,
      newsMood: sentimentAgent?.summary ?? null,
      topPositive: sentimentAgent?.raw?.topPositive ?? null,
      topNegative: sentimentAgent?.raw?.topNegative ?? null,
    };
  });

  return { symbolResults, articlesScored, sentimentPartial, day, generatedAt };
}

/**
 * The per-symbol block the UI renders (stored as symbols[SYM].latest) —
 * everything a panel needs except per-user quantities.
 */
export function toLatestBlock(r, generatedAt) {
  return {
    report: r.report ?? null,
    previousSnapshot: r.previousSnapshot ?? null,
    tierChange: r.tierChange ?? null,
    newsMood: r.newsMood ?? null,
    topPositive: r.topPositive ?? null,
    topNegative: r.topNegative ?? null,
    isFund: Boolean(r.isFund),
    error: r.error ?? null,
    generatedAt,
    engineVersion: COMMITTEE_ENGINE_VERSION,
  };
}

/** symbols[] entries to persist after a run (failed symbols keep old state). */
export function nextSymbolStateEntries(symbolResults, generatedAt) {
  return Object.fromEntries(
    symbolResults
      .filter((r) => !r.error)
      .map((r) => [
        r.symbol,
        {
          articles: r.articles ?? [],
          history: r.history ?? [],
          latest: toLatestBlock(r, generatedAt),
        },
      ]),
  );
}

/**
 * One user's view of a run: their holdings joined onto the shared symbol
 * results (quantity/cost basis overlaid) + their portfolio health.
 */
export function computeUserView(holdings, resultBySymbol) {
  const results = holdings.map((h) => ({
    ...(resultBySymbol.get(h.symbol) ?? {
      symbol: h.symbol,
      error: "not analyzed",
    }),
    quantity: h.quantity,
    avgCostBasis: h.avgCostBasis,
  }));

  const health = analyzePortfolioHealth(
    results
      .filter((r) => !r.error)
      .map((r) => {
        const lastClose = Number(r.candles?.at(-1)?.close);
        const currentValue =
          Number.isFinite(r.quantity) && Number.isFinite(lastClose)
            ? r.quantity * lastClose
            : null;
        return {
          symbol: r.symbol,
          isFund: Boolean(r.isFund),
          currentValue,
          lastDate: r.candles?.at(-1)?.date ?? null,
          closes: (r.candles ?? [])
            .map((c) => Number(c.close))
            .filter(Number.isFinite),
          tier: r.report?.verdict?.tier ?? null,
          action: r.report?.verdict?.action ?? null,
          composite: r.report?.verdict?.composite ?? null,
        };
      }),
  );

  return { results, health };
}
