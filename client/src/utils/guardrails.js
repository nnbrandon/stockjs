// Behavioral guardrails: the classic self-inflicted mistakes, surfaced as a
// single nudge when the user's position and the committee's verdict combine
// dangerously. Nudges, not commands — the wording stays "consider".

const DOWN_BAD_PCT = -15;
const BIG_WINNER_PCT = 50;

/**
 * Highest-priority guardrail for a held position, or null.
 * @param {object} report committee report (verdict.action/tier)
 * @param {object} positionMetrics from computePositionMetrics (totalGainLossPct)
 */
export function getGuardrail(report, positionMetrics) {
  const action = report?.verdict?.action;
  const tier = report?.verdict?.tier;
  const gainPct = positionMetrics?.totalGainLossPct;
  if (!action || !Number.isFinite(gainPct)) return null;

  if (gainPct < DOWN_BAD_PCT && action === "SELL") {
    return {
      kind: "averagingDown",
      text: `You're down ${Math.abs(gainPct).toFixed(0)}% and the committee rates this a ${tier} — adding here would be averaging down into a broken thesis. The exit plan is in the Portfolio Manager card below.`,
    };
  }

  if (gainPct > BIG_WINNER_PCT && action === "BUY") {
    return {
      kind: "winnerSelling",
      text: `Up ${gainPct.toFixed(0)}% and still rated ${tier} — long-term returns come from letting exactly these run. Rebalancing an oversized position is fine; selling because it's "up a lot" is not a reason.`,
    };
  }

  return null;
}
