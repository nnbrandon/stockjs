// Browser entry for the committee backtest: replays every cached symbol
// through the committee walk-forward and grades the verdicts. Dev tool —
// exposed as window.__stockjsBacktest in dev builds; run it from the console:
//
//   const report = await window.__stockjsBacktest();
//
// Results are indicative, not audit-grade — see the printed notes.

import {
  getAnnual,
  getEarnings,
  getQuarterly,
  getStockDataBySymbol,
  getStoredSymbols,
} from "../../db";
import { isFundSymbol } from "@stockjs/committee-engine/isFundSymbol.js";
import { mergeEarningsIntoQuarterly } from "@stockjs/committee-engine/mergeEarningsIntoQuarterly.js";
import { buildExamples, computeMetrics, walkForward } from "./walkForward";

const MIN_CANDLES = 500; // ~2 years
const ALL_TIME = ["1980-01-01", "2100-01-01"];

export async function runBacktest({
  log = true,
  benchmark = "SPY",
  onProgress = null,
} = {}) {
  const symbols = await getStoredSymbols();
  const candlesBySymbol = {};
  const allRecords = [];
  const skipped = [];

  // Fetch the benchmark once up front so it can be replayed point-in-time
  // inside each symbol's walk-forward (market-relative fire-sale check).
  const benchmarkCandles = (await getStockDataBySymbol(benchmark)) ?? null;
  const spyForReplay =
    benchmarkCandles && benchmarkCandles.length >= MIN_CANDLES
      ? benchmarkCandles
      : [];

  for (const [i, symbol] of symbols.entries()) {
    if (onProgress) {
      onProgress({ done: i, total: symbols.length, symbol });
      // The replay itself is synchronous — yield a frame so the progress
      // update can actually paint before the CPU-heavy part starts.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const candles = await getStockDataBySymbol(symbol);
    if (!candles || candles.length < MIN_CANDLES) {
      skipped.push({ symbol, reason: `only ${candles?.length ?? 0} candles (need ${MIN_CANDLES})` });
      continue;
    }
    if (isFundSymbol(candles)) {
      skipped.push({ symbol, reason: "fund/ETF" });
      continue;
    }

    const [quarterly, annual, earnings] = await Promise.all([
      getQuarterly(symbol, ...ALL_TIME),
      getAnnual(symbol, ...ALL_TIME),
      getEarnings(symbol),
    ]);

    const records = walkForward({
      symbol,
      candles,
      quarterly: mergeEarningsIntoQuarterly(quarterly ?? [], earnings ?? []),
      annual: annual ?? [],
      earnings: earnings ?? [],
      spyCandles: spyForReplay,
    });
    // computeMetrics indexes into the same sorted array walkForward used.
    candlesBySymbol[symbol] = [...candles].sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );
    allRecords.push(...records);
  }

  const spyCandles = benchmarkCandles ?? candlesBySymbol[benchmark] ?? null;

  const report = computeMetrics(
    allRecords,
    candlesBySymbol,
    spyCandles?.length >= MIN_CANDLES ? spyCandles : null,
  );
  report.skipped = skipped;
  // One traceable median example per tier, so the UI can show the actual
  // arithmetic behind the averages.
  report.examples = buildExamples(
    allRecords,
    candlesBySymbol,
    spyCandles?.length >= MIN_CANDLES ? spyCandles : null,
  );

  if (log) {
    console.log(
      `%cCommittee backtest — ${report.symbols.length} symbols, ${report.recordCount} weekly verdicts (engine v${report.engineVersion})`,
      "font-weight:bold",
    );
    for (const note of report.notes) console.log(`  ⚠ ${note}`);
    if (!report.hasBenchmark)
      console.log(`  ⚠ No ${benchmark} candles cached — benchmark columns empty.`);
    console.log("Forward returns by tier (%):");
    console.table(report.byTier);
    console.log("After Reduce/Sell verdicts:");
    console.table([report.sellAvoidance]);
    console.log("After tier changes:");
    console.table([
      { change: "upgrades", ...report.transitions.upgrades },
      { change: "downgrades", ...report.transitions.downgrades },
    ]);
    console.log("Fire-sale flag → forward returns (flagged vs. not):");
    console.table([report.byFireSale.flagged, report.byFireSale.unflagged]);
    console.log("Fire-sale by confidence grade → forward returns:");
    console.table(report.byFireSale.byConfidence);
    console.log("Calibration (composite decile → avg forward 6m return):");
    console.table(report.calibration);
    console.log(
      `Calibration, fundamentals-informed verdicts only (${report.fundamentalsCoveragePct}% of records — Yahoo serves ~6 quarters of fundamentals, so deep history is technicals-only):`,
    );
    console.table(report.calibrationWithFundamentals);
    if (skipped.length) console.table(skipped);
    console.log("Full report object returned; download with __stockjsBacktestDownload(report).");
  }
  return report;
}

/** Save a backtest report as a JSON file. Accepts the report object or the
 * pending promise from runBacktest() — forgetting `await` in the console
 * would otherwise serialize a Promise into an empty {}. */
export async function downloadBacktestReport(report) {
  const resolved = await report;
  if (!resolved || typeof resolved !== "object" || !("recordCount" in resolved)) {
    console.warn(
      "downloadBacktestReport: that doesn't look like a backtest report — run `const report = await window.__stockjsBacktest()` first.",
    );
    return;
  }
  const blob = new Blob([JSON.stringify(resolved, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `committee-backtest-${resolved.generatedAt?.slice(0, 10) ?? "report"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
