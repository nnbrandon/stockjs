import { atr, clamp } from "../indicators";
import { bear, bull, neutral } from "./helpers";

const fmtPrice = (n) =>
  Number.isFinite(n)
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : null;

// 3-5-7 rule: ≤3% account risk per trade, ≤5% per position, ≤7% total exposure.
function buildEntryPlan(candles, metrics) {
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
    kind: "entry",
    entry,
    stopPrice,
    stopDistancePct,
    targetPrice,
    targetPct: ((targetPrice - entry) / entry) * 100,
    positionSizePct,
    portfolioRiskPct,
    rewardRisk: 2,
    actionable: true,
  };
}

// Why-sell reasons, exit level, and what to do with the proceeds. A committee
// that says "sell" owes the holder both the reasons and a next step.
function buildExitPlan(metrics, bearAgent, pillars) {
  const reasons = [...(bearAgent?.exitReasons ?? [])];
  if (!reasons.length) {
    // Fall back to naming the weakest pillar so the "why" is never empty.
    const worst = Object.entries(pillars)
      .filter(([, v]) => Number.isFinite(v))
      .sort((a, b) => a[1] - b[1])[0];
    if (worst) {
      const names = {
        technical: "the price trend is weak",
        fundamental: "the company's finances look weak",
        sentiment: "the news around it is negative",
      };
      reasons.push(names[worst[0]] ?? "the overall evidence leans negative");
    }
  }

  const reclaimPrice = Number.isFinite(metrics.sma50) ? metrics.sma50 : null;

  return {
    kind: "exit",
    reasons,
    reclaimPrice,
    reinvest: [
      "You don't have to reinvest right away — cash is a position too. Wait for an idea that actually scores Buy here.",
      "If you want to stay invested, compare against your other holdings: money freed up here is best moved toward the ones this committee rates Buy.",
      "If nothing on your list qualifies, a broad market index fund is the boring-but-sound default while you look.",
    ],
    actionable: true,
  };
}

function buildWatchPlan(metrics) {
  const { price, sma50, sma200 } = metrics;
  if (!Number.isFinite(price)) return null;
  const aboveLevel =
    Number.isFinite(sma50) && price < sma50 ? sma50 : null;
  const belowLevel = Number.isFinite(sma200)
    ? sma200
    : Number.isFinite(sma50)
      ? sma50
      : null;
  return {
    kind: "watch",
    upgradePrice: aboveLevel,
    downgradePrice: Number.isFinite(belowLevel) && belowLevel < price ? belowLevel : null,
    actionable: false,
  };
}

// Plain-English bullets that render in the committee transcript.
function buildPlanFindings(action, tier, plan) {
  const out = [];
  if (!plan) return out;

  if (action === "BUY") {
    out.push(
      bull(
        "The evidence lines up in favor — trend, finances, and news mood agree more than they conflict.",
        1,
      ),
    );
    out.push(
      neutral(
        `If buying: keep it to about ${plan.positionSizePct.toFixed(1)}% of your portfolio, plan your exit near ${fmtPrice(plan.stopPrice)} (${plan.stopDistancePct.toFixed(1)}% below), and aim for ${fmtPrice(plan.targetPrice)} — twice the risk taken.`,
        1,
      ),
    );
    out.push(
      neutral(
        "This call is wrong if the price closes below that exit level — sell there rather than averaging down.",
        1,
      ),
    );
    return out;
  }

  if (action === "SELL") {
    out.push(
      bear(
        tier === "Reduce"
          ? "The evidence leans negative — if you hold this, trimming the position beats adding to it."
          : "The weight of evidence is firmly negative — if you hold this, consider exiting rather than riding it down.",
        2,
      ),
    );
    for (const r of plan.reasons.slice(0, 4)) out.push(bear(`Why: ${r}`, 1));
    if (Number.isFinite(plan.reclaimPrice)) {
      out.push(
        neutral(
          `We'd revisit this call if the price recovers above its 50-day average (about ${fmtPrice(plan.reclaimPrice)}).`,
          1,
        ),
      );
    }
    for (const r of plan.reinvest) out.push(neutral(r, 1));
    return out;
  }

  // HOLD
  out.push(
    neutral(
      "No edge either way right now — the committee wouldn't put new money in or pull money out.",
      1,
    ),
  );
  if (Number.isFinite(plan.upgradePrice)) {
    out.push(
      neutral(
        `A close back above its 50-day average (about ${fmtPrice(plan.upgradePrice)}) would improve the picture.`,
        1,
      ),
    );
  }
  if (Number.isFinite(plan.downgradePrice)) {
    out.push(
      neutral(
        `A drop below about ${fmtPrice(plan.downgradePrice)} would tilt this toward a sell.`,
        1,
      ),
    );
  }
  return out;
}

