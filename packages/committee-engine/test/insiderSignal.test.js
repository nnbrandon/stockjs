import { test } from "node:test";
import assert from "node:assert/strict";

import { runAnalystCommittee } from "../src/analyst/index.js";
import { makeCandles, makeQuarterly, makeAnnual } from "./fixtures.js";

// Build a committee input where the only variable is the insider block on the
// analysis payload — candles/quarterly/annual stay constant, and no other
// analysis fields are set so nothing else in the expectations section fires.
function reportFor(insider) {
  return runAnalystCommittee({
    chartData: makeCandles({ trend: 0.0016 }),
    quarterly: makeQuarterly({}),
    annual: makeAnnual(),
    earnings: [],
    news: [],
    analysis: insider ? { ...insider } : null,
  });
}

const scoutFindings = (report) =>
  report.agents
    .find((a) => a.key === "dataScout")
    .findings.map((f) => f.text)
    .join(" | ");

test("strong net buying scores up and names the period", () => {
  const baseline = reportFor(null);
  const bought = reportFor({
    insiderNetPct: 3,
    insiderBuyCount: 4,
    insiderSellCount: 1,
    insiderPeriod: "6m",
  });

  assert.match(
    scoutFindings(bought),
    /putting their own money in/,
    "strong-buying finding present",
  );
  assert.match(scoutFindings(bought), /the last six months/);
  assert.ok(
    bought.pillars.fundamental > baseline.pillars.fundamental,
    `buying should lift the fundamental score (${bought.pillars.fundamental} vs ${baseline.pillars.fundamental})`,
  );
  const m = bought.agents.find((a) => a.key === "dataScout").metrics;
  assert.equal(m.insiderNetPct, 3);
  assert.equal(m.insiderPeriod, "6m");
});

test("modest net buying gets the softer finding", () => {
  const bought = reportFor({
    insiderNetPct: 1,
    insiderBuyCount: 3,
    insiderSellCount: 1,
  });
  assert.match(scoutFindings(bought), /quietly encouraging sign/);
  assert.doesNotMatch(scoutFindings(bought), /putting their own money in/);
});

test("heavy selling scores down mildly, with the hedge in the wording", () => {
  const baseline = reportFor(null);
  const sold = reportFor({
    insiderNetPct: -12,
    insiderBuyCount: 1,
    insiderSellCount: 6,
  });
  assert.match(scoutFindings(sold), /this much selling is worth knowing about/);
  assert.match(scoutFindings(sold), /taxes, diversification/);
  assert.ok(
    sold.pillars.fundamental < baseline.pillars.fundamental,
    "heavy selling should nick the fundamental score",
  );
});

test("routine churn is silent and leaves the score untouched", () => {
  const baseline = reportFor(null);
  const churn = reportFor({
    insiderNetPct: -3, // selling, but nowhere near the -10 bar
    insiderBuyCount: 2,
    insiderSellCount: 4,
  });
  assert.doesNotMatch(scoutFindings(churn), /insider|Insiders|own stock/i);
  assert.equal(churn.pillars.fundamental, baseline.pillars.fundamental);
});

test("fewer than 3 transactions is noise — silent even on a big net percent", () => {
  const baseline = reportFor(null);
  const thin = reportFor({
    insiderNetPct: 5,
    insiderBuyCount: 1,
    insiderSellCount: 1,
  });
  assert.doesNotMatch(scoutFindings(thin), /own stock/i);
  assert.equal(thin.pillars.fundamental, baseline.pillars.fundamental);
});

test("missing module (all nulls) is a true no-op", () => {
  const baseline = reportFor(null);
  const missing = reportFor({
    insiderNetPct: null,
    insiderBuyCount: null,
    insiderSellCount: null,
    insiderPeriod: null,
  });
  assert.doesNotMatch(scoutFindings(missing), /own stock/i);
  assert.equal(missing.pillars.fundamental, baseline.pillars.fundamental);
  const m = missing.agents.find((a) => a.key === "dataScout").metrics;
  assert.equal(m.insiderNetPct, undefined);
});

test("heavy selling needs 5+ sells, not just a big percent", () => {
  const sold = reportFor({
    insiderNetPct: -15,
    insiderBuyCount: 0,
    insiderSellCount: 4, // enough total tx to qualify, too few sells to flag
  });
  assert.doesNotMatch(scoutFindings(sold), /worth knowing about/);
});
