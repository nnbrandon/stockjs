import { test } from "node:test";
import assert from "node:assert/strict";

import { buildEarningsReview } from "../src/earningsReview.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-07-10T12:00:00Z").getTime();
const iso = (ms) => new Date(ms).toISOString();

function baseArgs(overrides = {}) {
  const reportedMs = NOW - 3 * DAY;
  return {
    earnings: [
      {
        reportedDate: iso(reportedMs),
        date: iso(reportedMs - 20 * DAY),
        epsActual: 1.2,
        epsEstimate: 1.0,
        surprisePercent: 20,
        revenueActual: 5000,
      },
    ],
    history: [
      { day: "2026-06-01", tier: "Hold", composite: 55 },
      { day: "2026-07-05", tier: "Hold", composite: 58 }, // still before report? report day 07-07
    ],
    candles: [
      { date: iso(NOW - 5 * DAY), close: 100 },
      { date: iso(NOW - 1 * DAY), close: 110 },
    ],
    report: {
      verdict: { tier: "Buy" },
      metrics: { earningsRevenueGrowthYoY: 12 },
    },
    windowDays: 10,
    nowMs: NOW,
    ...overrides,
  };
}

test("builds all four lines for a report inside the window", () => {
  const review = buildEarningsReview(baseArgs());
  assert.ok(review, "review produced");
  assert.equal(review.lines.length, 4);
  assert.match(review.lines[0], /expected profits of \$1\.00 per share/);
  assert.match(review.lines[0], /delivered \$1\.20 — beat it by 20%/);
  assert.match(review.lines[1], /Sales grew 12% vs\. the same quarter/);
  assert.match(review.lines[2], /moved up 10% since the report/);
  assert.match(review.lines[3], /rated it Hold going in, and it's Buy now/);
  assert.ok(
    Math.abs(review.priceReactionPct - 10) < 1e-9,
    `price reaction ~10% (got ${review.priceReactionPct})`,
  );
  assert.equal(review.verdictBefore.tier, "Hold");
  assert.equal(review.tierNow, "Buy");
});

test("returns null when the newest report is older than the window", () => {
  const args = baseArgs();
  args.earnings[0].reportedDate = iso(NOW - 30 * DAY);
  assert.equal(buildEarningsReview(args), null);
});

test("returns null for a future report date", () => {
  const args = baseArgs();
  args.earnings[0].reportedDate = iso(NOW + 2 * DAY);
  assert.equal(buildEarningsReview(args), null);
});

test("skips the expectation line when the estimate is missing, still renders the rest", () => {
  const args = baseArgs();
  delete args.earnings[0].epsEstimate;
  const review = buildEarningsReview(args);
  assert.ok(review, "review still produced");
  assert.ok(
    !review.lines.some((l) => /expected profits/.test(l)),
    "expectation line skipped",
  );
  assert.ok(review.lines.some((l) => /Sales grew/.test(l)));
  assert.ok(review.lines.some((l) => /since the report/.test(l)));
});

test("marks the stance unchanged when the tier did not move", () => {
  const args = baseArgs();
  args.report.verdict.tier = "Hold";
  const review = buildEarningsReview(args);
  assert.match(review.lines.at(-1), /Hold going in — unchanged after the report/);
});
