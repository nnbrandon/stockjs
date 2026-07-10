import { test } from "node:test";
import assert from "node:assert/strict";

// walkForward lives in the client but only imports the engine, so the shared
// test runner (which aliases @stockjs/committee-engine) can bundle it.
import {
  buildExamples,
  computeMetrics,
  HORIZONS,
} from "../../../client/src/utils/backtest/walkForward.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const day = (i) => new Date(Date.UTC(2024, 0, 1) + i * DAY_MS).toISOString();
const H = HORIZONS.fwd6m;

// Candles where index `entryIdx` closes at `entry` and `entryIdx + H` at
// `exit`, everything else a bland ramp.
function candlesWith(entryIdx, entry, exit) {
  return Array.from({ length: entryIdx + H + 5 }, (_, i) => ({
    date: day(i),
    close: i === entryIdx ? entry : i === entryIdx + H ? exit : 50 + i * 0.1,
  }));
}

test("buildExamples shows the exact arithmetic behind an average", () => {
  const candles = candlesWith(10, 100, 113); // +13%
  const spy = candlesWith(10, 200, 216); // +8%
  const records = [{ symbol: "T", index: 10, date: day(10), tier: "Buy" }];

  const examples = buildExamples(records, { T: candles }, spy);
  assert.equal(examples.length, 1);
  const ex = examples[0];
  assert.equal(ex.tier, "Buy");
  assert.equal(ex.entryClose, 100);
  assert.equal(ex.exitClose, 113);
  assert.ok(Math.abs(ex.retPct - 13) < 1e-6, "stock return is +13%");
  assert.ok(Math.abs(ex.spyRetPct - 8) < 1e-6, "market return is +8%");
});

test("buildExamples picks the median outcome per tier, not the best", () => {
  // Three Buy records with returns +5%, +10%, +40% → median is the +10% one.
  const mk = (idx, exit) => candlesWith(idx, 100, exit);
  const candlesBySymbol = {
    A: mk(10, 105),
    B: mk(10, 110),
    C: mk(10, 140),
  };
  const records = ["A", "B", "C"].map((symbol) => ({
    symbol,
    index: 10,
    date: day(10),
    tier: "Buy",
  }));
  const [ex] = buildExamples(records, candlesBySymbol, null);
  assert.ok(Math.abs(ex.retPct - 10) < 1e-6, "median (+10%) chosen");
});

test("computeMetrics groups forward returns by tier", () => {
  const candles = candlesWith(10, 100, 120); // +20%
  const records = [
    { symbol: "T", index: 10, date: day(10), tier: "Buy", composite: 70, fireSale: false, hasFundamentals: true },
  ];
  const report = computeMetrics(records, { T: candles });
  assert.equal(report.recordCount, 1);
  const buyRow = report.byTier.find((r) => r.tier === "Buy");
  assert.ok(buyRow, "has a Buy row");
  assert.ok(Math.abs(buyRow.fwd6mMean - 20) < 1e-6, "Buy mean is +20%");
});
