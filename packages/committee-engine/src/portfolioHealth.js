import { correlation } from "./analyst/indicators";

const STOCK_CONCENTRATION_PCT = 20;
const TOP3_CONCENTRATION_PCT = 60;
const SECTOR_CONCENTRATION_PCT = 40;
const SECTOR_WARN_PCT = 60;
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
      sector: typeof i.sector === "string" && i.sector ? i.sector : null,
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

  // Sector concentration: too much of the account riding on one industry.
  // Only individual stocks with a known sector count — funds are baskets, and
  // an unknown sector is never invented as a group of its own.
  const sectorTotals = new Map();
  for (const w of stocks) {
    if (!w.sector) continue;
    const cur = sectorTotals.get(w.sector) ?? { pct: 0, symbols: [] };
    cur.pct += w.weightPct;
    cur.symbols.push(w.symbol);
    sectorTotals.set(w.sector, cur);
  }
  for (const [sector, { pct, symbols }] of sectorTotals) {
    if (pct > SECTOR_CONCENTRATION_PCT && symbols.length >= 2) {
      flags.push({
        kind: "sector",
        severity: pct > SECTOR_WARN_PCT ? "warn" : "info",
        symbols,
        text: `${pct.toFixed(0)}% of your portfolio is in one industry — ${sector} (${symbols.join(", ")}). One bad year for that industry would hit most of your account at once.`,
      });
    }
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
  // Group correlated pairs into connected clusters (a tiny union-find). Three
  // or more names all moving together is a bigger deal than a single pair —
  // it's closer to one concentrated bet than to diversification.
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    parent.set(find(a), find(b));
  };
  for (const pair of correlatedPairs) {
    for (const s of pair.symbols) if (!parent.has(s)) parent.set(s, s);
    union(pair.symbols[0], pair.symbols[1]);
  }
  const components = new Map();
  for (const s of parent.keys()) {
    const root = find(s);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(s);
  }
  const clusters = [];
  const clusteredSymbols = new Set();
  for (const members of components.values()) {
    if (members.length < 3) continue;
    // Order clusters by portfolio weight so the biggest bet reads first.
    const symbols = members.slice().sort((a, b) => {
      const wa = weights.find((w) => w.symbol === a)?.weightPct ?? 0;
      const wb = weights.find((w) => w.symbol === b)?.weightPct ?? 0;
      return wb - wa;
    });
    clusters.push({ symbols });
    for (const s of symbols) clusteredSymbols.add(s);
  }
  for (const cluster of clusters) {
    const syms = cluster.symbols;
    const listText = `${syms.slice(0, -1).join(", ")} and ${syms.at(-1)}`;
    flags.push({
      kind: "correlation",
      severity: "info",
      symbols: syms,
      text: `${listText} have been moving almost in lockstep — that's closer to one bet than ${syms.length} separate ones.`,
    });
  }
  // Pairs not absorbed into a ≥3 cluster keep the plain two-name wording.
  for (const pair of correlatedPairs) {
    if (pair.symbols.some((s) => clusteredSymbols.has(s))) continue;
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
    clusters,
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
