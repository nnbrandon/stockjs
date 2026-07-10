import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeTrackRecord,
  describeTrackRecord,
} from "../src/trackRecord.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-07-10T00:00:00Z");
const dayAgo = (n) => new Date(NOW - n * DAY_MS).toISOString().slice(0, 10);

// A verdict N days ago at `price`, graded against `currentPrice`.
const row = (n, action, price, pillars = {}) => ({
  day: dayAgo(n),
  action,
  price,
  technical: pillars.technical ?? 60,
  fundamental: pillars.fundamental ?? 60,
  sentiment: pillars.sentiment ?? 60,
});

test("empty input grades nothing", () => {
  const tr = computeTrackRecord([], { nowMs: NOW });
  assert.equal(tr.gradedTotal, 0);
  assert.ok(Array.isArray(tr.horizons));
});

test("grades buys and sells and computes the spread", () => {
  // Four names: buys that rose, sells that fell — 30-day horizon.
  const items = [
    { symbol: "A", currentPrice: 110, history: [row(30, "BUY", 100)] },
    { symbol: "B", currentPrice: 120, history: [row(30, "BUY", 100)] },
    { symbol: "C", currentPrice: 90, history: [row(30, "SELL", 100)] },
    { symbol: "D", currentPrice: 80, history: [row(30, "SELL", 100)] },
  ];
  const tr = computeTrackRecord(items, { nowMs: NOW });
  const h30 = tr.horizons.find((h) => h.horizon === 30);
  assert.ok(h30, "has a 30-day horizon");
  assert.equal(h30.per.BUY.n, 2, "two buys graded");
  assert.equal(h30.per.SELL.n, 2, "two sells graded");
  assert.ok(h30.per.BUY.meanReturn > 0, "buys rose on average");
  assert.ok(h30.per.SELL.meanReturn < 0, "sells fell on average");
  // Spread = buys − sells; buys up ~15%, sells down ~15% → ~30.
  assert.ok(h30.spread > 20, `spread ${h30.spread} is clearly positive`);
});

test("each name contributes at most once per horizon", () => {
  // Two verdicts in the 30-day window for the same name — only the closest
  // to 30 days should be graded.
  const items = [
    {
      symbol: "A",
      currentPrice: 110,
      history: [row(28, "BUY", 100), row(33, "BUY", 105)],
    },
  ];
  const tr = computeTrackRecord(items, { nowMs: NOW });
  const h30 = tr.horizons.find((h) => h.horizon === 30);
  assert.equal(h30.per.BUY.n, 1, "one graded verdict for the name");
});

test("verdicts outside the age window are not graded", () => {
  // 5 days ago is far too recent for the 30-day horizon window [18, 42].
  const items = [
    { symbol: "A", currentPrice: 110, history: [row(5, "BUY", 100)] },
  ];
  const tr = computeTrackRecord(items, { nowMs: NOW });
  assert.equal(tr.gradedTotal, 0, "nothing graded");
});

test("describeTrackRecord renders beginner lines without jargon", () => {
  // Enough buys/sells to clear MIN_GRADED (3) for the 30-day horizon.
  const items = [
    { symbol: "A", currentPrice: 115, history: [row(30, "BUY", 100)] },
    { symbol: "B", currentPrice: 112, history: [row(30, "BUY", 100)] },
    { symbol: "C", currentPrice: 88, history: [row(30, "SELL", 100)] },
  ];
  const tr = computeTrackRecord(items, { nowMs: NOW });
  const { lines } = describeTrackRecord(tr);
  assert.ok(lines.length >= 1, "produces at least a headline");
  const joined = lines.join(" ");
  assert.ok(/rated Buy/.test(joined), "mentions Buy verdicts");
  assert.ok(!/\bcalls\b/i.test(joined), "avoids the word 'calls'");
});

test("describeTrackRecord is empty when nothing has aged enough", () => {
  assert.deepEqual(describeTrackRecord(null), { lines: [] });
  assert.deepEqual(describeTrackRecord(computeTrackRecord([], { nowMs: NOW })), {
    lines: [],
  });
});
