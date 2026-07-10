import { test } from "node:test";
import assert from "node:assert/strict";

import { analyzeLongTermLens } from "../src/analyst/agents/longTermLens.js";
import { makeQuarterly, makeAnnual } from "./fixtures.js";

const textOf = (result) => result.findings.map((f) => f.text).join(" | ");

test("returns null when there is nothing multi-year to judge", () => {
  assert.equal(analyzeLongTermLens([], [], 100), null);
});

test("steady grower is recognized as consistent", () => {
  const res = analyzeLongTermLens(
    makeQuarterly(),
    makeAnnual({ n: 5, grow: 0.15 }),
    120,
  );
  assert.ok(res, "produces a result");
  assert.ok(
    /grown every year/i.test(textOf(res)),
    "flags the multi-year growth streak",
  );
  assert.ok(
    res.findings.some((f) => f.polarity === "bull"),
    "has a bullish consistency finding",
  );
});

test("buybacks vs dilution direction is read correctly", () => {
  const buyback = analyzeLongTermLens(
    makeQuarterly({ shareTrendPerYear: -0.03 }),
    makeAnnual(),
    120,
  );
  assert.ok(
    /buying back its own shares/i.test(textOf(buyback)),
    "detects buybacks",
  );

  const dilution = analyzeLongTermLens(
    makeQuarterly({ shareTrendPerYear: 0.06 }),
    makeAnnual(),
    120,
  );
  assert.ok(
    /issuing new shares|dilution/i.test(textOf(dilution)),
    "detects dilution",
  );
});

test("a non-payer produces no dividend finding and no penalty", () => {
  const res = analyzeLongTermLens(
    makeQuarterly({ dividendPerQuarter: 0 }),
    makeAnnual(),
    120,
  );
  // May still return consistency/buyback findings, but nothing about dividends.
  const text = res ? textOf(res) : "";
  assert.ok(
    !/dividend/i.test(text),
    "says nothing about dividends for a non-payer",
  );
});

test("an affordable dividend is described as comfortably covered", () => {
  const res = analyzeLongTermLens(
    makeQuarterly({ dividendPerQuarter: 5, baseFcf: 180 }),
    makeAnnual(),
    120,
  );
  assert.ok(/dividend|payout|a year at today/i.test(textOf(res)));
  assert.ok(
    res.findings.some(
      (f) => f.polarity === "bull" && /comfortably afford/i.test(f.text),
    ),
    "affordable dividend reads as a positive",
  );
});

test("a dividend that exceeds free cash flow is flagged as at-risk", () => {
  const res = analyzeLongTermLens(
    // Payout (130/quarter) exceeds free cash flow (100/quarter) → ~130% of FCF.
    makeQuarterly({ dividendPerQuarter: 130, baseFcf: 100 }),
    makeAnnual(),
    120,
  );
  assert.ok(
    res.findings.some(
      (f) => f.polarity === "bear" && /cut|more than the spare cash/i.test(f.text),
    ),
    "unaffordable dividend reads as a risk",
  );
});
