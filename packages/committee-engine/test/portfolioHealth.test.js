import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzePortfolioHealth } from "../src/portfolioHealth.js";

const TODAY = new Date().toISOString();

// Closes whose day-to-day returns follow a fixed pattern, so two series built
// from the same pattern correlate ~1 and two from orthogonal patterns ~0.
function closesFrom(patternFn, len = 70) {
  const out = [100];
  for (let i = 1; i < len; i++) out.push(out[i - 1] * (1 + patternFn(i)));
  return out;
}
const SIN = (i) => 0.01 * Math.sin((2 * Math.PI * i) / 5);
const COS = (i) => 0.01 * Math.cos((2 * Math.PI * i) / 5);

test("three same-sector stocks trip a sector-concentration flag", () => {
  const health = analyzePortfolioHealth([
    { symbol: "AAA", currentValue: 25, sector: "Technology" },
    { symbol: "BBB", currentValue: 25, sector: "Technology" },
    { symbol: "CCC", currentValue: 25, sector: "Technology" },
    { symbol: "VTI", currentValue: 25, isFund: true, sector: null },
  ]);
  const sector = health.flags.find((f) => f.kind === "sector");
  assert.ok(sector, "sector flag present");
  assert.match(sector.text, /75% of your portfolio is in one industry — Technology/);
  assert.deepEqual(sector.symbols.sort(), ["AAA", "BBB", "CCC"]);
  assert.equal(sector.severity, "warn", "75% > 60% → warn");
});

test("unknown sectors never produce a sector flag", () => {
  const health = analyzePortfolioHealth([
    { symbol: "AAA", currentValue: 40, sector: null },
    { symbol: "BBB", currentValue: 40, sector: null },
    { symbol: "CCC", currentValue: 20, sector: null },
  ]);
  assert.ok(!health.flags.some((f) => f.kind === "sector"));
});

test("a connected group of 3+ correlated names becomes one cluster, no pair flags inside", () => {
  const cluster = ["A", "B", "C", "D"].map((symbol) => ({
    symbol,
    currentValue: 100,
    sector: null,
    lastDate: TODAY,
    closes: closesFrom(SIN),
  }));
  const pair = ["E", "F"].map((symbol) => ({
    symbol,
    currentValue: 100,
    sector: null,
    lastDate: TODAY,
    closes: closesFrom(COS), // correlate with each other, orthogonal to A–D
  }));
  const health = analyzePortfolioHealth([...cluster, ...pair]);

  assert.equal(health.clusters.length, 1, "one ≥3 cluster");
  assert.deepEqual(health.clusters[0].symbols.slice().sort(), ["A", "B", "C", "D"]);

  const corrFlags = health.flags.filter((f) => f.kind === "correlation");
  const clusterFlag = corrFlags.find((f) => f.symbols.length >= 3);
  assert.ok(clusterFlag, "cluster flag present");
  assert.match(clusterFlag.text, /closer to one bet than 4 separate ones/);

  // The lone E/F pair keeps the two-name wording; A–D never appear in a pair.
  const pairFlags = corrFlags.filter((f) => f.symbols.length === 2);
  assert.equal(pairFlags.length, 1, "only the E/F pair remains a pair flag");
  assert.deepEqual(pairFlags[0].symbols.sort(), ["E", "F"]);
});

test("a lone correlated pair still gets a pair flag (no cluster)", () => {
  const health = analyzePortfolioHealth([
    { symbol: "E", currentValue: 100, sector: null, lastDate: TODAY, closes: closesFrom(SIN) },
    { symbol: "F", currentValue: 100, sector: null, lastDate: TODAY, closes: closesFrom(SIN) },
    { symbol: "G", currentValue: 100, sector: null, lastDate: TODAY, closes: closesFrom(COS) },
  ]);
  assert.equal(health.clusters.length, 0);
  const corrFlags = health.flags.filter((f) => f.kind === "correlation");
  assert.equal(corrFlags.length, 1);
  assert.deepEqual(corrFlags[0].symbols.sort(), ["E", "F"]);
});
