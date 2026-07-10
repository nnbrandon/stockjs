// The single plainest "what to do next" line for a verdict. Pure and
// dependency-free so the daily email and the app panels all render identical,
// beginner-friendly guidance from one source of truth.

const fmtPrice = (n) =>
  Number.isFinite(n)
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : null;

/**
 * @param {object} args
 * @param {string} args.action  verdict.action ("BUY" | "HOLD" | "SELL")
 * @param {string} args.tier    verdict.tier
 * @param {object} [args.plan]  the portfolio-manager plan (entry | watch | exit)
 * @returns {string}
 */
export function whatToDo({ action, tier, plan } = {}) {
  if (action === "BUY") {
    const size =
      plan?.kind === "entry" && Number.isFinite(plan.positionSizePct)
        ? ` — keep it small, about ${plan.positionSizePct.toFixed(0)}% of your money`
        : "";
    const easeIn =
      plan?.kind === "entry" && plan.tranches?.length
        ? " Ease in over a few steps rather than all at once."
        : "";
    const stop =
      plan?.kind === "entry" && Number.isFinite(plan.stopPrice)
        ? ` Sell if it drops below ${fmtPrice(plan.stopPrice)}.`
        : "";
    return `Consider buying${size}.${easeIn}${stop}`;
  }

  if (action === "SELL") {
    if (plan?.kind === "exit" && plan.fullExit) return "Sell it.";
    if (plan?.kind === "exit" && Number.isFinite(plan.trimPct))
      return `Sell about ${plan.trimPct}% and watch the rest.`;
    return tier === "Reduce" ? "Trim the position." : "Sell it.";
  }

  const up =
    plan?.kind === "watch" && Number.isFinite(plan.upgradePrice)
      ? plan.upgradePrice
      : null;
  return `Hold — nothing to do right now.${up ? ` It'd look better above ${fmtPrice(up)}.` : ""}`;
}
