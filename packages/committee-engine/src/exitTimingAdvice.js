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

  const verb = tier === "Reduce" ? "trimming" : "selling";
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

  const factStr = facts.length
    ? facts.join(" and ")
    : Number.isFinite(fundamentalScore)
      ? `its financials score only ${fundamentalScore.toFixed(0)}/100`
      : "its financials haven't been strong";

  const lines = [];

  // ── Held a while (roughly a year or more) ───────────────────────────────
  if (weakFinancials) {
    lines.push(
      `If you've held this for around a year or more, the company hasn't earned more patience — ${factStr}, so bouncing back may be unlikely. We'd suggest ${verb} rather than waiting for a recovery.`,
    );
  } else if (improving) {
    lines.push(
      `If you've held this for around a year or more, the business itself has held up (revenue up ${rev.toFixed(0)}% over the past year) — the weakness looks more in the price than the fundamentals, so a partial ${act} may beat a full exit while the trend sorts out.`,
    );
  } else {
    lines.push(
      `If you've held this for around a year or more, it hasn't made real progress in that time and the trend is against it — little reason to keep waiting, so ${verb} is reasonable.`,
    );
  }

  // ── Held recently (a short while) ───────────────────────────────────────
  if (weakFinancials) {
    lines.push(
      `If you've only held it a short while, it's already turned against you and the weak financials back that up — the reason you bought it may not hold, so cut it rather than averaging down.`,
    );
  } else {
    lines.push(
      `If you've only held it a short while, the drop looks more like price weakness than a broken business — decide on a clear level where you'd ${act}, rather than reacting to short-term moves.`,
    );
  }

  return {
    headline: "Is it worth holding on for a bounce-back?",
    lines,
  };
}
