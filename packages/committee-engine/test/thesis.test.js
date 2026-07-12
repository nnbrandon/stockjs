import { test } from "node:test";
import assert from "node:assert/strict";

import { buildThesisSnapshot, checkThesis } from "../src/thesis.js";

const buyReport = (metrics) => ({ verdict: { action: "BUY" }, metrics });

test("builds a thesis from a BUY, top 3 legs in priority order", () => {
  const snap = buildThesisSnapshot(
    buyReport({
      netMargin: 22,
      fcfMargin: 18,
      revenueGrowthYoY: 15,
      roe: 25,
      netCash: true,
    }),
  );
  assert.ok(snap, "snapshot built");
  assert.equal(snap.legs.length, 3);
  assert.deepEqual(
    snap.legs.map((l) => l.id),
    ["margins", "cash", "growth"],
    "priority order margins → cash → growth",
  );
  assert.equal(snap.legs[0].capturedValue, 22);
  assert.ok(Number.isFinite(snap.engineVersion));
});

test("priority skips legs that don't qualify", () => {
  const snap = buildThesisSnapshot(
    buyReport({
      // margins does NOT qualify (netMargin < 12); the next three do.
      netMargin: 5,
      fcfMargin: 18,
      revenueGrowthYoY: 15,
      roe: 25,
    }),
  );
  assert.deepEqual(
    snap.legs.map((l) => l.id),
    ["cash", "growth", "quality"],
  );
});

test("HOLD / SELL verdicts and thin theses produce no snapshot", () => {
  assert.equal(
    buildThesisSnapshot({ verdict: { action: "HOLD" }, metrics: { netMargin: 30 } }),
    null,
  );
  assert.equal(
    buildThesisSnapshot({ verdict: { action: "SELL" }, metrics: { netMargin: 30 } }),
    null,
  );
  // Only one qualifying leg → not enough to anchor a thesis.
  assert.equal(buildThesisSnapshot(buyReport({ netMargin: 30 })), null);
});

test("checkThesis reports all legs intact when nothing drifted", () => {
  const snap = buildThesisSnapshot(
    buyReport({ netMargin: 22, fcfMargin: 18, revenueGrowthYoY: 15 }),
  );
  const check = checkThesis(
    snap,
    buyReport({ netMargin: 22, fcfMargin: 18, revenueGrowthYoY: 15 }),
  );
  assert.equal(check.status, "intact");
  assert.ok(check.legs.every((l) => l.status === "intact"));
  assert.match(check.line, /3 of 3 still hold/);
});

test("checkThesis flags weakening legs and lands on watch when two wobble", () => {
  const snap = buildThesisSnapshot(
    buyReport({ netMargin: 22, fcfMargin: 18, revenueGrowthYoY: 15 }),
  );
  const check = checkThesis(
    snap,
    // margins 18 (< cap-3=19 → weakening), fcf 12 (< cap-5=13 → weakening)
    buyReport({ netMargin: 18, fcfMargin: 12, revenueGrowthYoY: 15 }),
  );
  assert.equal(check.legs.find((l) => l.id === "margins").status, "weakening");
  assert.equal(check.legs.find((l) => l.id === "cash").status, "weakening");
  assert.equal(check.status, "watch");
});

test("checkThesis lands on broken when half the checkable legs break", () => {
  const snap = buildThesisSnapshot(
    buyReport({ netMargin: 22, fcfMargin: 18, revenueGrowthYoY: 15 }),
  );
  const check = checkThesis(
    snap,
    // margins 8 (< cap-6 → broken), growth -3 (< 0 → broken), cash intact
    buyReport({ netMargin: 8, fcfMargin: 18, revenueGrowthYoY: -3 }),
  );
  assert.equal(check.status, "broken");
  assert.match(check.line, /has broken down since the thesis was set/);
});

test("a missing metric is nodata, never broken", () => {
  const snap = buildThesisSnapshot(
    buyReport({ netMargin: 22, fcfMargin: 18, revenueGrowthYoY: 15 }),
  );
  const check = checkThesis(
    snap,
    // netMargin gone entirely; the other two hold
    buyReport({ fcfMargin: 18, revenueGrowthYoY: 15 }),
  );
  assert.equal(check.legs.find((l) => l.id === "margins").status, "nodata");
  assert.equal(check.status, "intact", "nodata doesn't drag overall to broken");
});

test("checkThesis returns null without a usable snapshot", () => {
  assert.equal(checkThesis(null, buyReport({})), null);
  assert.equal(checkThesis({ legs: [] }, buyReport({})), null);
});
