// The daily AI Committee email report. Triggered by EventBridge Scheduler
// with payload {"action": "dailyReport"} — never reachable through the public
// Function URL (index.js branches on top-level event.action, which Function
// URL events don't carry).
//
// Flow: fetch fresh market data + news per holding → score never-seen
// articles with FinBERT (rolling 30-day archive in S3 state) → run the shared
// committee engine → compare against yesterday's verdicts → email a digest
// via SES when something is actionable.

import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

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
} from "../lib/marketData.js";
import { getClassifier, scoreNewArticles } from "../lib/sentiment.js";
import { renderReportEmail } from "../lib/reportEmail.js";
import { PORTFOLIO_KEY } from "./portfolioSync.js";

const STATE_KEY = "committee-state.json";
const CANDLE_DAYS = 420;
// Match the client's fundamentals cache window (loadCommitteeData).
const FUNDAMENTALS_YEARS = 25;
const ARCHIVE_WINDOW_DAYS = 30;
const MAX_HISTORY_ROWS = 60;
const FIRST_RUN_SCORE_CAP = 25;
const SYMBOL_CONCURRENCY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

const s3 = new S3Client({});
const ses = new SESClient({});

/** REPORT_SYMBOLS="AAPL:100:150.25,MSFT:50:300,VTI" → holdings. */
export function parseReportSymbols(raw) {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [symbol, quantity, avgCostBasis] = entry.split(":");
      return {
        symbol: symbol.toUpperCase(),
        quantity: Number.isFinite(Number(quantity)) && quantity !== undefined
          ? Number(quantity)
          : null,
        avgCostBasis:
          Number.isFinite(Number(avgCostBasis)) && avgCostBasis !== undefined
            ? Number(avgCostBasis)
            : null,
      };
    });
}

/** YYYY-MM-DD in America/Los_Angeles (the Lambda clock is UTC). */
export function pacificDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function loadState(bucket) {
  if (!bucket) return {};
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: STATE_KEY }),
    );
    return JSON.parse(await res.Body.transformToString());
  } catch (err) {
    if (err instanceof NoSuchKey || err.name === "NoSuchKey") return {};
    throw err;
  }
}

/**
 * The portfolio the browser synced via action=portfolioSync, or null when
 * none has been synced yet (fall back to REPORT_SYMBOLS).
 */
async function loadSyncedPortfolio(bucket) {
  if (!bucket) return null;
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: PORTFOLIO_KEY }),
    );
    const data = JSON.parse(await res.Body.transformToString());
    const holdings = (data?.positions ?? [])
      .filter((p) => typeof p?.symbol === "string" && p.symbol)
      .map((p) => ({
        symbol: p.symbol.toUpperCase(),
        quantity: Number.isFinite(p.quantity) ? p.quantity : null,
        avgCostBasis: Number.isFinite(p.averageCostBasis)
          ? p.averageCostBasis
          : null,
      }));
    if (!holdings.length) return null;
    return { holdings, updatedAt: data.updatedAt ?? null };
  } catch (err) {
    if (!(err instanceof NoSuchKey || err.name === "NoSuchKey")) {
      console.error("dailyReport: failed to read synced portfolio:", err);
    }
    return null;
  }
}

function saveState(bucket, state) {
  return s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: STATE_KEY,
      Body: JSON.stringify(state),
      ContentType: "application/json",
    }),
  );
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
function archiveSpanDays(archive = []) {
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
async function fetchSymbolData(holding, symbolState) {
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
      console.error(`dailyReport: analysis ${symbol} failed:`, err.message);
      return null;
    }),
    fetchNewsData(symbol).catch((err) => {
      console.error(`dailyReport: news ${symbol} failed:`, err.message);
      return [];
    }),
  ]);

  const archive = updateArticleArchive(symbolState?.articles ?? [], freshNews);

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

