// Exit-timing guidance baked into every SELL/REDUCE verdict: whether now is a
// good time to sell or trim depends on how long you've held it AND on what the
// company has actually done over that time. The app doesn't know your purchase
// date, so the analysis addresses both cases — held a while vs. held recently —
// and grounds the reasoning in the committee's own read of the fundamentals
// (revenue, margins, profit over the past year), not tax rules.
//
// Pure + dependency-free so the client panels and the server email can share it.

// Below this, the fundamental pillar isn't "strong" — weak enough that a
// recovery isn't something to bank on.
const WEAK_FUNDAMENTAL = 50;

/**
 * Holding-period-aware exit guidance for a SELL/REDUCE, reasoned from how the
 * business has performed over the past year. Returns null for non-SELL
 * verdicts.
 *
 * @param {object} args
 * @param {string} args.action  verdict.action ("SELL" | "BUY" | "HOLD")
 * @param {string} args.tier    verdict.tier ("Sell" | "Reduce" | …)
 * @param {number} [args.fundamentalScore]  pillars.fundamental (0–100)
 * @param {object} [args.metrics]  { revenueGrowthYoY, netIncomeGrowthYoY, netMarginChange }
 * @returns {{headline:string, lines:string[]}|null}
 */
export function getExitTimingAdvice({
  action,
  tier,
  fundamentalScore,
  metrics = {},
} = {}) {
  if (action !== "SELL") return null;

  const act = tier === "Reduce" ? "trim" : "exit";

  const rev = metrics.revenueGrowthYoY;
  const ni = metrics.netIncomeGrowthYoY;
  const marginChange = metrics.netMarginChange;

  // Concrete signs the last year hasn't been strong.
  const facts = [];
  if (Number.isFinite(rev) && rev < 0)
    facts.push(`revenue is down ${Math.abs(rev).toFixed(0)}% over the past year`);
  if (Number.isFinite(marginChange) && marginChange <= -1)
    facts.push("its profit margins are thinner than a year ago");
  if (
    Number.isFinite(ni) &&
    ni <= -10 &&
    !(Number.isFinite(rev) && rev < 0)
  )
    facts.push(`profit is down ${Math.abs(ni).toFixed(0)}% year over year`);

  const weakFinancials =
    facts.length > 0 ||
    (Number.isFinite(fundamentalScore) && fundamentalScore < WEAK_FUNDAMENTAL);
  const improving =
    Number.isFinite(rev) &&
    rev > 5 &&
    (!Number.isFinite(marginChange) || marginChange >= 0);

  const lines = [];

  // Held a while (roughly a year or more).
  if (weakFinancials) {
    lines.push(
      `Held it a year or more? Don't wait for a rebound — the business hasn't earned it. Best to ${act}.`,
    );
  } else if (improving) {
    lines.push(
      `Held it a year or more? The business is actually holding up (sales up ${rev.toFixed(0)}%), so a partial ${act} may beat selling it all.`,
    );
  } else {
    lines.push(
      `Held it a year or more? It hasn't made progress and the trend's against it — not much reason to wait, so ${act}.`,
    );
  }

  // Held recently (a short while).
  if (weakFinancials) {
    lines.push(
      `Just bought? It's already turned against you and the numbers agree — cut it, don't buy more.`,
    );
  } else {
    lines.push(
      `Just bought? This looks more like a price dip than a broken business — pick a level to ${act} at instead of reacting to every move.`,
    );
  }

  return { headline: "How long have you held it?", lines };
}
