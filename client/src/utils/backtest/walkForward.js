// Pure walk-forward backtest logic. No IndexedDB, no DOM — testable in node.
// The browser entry point (./index.js) feeds it data from the Dexie cache.

import { runAnalystCommittee } from "../analyst";
import { COMMITTEE_ENGINE_VERSION } from "../analyst/version";

// Fundamentals become public well after the quarter ends; shifting them by a
// reporting lag keeps the replay (roughly) point-in-time.
export const FUNDAMENTALS_LAG_DAYS = 45;
const STEP_TRADING_DAYS = 5; // weekly
const WARMUP_TRADING_DAYS = 250; // committee needs ~1y of candles
const WINDOW_TRADING_DAYS = 252;
export const HORIZONS = { fwd3m: 63, fwd6m: 126, fwd12m: 252 };

const DAY_MS = 24 * 60 * 60 * 1000;
const t = (d) => new Date(d).getTime();

export const HONESTY_NOTES = [
  "News/sentiment pillar excluded — no historical news cache. This measures the technical + fundamental engine only.",
  "Fundamentals are as-fetched, not a true point-in-time database; a 45-day reporting lag is applied as an approximation.",
  "Survivorship bias: only symbols you watch today are replayed.",
  "Weekly samples of the same symbol overlap heavily — N overstates independent observations.",
  `Committee engine version ${COMMITTEE_ENGINE_VERSION}. Results are indicative, not audit-grade.`,
];

/**
 * Replay one symbol's history: every ~week, run the committee on only the
 * data that would have existed that day. Returns verdict records.
 */
export function walkForward({
  symbol,
  candles = [],
  quarterly = [],
  annual = [],
  earnings = [],
}) {
  const records = [];
  if (candles.length <= WARMUP_TRADING_DAYS) return records;

  const sorted = [...candles].sort((a, b) => t(a.date) - t(b.date));

  for (let i = WARMUP_TRADING_DAYS; i < sorted.length - 1; i += STEP_TRADING_DAYS) {
    const stepTime = t(sorted[i].date);
    if (!Number.isFinite(stepTime)) continue;
    const fundamentalsCutoff = stepTime - FUNDAMENTALS_LAG_DAYS * DAY_MS;

    const report = runAnalystCommittee({
      chartData: sorted.slice(Math.max(0, i - WINDOW_TRADING_DAYS + 1), i + 1),
      quarterly: quarterly.filter((r) => t(r.date) <= fundamentalsCutoff),
      annual: annual.filter((r) => t(r.date) <= fundamentalsCutoff),
      earnings: earnings.filter(
        (r) => t(r.reportedDate ?? r.date) <= stepTime,
      ),
      news: [],
    });
    if (!report) continue;

    records.push({
      symbol,
      index: i,
      date: sorted[i].date,
      action: report.verdict.action,
      tier: report.verdict.tier,
      composite: report.verdict.composite,
      technical: report.pillars.technical,
      fundamental: report.pillars.fundamental,
    });
  }
  return records;
}

const mean = (xs) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const round = (v, d = 2) => (v == null ? null : Number(v.toFixed(d)));

const TIER_ORDER = ["Strong Buy", "Buy", "Hold", "Reduce", "Sell"];
const TIER_RANK = Object.fromEntries(TIER_ORDER.map((tier, i) => [tier, 4 - i]));

/**
 * Grade the recorded verdicts against what prices did next.
 * `candlesBySymbol` must hold the SAME sorted arrays walkForward saw.
 * `spyCandles` (optional) adds a benchmark-excess column.
 */