export async function runDailyReport() {
  const startedAt = Date.now();
  const bucket = process.env.REPORT_STATE_BUCKET || "";

  // Prefer the portfolio the browser synced (tracks the Fidelity import);
  // REPORT_SYMBOLS is the fallback for accounts that never synced.
  const synced = await loadSyncedPortfolio(bucket);
  const holdings =
    synced?.holdings ?? parseReportSymbols(process.env.REPORT_SYMBOLS);
  if (!holdings.length) {
    return {
      statusCode: 400,
      body: "No synced portfolio and REPORT_SYMBOLS is empty — nothing to report on",
    };
  }
  console.log(
    synced
      ? `dailyReport: using synced portfolio (${holdings.length} positions, updated ${synced.updatedAt})`
      : `dailyReport: using REPORT_SYMBOLS (${holdings.length} symbols)`,
  );
  const email = process.env.REPORT_EMAIL || "herosekai@gmail.com";
  const dryRun = process.env.REPORT_DRY_RUN === "1";
  const alwaysSend = process.env.REPORT_ALWAYS_SEND === "1";
  if (!bucket) {
    console.warn(
      "dailyReport: REPORT_STATE_BUCKET not set — running stateless (no history, no tier-change detection).",
    );
  }

  const day = pacificDay();
  const state = await loadState(bucket);
  const symbolState = state.symbols || {};

  // ── Fetch market data for all holdings (be polite to Yahoo) ─────────────
  const fetched = await mapPool(holdings, SYMBOL_CONCURRENCY, async (h) => {
    try {
      return await fetchSymbolData(h, symbolState[h.symbol]);
    } catch (err) {
      console.error(`dailyReport: ${h.symbol} fetch failed:`, err);
      return { holding: h, error: err.message || "fetch failed" };
    }
  });

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
          console.error(`dailyReport: scoring ${f.holding.symbol} failed:`, err);
          sentimentPartial = true;
        }
      }
    } catch (err) {
      // Model download/load failed — run with whatever scores the archive
      // already has. Never fail the whole report over sentiment.
      console.error("dailyReport: FinBERT unavailable:", err);
      sentimentPartial = true;
    }
  }

  // ── Committee + history per holding ─────────────────────────────────────
  const results = fetched.map((f) => {
    const { symbol, quantity, avgCostBasis } = f.holding;
    if (f.error) {
      return { symbol, quantity, avgCostBasis, error: f.error };
    }

    const prevState = symbolState[symbol] || {};
    const history = Array.isArray(prevState.history) ? prevState.history : [];

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
      quantity,
      avgCostBasis,
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

  // ── Portfolio health (needs quantities for value weights) ───────────────
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

  // ── Decide whether to send (exception-based) ────────────────────────────
  const anyNonHold = results.some(
    (r) => r.report && r.report.verdict.tier !== "Hold",
  );
  const anyTierChange = results.some((r) => r.tierChange);

  const flagKey = (f) => `${f.kind}:${[...(f.symbols || [])].sort().join(",")}`;
  const warnFlags = (health?.flags ?? []).filter((f) => f.severity === "warn");
  const previousFlagKeys = new Set(
    (state.lastHealthFlags ?? []).map(flagKey),
  );
  const anyNewWarnFlag = warnFlags.some((f) => !previousFlagKeys.has(flagKey(f)));

  const heartbeat = day.endsWith("-01");
  const actionable = anyNonHold || anyTierChange || anyNewWarnFlag;
  const shouldSend = actionable || heartbeat || alwaysSend;

  const spanDays = Math.min(
    ...results.filter((r) => !r.error && !r.isFund).map((r) =>
      archiveSpanDays(r.articles),
    ),
    Infinity,
  );

  const meta = {
    day,
    engineVersion: COMMITTEE_ENGINE_VERSION,
    articlesScored,
    sentimentPartial,
    archiveSpanDays: Number.isFinite(spanDays) ? spanDays : null,
    heartbeatOnly: heartbeat && !actionable,
  };

  // ── State to persist (article archive + history must accrue daily) ──────
  const nextState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    lastRunDay: day,
    lastSendDay: shouldSend ? day : (state.lastSendDay ?? null),
    lastHealthFlags: warnFlags.map((f) => ({
      kind: f.kind,
      symbols: f.symbols,
    })),
    symbols: {
      // Failed symbols keep their previous state so nothing is lost.
      ...symbolState,
      ...Object.fromEntries(
        results
          .filter((r) => !r.error)
          .map((r) => [
            r.symbol,
            { articles: r.articles ?? [], history: r.history ?? [] },
          ]),
      ),
    },
  };

  const elapsed = () => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;

  if (!shouldSend) {
    // Quiet day: history and the article archive must still accrue.
    if (bucket) await saveState(bucket, nextState);
    console.log(
      `dailyReport: skipped (all Hold, no changes) — ${results.length} symbols, ${articlesScored} articles scored, ${elapsed()}`,
    );
    return { statusCode: 200, body: "skipped: all Hold, no changes" };
  }

  const { subject, html, text } = renderReportEmail(results, health, meta);

  if (dryRun) {
    console.log(`dailyReport DRY RUN — subject: ${subject}`);
    console.log(html);
    // Also write the rendered email where a human can open it (local test
    // runs; on Lambda /tmp is writable and this is best-effort anyway).
    try {
      const { writeFileSync } = await import("node:fs");
      const { tmpdir } = await import("node:os");
      const path = `${tmpdir()}/stockjs-report.html`;
      writeFileSync(path, html);
      writeFileSync(`${tmpdir()}/stockjs-report.txt`, text);
      console.log(`dailyReport DRY RUN — rendered email written to ${path}`);
    } catch {
      // logging above is enough
    }
    if (bucket) await saveState(bucket, nextState);
    return { statusCode: 200, body: `dry-run: would send "${subject}"` };
  }

  // Send first; persist state ONLY after a successful send so a failed email
  // means tomorrow's run re-detects the same changes and retries.
  await ses.send(
    new SendEmailCommand({
      Source: email,
      Destination: { ToAddresses: [email] },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: html, Charset: "UTF-8" },
          Text: { Data: text, Charset: "UTF-8" },
        },
      },
    }),
  );
  if (bucket) await saveState(bucket, nextState);

  console.log(
    `dailyReport: sent "${subject}" to ${email} — ${results.length} symbols, ${articlesScored} articles scored, ${elapsed()}`,
  );
  return { statusCode: 200, body: "sent" };
}
