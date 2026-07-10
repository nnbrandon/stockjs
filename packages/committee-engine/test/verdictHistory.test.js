import { test } from "node:test";
import assert from "node:assert/strict";

import { explainTierChange } from "../src/analyst/verdictHistory.js";

const snap = (tier, pillars) => ({
  tier,
  technical: pillars.technical,
  fundamental: pillars.fundamental,
  sentiment: pillars.sentiment,
});
const report = (tier, pillars) => ({
  verdict: { tier },
  pillars,
});

test("names the news mood when it drives a downgrade", () => {
  const prev = snap("Buy", { technical: 57, fundamental: 62, sentiment: 62 });
  const cur = report("Hold", {
    technical: 54, // moved a little (not a driver, not "unchanged")
    fundamental: 62, // held steady
    sentiment: 41, // the driver
  });
  const reason = explainTierChange(prev, cur);
  assert.ok(reason, "produces a reason");
  assert.match(reason, /Downgraded/);
  assert.match(reason, /news mood soured/);
  assert.match(reason, /62 → 41/);
  // The finances held steady → called out as unchanged, with plural agreement.
  assert.match(reason, /finances are unchanged/i);
});

test("names the price trend when it drives an upgrade", () => {
  const prev = snap("Hold", { technical: 38, fundamental: 55, sentiment: 50 });
  const cur = report("Buy", { technical: 61, fundamental: 55, sentiment: 50 });
  const reason = explainTierChange(prev, cur);
  assert.match(reason, /Upgraded mainly because the price trend improved/);
  assert.match(reason, /38 → 61/);
});

test("returns null when the tier did not change", () => {
  const prev = snap("Buy", { technical: 60, fundamental: 60, sentiment: 60 });
  const cur = report("Buy", { technical: 40, fundamental: 40, sentiment: 40 });
  assert.equal(explainTierChange(prev, cur), null);
});

test("falls back when no single pillar moved enough in the tier's direction", () => {
  // Tier drops but every pillar barely moved (or moved up) — no coherent driver.
  const prev = snap("Buy", { technical: 60, fundamental: 60, sentiment: 60 });
  const cur = report("Hold", {
    technical: 62,
    fundamental: 61,
    sentiment: 63,
  });
  const reason = explainTierChange(prev, cur);
  assert.match(reason, /small shifts across the signals/);
});

test("returns null without a previous snapshot", () => {
  assert.equal(explainTierChange(null, report("Buy", {})), null);
});
