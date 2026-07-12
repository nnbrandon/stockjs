import { test } from "node:test";
import assert from "node:assert/strict";

import { runAnalystCommittee } from "../src/analyst/index.js";
import { makeCandles, makeQuarterly, makeAnnual } from "./fixtures.js";

// Build a committee input around a quarterly set, holding everything else
// constant so the only variable is the forensic field under test.
function reportFor(quarterlyOpts) {
  return runAnalystCommittee({
    chartData: makeCandles({ trend: 0.0016 }),
    quarterly: makeQuarterly(quarterlyOpts),
    annual: makeAnnual(),
    earnings: [],
    news: [],
  });
}

const findingText = (report) =>
  report.agents
    .find((a) => a.key === "dataScout")
    .findings.map((f) => f.text)
    .join(" | ");

test("receivables outracing sales trips 3a and lowers the fundamental score", () => {
  const clean = reportFor({ grow: 0.05 });
  const dirty = reportFor({
    grow: 0.05,
    receivablesBase: 300,
    receivablesGrowPerYear: 0.5, // ~50%/yr receivables on ~5%/yr sales
  });

  assert.match(findingText(dirty), /owe it a lot more than a year ago/);
  assert.doesNotMatch(findingText(clean), /owe it a lot more/);
  assert.ok(
    dirty.pillars.fundamental < clean.pillars.fundamental,
    `dirty fundamental ${dirty.pillars.fundamental} should be below clean ${clean.pillars.fundamental}`,
  );
});

test("heavy stock-based compensation trips 3b", () => {
  // SBC at ~25% of revenue (base revenue 1000/qtr → 250/qtr SBC).
  const dirty = reportFor({ sbcPerQuarter: 250 });
  const clean = reportFor({});

  assert.match(findingText(dirty), /new stock to employees/);
  assert.doesNotMatch(findingText(clean), /new stock to employees/);
  assert.ok(
    dirty.pillars.fundamental < clean.pillars.fundamental,
    "SBC load lowers the fundamental score",
  );
});

test("inventory building faster than sales trips 3c", () => {
  const dirty = reportFor({
    grow: 0.05,
    inventoryBase: 400,
    inventoryGrowPerYear: 0.6, // ~60%/yr inventory on ~5%/yr sales
  });
  const clean = reportFor({ grow: 0.05 });

  assert.match(findingText(dirty), /Unsold goods are piling up/);
  assert.doesNotMatch(findingText(clean), /piling up/);
  assert.ok(dirty.pillars.fundamental < clean.pillars.fundamental);
});

test("absent forensic fields produce none of the three flags and no score change", () => {
  const a = reportFor({ grow: 0.1 });
  const b = reportFor({ grow: 0.1 });
  const text = findingText(a);
  assert.doesNotMatch(text, /owe it|new stock|piling up/);
  // Determinism: the same fixture without forensic fields scores identically.
  assert.equal(a.pillars.fundamental, b.pillars.fundamental);
});
