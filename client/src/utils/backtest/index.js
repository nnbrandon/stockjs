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
import { isFundSymbol } from "../isFundSymbol";
import { mergeEarningsIntoQuarterly } from "../mergeEarningsIntoQuarterly";
import { computeMetrics, walkForward } from "./walkForward";

const MIN_CANDLES = 500; // ~2 years
const ALL_TIME = ["1980-01-01", "2100-01-01"];

export async function runBacktest({ log = true, benchmark = "SPY" } = {}) {
  const symbols = await getStoredSymbols();
  const candlesBySymbol = {};
  const allRecords = [];
  const skipped = [];

  for (const symbol of symbols) {
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
    });
    // computeMetrics indexes into the same sorted array walkForward used.
    candlesBySymbol[symbol] = [...candles].sort(
      (a, b) => new Date(a.date) - new Date(b.date),
    );
    allRecords.push(...records);
  }

  const spyCandles =
    candlesBySymbol[benchmark] ?? (await getStockDataBySymbol(benchmark)) ?? null;

  const report = computeMetrics(
    allRecords,
    candlesBySymbol,
    spyCandles?.length >= MIN_CANDLES ? spyCandles : null,
  );
  report.skipped = skipped;

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
    console.log("Calibration (composite decile → avg forward 6m return):");
    console.table(report.calibration);
    if (skipped.length) console.table(skipped);
    console.log("Full report object returned; download with __stockjsBacktestDownload(report).");
  }
  return report;
}

/** Save a backtest report as a JSON file. */
export function downloadBacktestReport(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `committee-backtest-${report.generatedAt?.slice(0, 10) ?? "report"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