export function computeMetrics(records, candlesBySymbol, spyCandles = null) {
  const sortedSpy = spyCandles?.length
    ? [...spyCandles].sort((a, b) => t(a.date) - t(b.date))
    : null;
  const spyIndexByDay = sortedSpy
    ? new Map(sortedSpy.map((c, i) => [String(c.date).slice(0, 10), i]))
    : null;

  const fwdReturn = (rec, horizon) => {
    const c = candlesBySymbol[rec.symbol];
    if (!c || rec.index + horizon >= c.length) return null;
    return (c[rec.index + horizon].close / c[rec.index].close - 1) * 100;
  };
  const spyFwdReturn = (rec, horizon) => {
    if (!sortedSpy) return null;
    const i = spyIndexByDay.get(String(rec.date).slice(0, 10));
    if (i == null || i + horizon >= sortedSpy.length) return null;
    return (sortedSpy[i + horizon].close / sortedSpy[i].close - 1) * 100;
  };
  const maxDrawdownAhead = (rec, horizon) => {
    const c = candlesBySymbol[rec.symbol];
    if (!c || rec.index >= c.length) return null;
    const slice = c.slice(rec.index, rec.index + horizon + 1);
    let peak = slice[0].close;
    let worst = 0;
    for (const candle of slice) {
      if (candle.close > peak) peak = candle.close;
      worst = Math.min(worst, (candle.close - peak) / peak);
    }
    return worst * 100;
  };

  // 1. Forward returns by tier
  const byTier = TIER_ORDER.map((tier) => {
    const recs = records.filter((r) => r.tier === tier);
    const row = { tier, n: recs.length };
    for (const [name, horizon] of Object.entries(HORIZONS)) {
      const rets = recs.map((r) => fwdReturn(r, horizon)).filter(Number.isFinite);
      row[`${name}Mean`] = round(mean(rets));
      row[`${name}Median`] = round(median(rets));
    }
    const excess = recs
      .map((r) => {
        const own = fwdReturn(r, HORIZONS.fwd6m);
        const spy = spyFwdReturn(r, HORIZONS.fwd6m);
        return Number.isFinite(own) && Number.isFinite(spy) ? own - spy : null;
      })
      .filter(Number.isFinite);
    row.vsSpy6m = round(mean(excess));
    row.smallSample = recs.length < 20;
    return row;
  }).filter((row) => row.n > 0);

  // 2. Sell avoidance: what happened after Reduce/Sell calls
  const sellRecs = records.filter((r) => r.action === "SELL");
  const sellFwd = sellRecs.map((r) => fwdReturn(r, HORIZONS.fwd6m)).filter(Number.isFinite);
  const sellDd = sellRecs
    .map((r) => maxDrawdownAhead(r, HORIZONS.fwd6m))
    .filter(Number.isFinite);
  const sellAvoidance = {
    n: sellRecs.length,
    avgFwd6m: round(mean(sellFwd)),
    medianFwd6m: round(median(sellFwd)),
    avgMaxDrawdown6m: round(mean(sellDd)),
    smallSample: sellRecs.length < 20,
  };

  // 3. Transitions: forward returns after tier upgrades vs downgrades
  const upgrades = [];
  const downgrades = [];
  const bySymbol = new Map();
  for (const r of records) {
    if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, []);
    bySymbol.get(r.symbol).push(r);
  }
  for (const recs of bySymbol.values()) {
    recs.sort((a, b) => a.index - b.index);
    for (let i = 1; i < recs.length; i++) {
      const prev = TIER_RANK[recs[i - 1].tier];
      const now = TIER_RANK[recs[i].tier];
      if (now === prev) continue;
      const ret = fwdReturn(recs[i], HORIZONS.fwd6m);
      if (!Number.isFinite(ret)) continue;
      (now > prev ? upgrades : downgrades).push(ret);
    }
  }
  const transitions = {
    upgrades: { n: upgrades.length, avgFwd6m: round(mean(upgrades)) },
    downgrades: { n: downgrades.length, avgFwd6m: round(mean(downgrades)) },
  };

  // 4. Calibration: composite decile → forward 6m return. Monotonic ⇒ the
  // score means something; flat ⇒ it doesn't.
  const calibration = [];
  for (let d = 0; d < 10; d++) {
    const lo = d * 10;
    const hi = lo + 10;
    const recs = records.filter(
      (r) => r.composite >= lo && (d === 9 ? r.composite <= hi : r.composite < hi),
    );
    const rets = recs.map((r) => fwdReturn(r, HORIZONS.fwd6m)).filter(Number.isFinite);
    if (recs.length) {
      calibration.push({
        decile: `${lo}–${hi}`,
        n: recs.length,
        avgFwd6m: round(mean(rets)),
        smallSample: recs.length < 20,
      });
    }
  }

  return {
    engineVersion: COMMITTEE_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    symbols: [...bySymbol.keys()],
    recordCount: records.length,
    hasBenchmark: Boolean(sortedSpy),
    notes: HONESTY_NOTES,
    byTier,
    sellAvoidance,
    transitions,
    calibration,
  };
}
