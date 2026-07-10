import { test } from "node:test";
import assert from "node:assert/strict";

import { sectorValuationRead } from "../src/sectorBenchmarks.js";
import { runAnalystCommittee } from "../src/analyst/index.js";
import { strongFixture } from "./fixtures.js";

test("unknown sector or bad P/E is a no-op", () => {
  assert.equal(sectorValuationRead(20, null), null);
  assert.equal(sectorValuationRead(20, "Nonexistent Sector"), null);
  assert.equal(sectorValuationRead(NaN, "Technology"), null);
  assert.equal(sectorValuationRead(-5, "Technology"), null);
});

test("P/E below/inside/above the sector band reads cheap/fair/rich", () => {
  // Technology band is [20, 35].
  const cheap = sectorValuationRead(12, "Technology");
  assert.equal(cheap.verdict, "cheap");
  assert.ok(cheap.score > 60, "cheap scores above the band midpoint");

  const fair = sectorValuationRead(27, "Technology");
  assert.equal(fair.verdict, "fair");
  assert.ok(fair.score >= 45 && fair.score <= 60);

  const rich = sectorValuationRead(70, "Technology");
  assert.equal(rich.verdict, "rich");
  assert.ok(rich.score < 45, "rich scores below the band");
});

test("scores stay bounded far outside the band", () => {
  const veryRich = sectorValuationRead(1000, "Utilities");
  assert.ok(veryRich.score >= 20, "clamped, never negative");
  const veryCheap = sectorValuationRead(1, "Technology");
  assert.ok(veryCheap.score <= 80 + 1e-9, "clamped at the cheap ceiling");
});

test("an unknown sector leaves the committee's findings unchanged", () => {
  const without = runAnalystCommittee(strongFixture());
  const withUnknown = runAnalystCommittee({
    ...strongFixture(),
    sector: "Nonexistent Sector",
  });
  // No sector finding, and composite is identical (true no-op).
  assert.ok(
    !withUnknown.agents
      .find((a) => a.key === "dataScout")
      .findings.some((f) => /for its industry|even for/.test(f.text)),
    "no sector finding for an unknown sector",
  );
  assert.equal(
    withUnknown.verdict.composite.toFixed(4),
    without.verdict.composite.toFixed(4),
    "unknown sector does not move the score",
  );
});

test("a known sector adds a peer-valuation finding", () => {
  const report = runAnalystCommittee({
    ...strongFixture(),
    sector: "Technology",
  });
  const scout = report.agents.find((a) => a.key === "dataScout");
  const hasSectorFinding = scout.findings.some((f) =>
    /for its industry|even for Technology/.test(f.text),
  );
  // The strong fixture is profitable with a real P/E, so a sector read applies.
  assert.ok(hasSectorFinding, "produces a peer-valuation finding");
  assert.equal(report.metrics.sector, "Technology");
});
