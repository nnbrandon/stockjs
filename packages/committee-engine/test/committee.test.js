import { test } from "node:test";
import assert from "node:assert/strict";

import { runAnalystCommittee } from "../src/analyst/index.js";
import { strongFixture, weakFixture } from "./fixtures.js";

test("runAnalystCommittee returns the expected report shape", () => {
  const report = runAnalystCommittee(strongFixture());
  assert.ok(report, "report is non-null");
  assert.ok(report.verdict, "has verdict");
  assert.ok(report.pillars, "has pillars");
  assert.ok(Array.isArray(report.agents), "has agents array");
  assert.equal(report.agents.length, 5, "five committee agents");
  assert.ok(
    Number.isFinite(report.verdict.composite),
    "composite is a number",
  );
  assert.ok(
    ["BUY", "HOLD", "SELL"].includes(report.verdict.action),
    "action is one of BUY/HOLD/SELL",
  );
});

test("verdict exposes the two-answer split with labels", () => {
  const report = runAnalystCommittee(strongFixture());
  const { answers } = report.verdict;
  assert.ok(answers, "answers present");
  for (const key of ["ownIt", "addNow"]) {
    assert.ok(answers[key], `${key} present`);
    assert.equal(typeof answers[key].label, "string");
    assert.ok(answers[key].label.length > 0, `${key} has a label`);
    assert.ok(
      ["pos", "mid", "neg", "na"].includes(answers[key].tone),
      `${key} tone is valid`,
    );
    assert.equal(typeof answers[key].line, "string");
  }
});

test("a healthy growing company scores a Buy; a failing one scores a Sell", () => {
  const strong = runAnalystCommittee(strongFixture());
  const weak = runAnalystCommittee(weakFixture());

  assert.equal(strong.verdict.action, "BUY", "strong fixture is a BUY");
  assert.equal(weak.verdict.action, "SELL", "weak fixture is a SELL");
  assert.ok(
    strong.verdict.composite > weak.verdict.composite + 20,
    "strong composite well above weak",
  );

  // The strong company should read as worth owning; the weak one not.
  assert.equal(strong.verdict.answers.ownIt.tone, "pos");
  assert.equal(weak.verdict.answers.ownIt.tone, "neg");
});

test("pillar scores land in sensible bands for the strong fixture", () => {
  const { pillars } = runAnalystCommittee(strongFixture());
  assert.ok(
    pillars.technical >= 55 && pillars.technical <= 100,
    `technical ${pillars.technical} in uptrend band`,
  );
  assert.ok(
    pillars.fundamental >= 55 && pillars.fundamental <= 100,
    `fundamental ${pillars.fundamental} in strong band`,
  );
});

test("returns null when there is no data at all", () => {
  assert.equal(runAnalystCommittee({}), null);
  assert.equal(
    runAnalystCommittee({ chartData: [], quarterly: [], news: [] }),
    null,
  );
});
