import { test } from "node:test";
import assert from "node:assert/strict";

import { runAnalystCommittee } from "../src/analyst/index.js";
import {
  fireSaleStreak,
  historicalPESeries,
} from "../src/analyst/agents/portfolioManager.js";
import { COMMITTEE_ENGINE_VERSION } from "../src/analyst/version.js";
import { discountFixture, makeCandles, makeQuarterly } from "./fixtures.js";

test("a strong business trading far below its high flags a fire sale", () => {
  const report = runAnalystCommittee(discountFixture());
  // Priced low on healthy finances → the discount indicator should fire, and
  // it must never appear on a SELL verdict.
  assert.notEqual(report.verdict.action, "SELL");
  assert.ok(report.verdict.fireSale, "fireSale flag present");
  assert.ok(
    Number.isFinite(report.verdict.fireSale.offHighPct) &&
      report.verdict.fireSale.offHighPct >= 25,
    "markdown is a real 25%+ discount",
  );
  assert.ok(
    ["High", "Moderate", "Low"].includes(
      report.verdict.fireSale.confidenceLabel,
    ),
    "has a confidence grade",
  );
});

test("historicalPESeries returns a usable series from matched candles/quarters", () => {
  const candles = makeCandles({ days: 400, startClose: 100 });
  const quarterly = makeQuarterly({ n: 8, eps: 1.2 });
  const series = historicalPESeries(candles, quarterly);
  assert.ok(Array.isArray(series), "returns an array");
  assert.ok(series.length >= 3, "at least three P/E points");
  assert.ok(
    series.every((pe) => Number.isFinite(pe) && pe > 0),
    "all P/E values are positive numbers",
  );
});

test("fireSaleStreak measures an unbroken run of prior fire-sale days", () => {
  const v = COMMITTEE_ENGINE_VERSION;
  const history = [
    { day: "2026-06-01", engineVersion: v, fireSale: { offHighPct: 30 } },
    { day: "2026-06-08", engineVersion: v, fireSale: { offHighPct: 31 } },
    { day: "2026-06-15", engineVersion: v, fireSale: { offHighPct: 32 } },
  ];
  const streak = fireSaleStreak(history);
  assert.ok(streak, "returns a streak");
  assert.equal(streak.days, 14, "spans 14 days start→end");
  assert.equal(streak.startOffHighPct, 30);
});

test("fireSaleStreak ignores rows from a different engine version", () => {
  const v = COMMITTEE_ENGINE_VERSION;
  const history = [
    { day: "2026-06-01", engineVersion: v - 1, fireSale: { offHighPct: 30 } },
    { day: "2026-06-08", engineVersion: v, fireSale: { offHighPct: 31 } },
  ];
  const streak = fireSaleStreak(history);
  // Only the current-version row counts → zero-day streak from a single row.
  assert.ok(streak, "returns a streak from the one valid row");
  assert.equal(streak.days, 0);
});

test("fireSaleStreak returns null with no fire-sale history", () => {
  assert.equal(fireSaleStreak([]), null);
  assert.equal(fireSaleStreak(null), null);
});
