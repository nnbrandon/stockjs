import { test } from "node:test";
import assert from "node:assert/strict";

import { runAnalystCommittee } from "../src/analyst/index.js";
import { strongFixture } from "./fixtures.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY_MS).toISOString();

const scoutFindings = (report) =>
  report.agents.find((a) => a.key === "dataScout").findings.map((f) => f.text);

test("a near-term earnings date produces a heads-up finding", () => {
  const report = runAnalystCommittee({
    ...strongFixture(),
    nextEarningsDate: inDays(6),
  });
  const texts = scoutFindings(report).join(" | ");
  assert.match(texts, /Earnings report expected/);
  assert.equal(report.metrics.nextEarningsDate != null, true);
});

test("an estimated date says 'around'; a far date stays silent", () => {
  const estimate = runAnalystCommittee({
    ...strongFixture(),
    nextEarningsDate: inDays(6),
    nextEarningsDateIsEstimate: true,
  });
  assert.match(scoutFindings(estimate).join(" | "), /expected around/);

  const far = runAnalystCommittee({
    ...strongFixture(),
    nextEarningsDate: inDays(60),
  });
  assert.ok(
    !scoutFindings(far).some((t) => /Earnings report expected/.test(t)),
    "no heads-up for a date 60 days out",
  );
  // But the metric is still recorded for the entry plan to use.
  assert.equal(far.metrics.nextEarningsDate != null, true);
});

test("a BUY verdict includes a three-step ease-in plan", () => {
  const report = runAnalystCommittee(strongFixture());
  assert.equal(report.verdict.action, "BUY");
  const pm = report.agents.find((a) => a.key === "portfolioManager");
  assert.ok(pm.plan, "has a plan");
  assert.equal(pm.plan.kind, "entry");
  assert.ok(Array.isArray(pm.plan.tranches), "has tranches");
  assert.equal(pm.plan.tranches.length, 3);
  const total = pm.plan.tranches.reduce((s, t) => s + t.pct, 0);
  assert.equal(total, 100, "tranche percentages sum to 100");
  assert.equal(pm.plan.tranches[0].when, "now");
  // A plan finding should mention easing in.
  assert.ok(
    pm.findings.some((f) => /ease in/i.test(f.text)),
    "plan findings mention easing in",
  );
});

test("tranches tie the middle step to a near earnings date", () => {
  const report = runAnalystCommittee({
    ...strongFixture(),
    nextEarningsDate: inDays(10),
  });
  const pm = report.agents.find((a) => a.key === "portfolioManager");
  if (pm.plan?.kind === "entry") {
    assert.match(pm.plan.tranches[1].when, /after the report on/);
  }
});
