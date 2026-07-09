import { correlation } from "./analyst/indicators";

const STOCK_CONCENTRATION_PCT = 20;
const TOP3_CONCENTRATION_PCT = 60;
const CORRELATION_FLAG = 0.8;
const WEAK_POSITION_PCT = 10;

/**
 * Portfolio-level read: allocation, overlap, and how much money sits in
 * names the committee would sell. Pure — inputs are prepared by the caller.
 *
 * @param {Array} items [{symbol, isFund, currentValue, closes, tier, action, composite}]
 * @returns {object|null} health report, or null with no valued holdings
 */
export function analyzePortfolioHealth(items = []) {
  const valued = items.filter((i) => Number.isFinite(i.currentValue) && i.currentValue > 0);
  if (!valued.length) return null;

  const totalValue = valued.reduce((s, i) => s + i.currentValue, 0);
  if (totalValue <= 0) return null;

  const weights = valued
    .map((i) => ({
      symbol: i.symbol,
      isFund: Boolean(i.isFund),
      weightPct: (i.currentValue / totalValue) * 100,
      tier: i.tier ?? null,
      action: i.action ?? null,
      composite: Number.isFinite(i.composite) ? i.composite : null,
    }))
    .sort((a, b) => b.weightPct - a.weightPct);

  const flags = [];

  // Concentration. Index funds are diversification, not concentration —
  // only individual stocks get the single-position flag.
  const stocks = weights.filter((w) => !w.isFund);
  for (const w of stocks) {
    if (w.weightPct > STOCK_CONCENTRATION_PCT) {
      flags.push({
        kind: "concentration",
        severity: "warn",
        symbols: [w.symbol],
        text: `${w.symbol} is ${w.weightPct.toFixed(0)}% of your portfolio — more than a fifth of your account rides on one company.`,
      });
    }
  }
  const top3 = stocks.slice(0, 3);
  const top3Pct = top3.reduce((s, w) => s + w.weightPct, 0);
  if (stocks.length > 3 && top3Pct > TOP3_CONCENTRATION_PCT) {
    flags.push({
      kind: "concentration",
      severity: "info",
      symbols: top3.map((w) => w.symbol),
      text: `Your three largest stocks (${top3.map((w) => w.symbol).join(", ")}) are ${top3Pct.toFixed(0)}% of the portfolio.`,
    });
  }

  // Correlation clusters: pairs of stocks that move together are closer to
  // one bet than two. Series are aligned from the end, so if one symbol's
  // cache is stale (ends weeks earlier) the returns don't line up day-to-day
  // — skip pairs whose series end more than a week apart.
  const MAX_END_GAP_MS = 7 * 24 * 60 * 60 * 1000;
  const withCloses = valued.filter(
    (i) => !i.isFund && Array.isArray(i.closes) && i.closes.length >= 61,
  );
  const endTime = (i) => {
    const t = i.lastDate ? new Date(i.lastDate).getTime() : NaN;
    return Number.isFinite(t) ? t : null;
  };
  const correlatedPairs = [];
  for (let a = 0; a < withCloses.length; a++) {
    for (let b = a + 1; b < withCloses.length; b++) {
      const ta = endTime(withCloses[a]);
      const tb = endTime(withCloses[b]);
      if (ta != null && tb != null && Math.abs(ta - tb) > MAX_END_GAP_MS)
        continue;
      const r = correlation(withCloses[a].closes, withCloses[b].closes);
      if (Number.isFinite(r) && r > CORRELATION_FLAG) {
        correlatedPairs.push({
          symbols: [withCloses[a].symbol, withCloses[b].symbol],
          r,
        });
      }
    }
  }
  for (const pair of correlatedPairs) {
    flags.push({
      kind: "correlation",
      severity: "info",
      symbols: pair.symbols,
      text: `${pair.symbols[0]} and ${pair.symbols[1]} have moved almost in lockstep lately (correlation ${pair.r.toFixed(2)}) — they're closer to one bet than two.`,
    });
  }

  // Value-weighted committee score across rated holdings.
  const rated = weights.filter((w) => Number.isFinite(w.composite));
  const ratedValuePct = rated.reduce((s, w) => s + w.weightPct, 0);
  const weightedScore = ratedValuePct
    ? rated.reduce((s, w) => s + w.composite * w.weightPct, 0) / ratedValuePct
    : null;

  const sellRated = rated.filter((w) => w.action === "SELL");
  const pctInSellRated = sellRated.reduce((s, w) => s + w.weightPct, 0);

  // Large position + weak thesis: the combination is the danger.
  for (const w of sellRated) {
    if (w.weightPct > WEAK_POSITION_PCT) {
      flags.push({
        kind: "weakLarge",
        severity: "warn",
        symbols: [w.symbol],
        text: `${w.symbol} is ${w.weightPct.toFixed(0)}% of your portfolio and rated ${w.tier} — a large position with a weak thesis.`,
      });
    }
  }

  return {
    totalValue,
    weights,
    weightedScore,
    ratedValuePct,
    pctInSellRated,
    sellRatedSymbols: sellRated.map((w) => w.symbol),
    correlatedPairs,
    flags,
  };
}

// A portfolio-level "chair's read": the health facts synthesized into a short
// paragraph — overall lean, then the single biggest risk, then a close. It
// *references* the flags (which render in full below it) rather than repeating
// their text, the same prose-lead / structured-detail split the per-stock
// narrative uses. Returns null when there's nothing to say.
export function describePortfolioHealth(health) {
  if (!health) return null;
  const parts = [];

  const ws = health.weightedScore;
  if (Number.isFinite(ws)) {
    const lean =
      ws >= 62
        ? "is in good shape overall"
        : ws >= 48
          ? "is a mixed bag"
          : "is looking weak overall";
    parts.push(
      `Counting your bigger positions more, the committee gives your portfolio ${ws.toFixed(0)} out of 100 — it ${lean}.`,
    );
  }

  // Biggest risk: prefer a hard (warn) flag; else a heavy tilt into sell-rated
  // names. Named, not quoted, so the detail bullets don't read as an echo.
  const warn = (health.flags || []).find((f) => f.severity === "warn");
  if (warn) {
    const who = warn.symbols?.join(" and ") || "one position";
    const risk =
      warn.kind === "concentration"
        ? `${who} is an outsized share of the account`
        : warn.kind === "weakLarge"
          ? `${who} is a large position the committee would sell`
          : `${who} needs a closer look`;
    parts.push(`The main thing to watch: ${risk} (detail below).`);
  } else if (health.pctInSellRated > 15) {
    parts.push(
      `About ${health.pctInSellRated.toFixed(0)}% of your value sits in names the committee would sell.`,
    );
  } else {
    parts.push(
      "No single position or weak-thesis holding stands out as an outsized risk right now.",
    );
  }

  return parts.join(" ");
}
