// A rough, plain-English 5-year expected-return estimate. Analysts don't stop
// at "cheap or expensive" — they sketch what you'd actually earn owning it.
// This decomposes a yearly return into three honest pieces:
//   • business growth  — how fast profits/sales are growing
//   • cash returned    — dividends plus the buyback "yield" (shrinking shares)
//   • valuation drift  — the P/E slowly settling back toward normal
//
// It is DISPLAY-ONLY and never scored: its inputs (growth, yield, valuation)
// are already scored individually, so scoring the combination would
// double-count. Everything is clamped to keep a sketch from reading as a
// promise, and the whole thing returns null for anything it can't stand behind
// (unprofitable companies, funds — which never reach the engine anyway).

import { SECTOR_BENCHMARKS } from "./sectorBenchmarks.js";

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// Realized annual revenue growth over up to 5 annual rows, annualized. Needs
// at least 3 rows to be worth anything. Returns null otherwise.
function realizedRevenueGrowth(annual = []) {
  const rows = [...annual]
    .filter((r) => Number.isFinite(r?.totalRevenue) && r.totalRevenue > 0)
    .sort((a, b) => new Date(a.date) - new Date(b.date)) // oldest → newest
    .slice(-5);
  if (rows.length < 3) return null;
  const oldest = rows[0];
  const newest = rows[rows.length - 1];
  const spanMs =
    new Date(newest.date).getTime() - new Date(oldest.date).getTime();
  const years = spanMs > 0 ? spanMs / (365 * 24 * 60 * 60 * 1000) : rows.length - 1;
  if (!(years > 0)) return null;
  return (Math.pow(newest.totalRevenue / oldest.totalRevenue, 1 / years) - 1) * 100;
}

/**
 * @param {object} args
 * @param {object} args.metrics   dataScout metrics (trailingPE, price, sector,
 *                                 dividendYieldPct, shareCountChangePerYearPct)
 * @param {object|null} args.analysis  flattened estimates (forwardEpsGrowth)
 * @param {Array} args.annual     annual statement rows
 * @returns {{totalPct, lowPct, highPct, growthPct, yieldPct, driftPct,
 *            basis:{peNow, peMid, sector}, capped?:true} | null}
 */
export function estimateExpectedReturn({
  metrics = {},
  analysis = null,
  annual = [],
} = {}) {
  const pe = metrics.trailingPE;
  if (!Number.isFinite(pe) || pe <= 0 || !Number.isFinite(metrics.price)) {
    return null;
  }

  // ── Business growth: average whichever of the two we have. ──
  const growthInputs = [];
  if (analysis && Number.isFinite(analysis.forwardEpsGrowth)) {
    growthInputs.push(analysis.forwardEpsGrowth * 100);
  }
  const revGrowth = realizedRevenueGrowth(annual);
  if (Number.isFinite(revGrowth)) growthInputs.push(revGrowth);
  if (!growthInputs.length) return null; // no growth basis → no estimate
  const growthPct = clamp(
    growthInputs.reduce((s, v) => s + v, 0) / growthInputs.length,
    -5,
    18,
  );

  // ── Cash returned: dividend yield + buyback shrink rate. ──
  const divYield = Number.isFinite(metrics.dividendYieldPct)
    ? metrics.dividendYieldPct
    : 0;
  const buybackYield = Number.isFinite(metrics.shareCountChangePerYearPct)
    ? Math.max(0, -metrics.shareCountChangePerYearPct)
    : 0;
  const yieldPct = clamp(divYield + buybackYield, 0, 6);

  // ── Valuation drift toward the sector-typical P/E over 5 years. ──
  const sector = metrics.sector ?? null;
  const band = sector ? SECTOR_BENCHMARKS[sector]?.typicalPE : null;
  let driftPct = 0;
  let peMid = null;
  if (band) {
    peMid = (band[0] + band[1]) / 2;
    driftPct = clamp((Math.pow(peMid / pe, 1 / 5) - 1) * 100, -6, 6);
  }

  let totalPct = growthPct + yieldPct + driftPct;
  let capped = false;
  if (totalPct > 25 || totalPct < -10) {
    capped = true;
    totalPct = clamp(totalPct, -10, 25);
  }

  return {
    totalPct,
    lowPct: totalPct - 3,
    highPct: totalPct + 3,
    growthPct,
    yieldPct,
    driftPct,
    basis: { peNow: pe, peMid, sector },
    ...(capped ? { capped: true } : {}),
  };
}
