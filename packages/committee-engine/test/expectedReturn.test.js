import { test } from "node:test";
import assert from "node:assert/strict";

import { estimateExpectedReturn } from "../src/expectedReturn.js";

test("decomposes growth, cash returned, and valuation drift", () => {
  const er = estimateExpectedReturn({
    metrics: {
      trailingPE: 20,
      price: 100,
      sector: "Technology", // band [20,35] → mid 27.5, P/E below mid → drift up
      dividendYieldPct: 1,
      shareCountChangePerYearPct: -2, // 2%/yr buyback
    },
    analysis: { forwardEpsGrowth: 0.1 },
    annual: [],
  });

  assert.ok(er, "estimate produced");
  assert.equal(er.growthPct, 10, "growth from forward EPS");
  assert.equal(er.yieldPct, 3, "1% dividend + 2% buyback");
  assert.equal(er.driftPct, 6, "drift clamped to +6");
  assert.equal(er.totalPct, 19);
  assert.equal(er.lowPct, 16);
  assert.equal(er.highPct, 22);
  assert.equal(er.basis.peMid, 27.5);
  assert.ok(!er.capped);
});

test("returns null for an unprofitable company (no trailing P/E)", () => {
  assert.equal(
    estimateExpectedReturn({ metrics: { trailingPE: null, price: 50 } }),
    null,
  );
  assert.equal(
    estimateExpectedReturn({ metrics: { trailingPE: -5, price: 50 } }),
    null,
  );
});

test("returns null when there is no growth basis at all", () => {
  assert.equal(
    estimateExpectedReturn({
      metrics: { trailingPE: 18, price: 100 },
      analysis: null,
      annual: [],
    }),
    null,
  );
});

test("unknown sector zeroes the valuation drift", () => {
  const er = estimateExpectedReturn({
    metrics: {
      trailingPE: 20,
      price: 100,
      sector: "Nonexistent Sector",
      dividendYieldPct: 0,
      shareCountChangePerYearPct: 0,
    },
    analysis: { forwardEpsGrowth: 0.08 },
    annual: [],
  });
  assert.equal(er.driftPct, 0);
  assert.equal(er.basis.peMid, null);
});

test("clamps absurd growth to 18 and marks capped when the total blows past 25", () => {
  const er = estimateExpectedReturn({
    metrics: {
      trailingPE: 10,
      price: 100,
      sector: "Technology",
      dividendYieldPct: 5,
      shareCountChangePerYearPct: -5,
    },
    analysis: { forwardEpsGrowth: 0.5 }, // 50% → clamps to 18
    annual: [],
  });
  assert.equal(er.growthPct, 18);
  assert.equal(er.yieldPct, 6, "yield clamped to 6");
  assert.equal(er.totalPct, 25, "total clamped to 25");
  assert.equal(er.capped, true);
});

test("uses realized annual revenue growth when forward EPS is missing", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  // ~10%/yr revenue over 4 annual rows.
  const annual = [0, 1, 2, 3].map((i) => ({
    date: new Date(now - i * 365 * DAY).toISOString(),
    totalRevenue: 1000 * Math.pow(1.1, -i),
  }));
  const er = estimateExpectedReturn({
    metrics: { trailingPE: 22, price: 100 },
    analysis: null,
    annual,
  });
  assert.ok(er, "estimate produced from revenue growth alone");
  assert.ok(
    er.growthPct > 8 && er.growthPct < 12,
    `growth ~10% (got ${er.growthPct})`,
  );
});