function buildThesis(tier, composite, convictionLabel, pillars) {
  const names = {
    technical: "the price trend",
    fundamental: "the company's finances",
    sentiment: "the news mood",
  };
  const scored = Object.entries(pillars).filter(([, v]) => Number.isFinite(v));
  let driver = "";
  if (scored.length) {
    const sorted = [...scored].sort((a, b) => b[1] - a[1]);
    const [bestKey, bestVal] = sorted[0];
    const [worstKey, worstVal] = sorted[sorted.length - 1];
    if (composite >= 64 && bestVal >= 60) {
      driver = ` — mainly because ${names[bestKey]} looks strong`;
    } else if (composite < 45 && worstVal < 45) {
      driver = ` — mainly because ${names[worstKey]} looks weak`;
    }
  }
  return `${tier} — overall score ${composite.toFixed(0)}/100 with ${convictionLabel.toLowerCase()} confidence${driver}.`;
}

// Synthesizes everything into a single verdict and an action plan.
export function runPortfolioManager({
  dataScout,
  sentiment,
  devil,
  bear: bearAgent,
  candles = [],
}) {
  const pillarScores = {
    technical: dataScout.technicalScore,
    fundamental: dataScout.fundamentalScore,
    sentiment: sentiment.score,
  };
  const pillars = [
    [pillarScores.technical, 0.4],
    [pillarScores.fundamental, 0.35],
    [pillarScores.sentiment, 0.25],
  ].filter(([v]) => Number.isFinite(v));

  const wsum = pillars.reduce((s, [, w]) => s + w, 0);
  const rawComposite = wsum
    ? pillars.reduce((s, [v, w]) => s + v * w, 0) / wsum
    : 50;

  // Only genuine contradictions pull the score toward neutral (50). Data
  // gaps reduce confidence below instead — thin data shouldn't rescue a bad
  // stock into a HOLD.
  const contradictionPenalty =
    devil.contradictionPenalty ?? devil.confidencePenalty;
  const dampen = clamp(contradictionPenalty / 100, 0, 0.3);
  const composite = 50 + (rawComposite - 50) * (1 - dampen);

  let action;
  let tier;
  if (composite >= 78) {
    action = "BUY";
    tier = "Strong Buy";
  } else if (composite >= 64) {
    action = "BUY";
    tier = "Buy";
  } else if (composite >= 45) {
    action = "HOLD";
    tier = "Hold";
  } else if (composite >= 33) {
    action = "SELL";
    tier = "Reduce";
  } else {
    action = "SELL";
    tier = "Sell";
  }

  // Confidence: distance from neutral, less the devil's full penalty
  // (contradictions and data gaps both make us less sure).
  const conviction = clamp(
    Math.abs(composite - 50) * 2 - devil.confidencePenalty,
    0,
    100,
  );
  const convictionLabel =
    conviction >= 60 ? "High" : conviction >= 30 ? "Moderate" : "Low";

  const metrics = dataScout.metrics ?? {};
  const plan =
    action === "BUY"
      ? buildEntryPlan(candles, metrics)
      : action === "SELL"
        ? buildExitPlan(metrics, bearAgent, pillarScores)
        : buildWatchPlan(metrics);

  // Kept for backward compatibility: `risk` is the BUY entry plan.
  const risk = plan?.kind === "entry" ? plan : null;

  return {
    key: "portfolioManager",
    name: "Portfolio Manager",
    role: "The decision: buy, hold, or sell — and what to do about it",
    action,
    tier,
    composite,
    conviction,
    convictionLabel,
    risk,
    plan,
    summary: buildThesis(tier, composite, convictionLabel, pillarScores),
    findings: buildPlanFindings(action, tier, plan),
  };
}
