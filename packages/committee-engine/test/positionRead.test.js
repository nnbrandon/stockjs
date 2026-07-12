import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPositionRead } from "../src/positionRead.js";

test("SELL with a big gain talks about capital-gains tax and staged trims", () => {
  const read = buildPositionRead({ gainPct: 35, action: "SELL" });
  assert.match(read.line, /^You're up about 35% on this position\./);
  assert.match(read.line, /capital-gains tax/);
  assert.match(read.line, /taxable account/);
});

test("SELL gain boundary: exactly 20 fires the gain branch", () => {
  const read = buildPositionRead({ gainPct: 20, action: "SELL" });
  assert.match(read.line, /up about 20%/);
});

test("SELL with a loss frames the tax-loss silver lining, unsigned", () => {
  const read = buildPositionRead({ gainPct: -32.6, action: "SELL" });
  assert.match(read.line, /^You're down about 33% on this position\./);
  assert.match(read.line, /tax loss/);
  assert.doesNotMatch(read.line, /-33/);
});

test("SELL loss boundary: exactly -10 fires the loss branch", () => {
  const read = buildPositionRead({ gainPct: -10, action: "SELL" });
  assert.match(read.line, /tax loss/);
});

test("SELL near flat gets the little-tax-impact line", () => {
  for (const gainPct of [5, -9.9, 19.9, 0]) {
    const read = buildPositionRead({ gainPct, action: "SELL" });
    assert.match(read.line, /little tax impact/, `gainPct ${gainPct}`);
  }
});

test("a doubled winner speaks on non-SELL verdicts", () => {
  for (const action of ["HOLD", "BUY"]) {
    const read = buildPositionRead({ gainPct: 150, action });
    assert.match(read.line, /has doubled for you/, action);
  }
  assert.match(
    buildPositionRead({ gainPct: 100, action: "HOLD" }).line,
    /doubled/,
    "boundary at exactly 100",
  );
});

test("routine positions on non-SELL verdicts are silent", () => {
  assert.equal(buildPositionRead({ gainPct: 50, action: "HOLD" }), null);
  assert.equal(buildPositionRead({ gainPct: -40, action: "BUY" }), null);
  assert.equal(buildPositionRead({ gainPct: 99.9, action: "HOLD" }), null);
});

test("non-finite input is silent, whatever the action", () => {
  assert.equal(buildPositionRead({ gainPct: NaN, action: "SELL" }), null);
  assert.equal(buildPositionRead({ action: "SELL" }), null);
  assert.equal(buildPositionRead(), null);
});
