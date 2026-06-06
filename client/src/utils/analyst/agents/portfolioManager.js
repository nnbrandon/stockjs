import { atr, clamp } from "../indicators";

// 3-5-7 rule: ≤3% account risk per trade, ≤5% per position, ≤7% total exposure.
function buildRiskPlan(candles, metrics, action) {
  const entry = metrics.price;
  if (!Number.isFinite(entry)) return null;

  const atr14 = atr(candles, 14);
  // Stop distance: 2× ATR, falling back to a volatility proxy, floored at 4%.
  let stopDistancePct;
  if (Number.isFinite(atr14) && atr14 > 0) {
    stopDistancePct = Math.max(((2 * atr14) / entry) * 100, 4);
  } else if (Number.isFinite(metrics.volatility)) {
    stopDistancePct = Math.max((metrics.volatility / Math.sqrt(252)) * 2, 4);
  } else {
    stopDistancePct = 8;
  }
  stopDistancePct = Math.min(stopDistancePct, 25);

  const ACCOUNT_RISK = 3; // % of portfolio risked per trade
  const POSITION_CAP = 5; // % of portfolio per position
  const positionSizePct = Math.min(
    POSITION_CAP,
    (ACCOUNT_RISK / stopDistancePct) * 100,
  );
  const portfolioRiskPct = (positionSizePct * stopDistancePct) / 100;

  const stopPrice = entry * (1 - stopDistancePct / 100);
  const targetPrice = entry + (entry - stopPrice) * 2; // 2:1 reward:risk

  return {
    entry,
    stopPrice,
    stopDistancePct,
    targetPrice,
    targetPct: ((targetPrice - entry) / entry) * 100,
    positionSizePct,
    portfolioRiskPct,
    rewardRisk: 2,
    actionable: action === "BUY",
  };
}

// Synthesizes everything into a single verdict and a 3-5-7 risk plan.
export function runPortfolioManager({
  dataScout,
  sentiment,
  devil,
  candles = [],
}) {
  const pillars = [
    [dataScout.technicalScore, 0.4],
    [dataScout.fundamentalScore, 0.35],
    [sentiment.score, 0.25],
  ].filter(([v]) => Number.isFinite(v));

  const wsum = pillars.reduce((s, [, w]) => s + w, 0);
  const rawComposite = wsum
    ? pillars.reduce((s, [v, w]) => s + v * w, 0) / wsum
    : 50;

  // Devil's Advocate pulls the score toward neutral (50) rather than flipping it.
  const dampen = clamp(devil.confidencePenalty / 100, 0, 0.45);
  const composite = 50 + (rawComposite - 50) * (1 - dampen);

  let action;
  let tier;
  if (composite >= 78) {
    action = "BUY";
    tier = "Strong Buy";
  } else if (composite >= 64) {
    action = "BUY";
    tier = "Buy";
  } else if (composite >= 40) {
    action = "HOLD";
    tier = "Hold";
  } else if (composite >= 26) {
    action = "SELL";
    tier = "Sell";
  } else {
    action = "SELL";
    tier = "Strong Sell";
  }

  // Confidence: distance from neutral, less the devil's penalty.
  const conviction = clamp(
    Math.abs(composite - 50) * 2 - devil.confidencePenalty,
    0,
    100,
  );
  const convictionLabel =
    conviction >= 60 ? "High" : conviction >= 30 ? "Moderate" : "Low";

  const risk = buildRiskPlan(candles, dataScout.metrics, action);

  return {
    key: "portfolioManager",
    name: "Portfolio Manager",
    role: "The decision: buy, hold, or sell — and how much",
    action,
    tier,
    composite,
    conviction,
    convictionLabel,
    risk,
    summary: `${tier} — overall score ${composite.toFixed(0)}/100 with ${convictionLabel.toLowerCase()} confidence.`,
  };
}
