import {
  toCloses,
  sma,
  rsi,
  momentum,
  annualizedVolatility,
  maxDrawdown,
  rangePosition,
  ttmEps,
  scaleClamp,
} from "../indicators";
import { analyzeEarningsHistory } from "./earningsHistory";
import {
  avg,
  bear,
  bull,
  labelScore,
  neutral,
  pct,
  sortByDateDesc,
  stanceFromScore,
} from "./helpers";

function buildScoutSummary(tech, fund, m) {
  const bits = [];
  if (Number.isFinite(tech))
    bits.push(
      `the price trend looks ${labelScore(tech)} (${tech.toFixed(0)}/100)`,
    );
  if (Number.isFinite(fund))
    bits.push(
      `the company's finances look ${labelScore(fund)} (${fund.toFixed(0)}/100)`,
    );
  else bits.push("the company's finances aren't available");
  if (Number.isFinite(m.trailingPE))
    bits.push(
      `investors pay about $${m.trailingPE.toFixed(0)} per $1 of yearly profit`,
    );
  return `In short, ${bits.join("; ")}.`;
}

// Pulls the quantitative metrics: price trend, momentum, RSI, range, plus
// valuation/fundamentals (revenue & earnings growth, margins, trailing P/E).
export function runDataScout({
  candles = [],
  quarterly = [],
  annual = [],
  earnings = [],
}) {
  const closes = toCloses(candles);
  const findings = [];
  const metrics = {};

  // ---- Technicals ----
  let technicalScore = null;
  if (closes.length >= 20) {
    const price = closes.at(-1);
    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const rsi14 = rsi(closes, 14);
    const mom20 = momentum(closes, 20);
    const mom60 = momentum(closes, 60);
    const vol = annualizedVolatility(closes, 60);
    const dd = maxDrawdown(closes, 252);
    const rangePos = rangePosition(candles, 252);

    Object.assign(metrics, {
      price,
      sma20,
      sma50,
      sma200,
      rsi14,
      mom20,
      mom60,
      volatility: vol,
      drawdown: dd,
      rangePos,
    });

    // Trend
    let trendScore;
    if (sma50 != null && sma200 != null) {
      if (price > sma50 && sma50 > sma200) {
        trendScore = 85;
        findings.push(
          bull(
            "Price is above its average over the last 50 and 200 days — a steady uptrend",
            2,
          ),
        );
        if (sma50 > sma200)
          findings.push(
            bull(
              "The recent price average has crossed above the long-term average — a healthy sign",
              1,
            ),
          );
      } else if (price > sma50 && sma50 <= sma200) {
        trendScore = 58;
        findings.push(
          neutral(
            "Above its 50-day average price but still below the 200-day — looks like it's recovering",
            1,
          ),
        );
      } else if (price <= sma50 && sma50 > sma200) {
        trendScore = 42;
        findings.push(
          bear(
            "Has dipped below its 50-day average price, though the longer trend is still up",
            1,
          ),
        );
      } else {
        trendScore = 16;
        findings.push(
          bear(
            "Price is below both its 50-day and 200-day average — a downtrend",
            2,
          ),
        );
      }
    } else if (sma50 != null) {
      trendScore = price > sma50 ? 65 : 35;
      findings.push(
        price > sma50
          ? bull("Trading above its average price over the last 50 days", 1)
          : bear("Trading below its average price over the last 50 days", 1),
      );
    }

    // Momentum
    const momScore = avg([
      scaleClamp(mom20, -15, 15, 0, 100),
      scaleClamp(mom60, -25, 25, 0, 100),
    ]);
    if (Number.isFinite(mom60)) {
      if (mom60 > 8)
        findings.push(bull(`Up ${pct(mom60)} over the past 3 months`, 2));
      else if (mom60 < -8)
        findings.push(
          bear(`Down ${pct(Math.abs(mom60))} over the past 3 months`, 2),
        );
    }

    // RSI
    let rsiScore = 60;
    if (Number.isFinite(rsi14)) {
      if (rsi14 >= 70) {
        rsiScore = 30;
        findings.push(
          bear(
            "Has risen quickly and looks overbought — a pullback wouldn't be surprising",
            1,
          ),
        );
      } else if (rsi14 >= 55) {
        rsiScore = 70;
      } else if (rsi14 >= 45) {
        rsiScore = 60;
      } else if (rsi14 >= 30) {
        rsiScore = 45;
      } else {
        rsiScore = 52;
        findings.push(
          neutral(
            "Has fallen sharply and looks oversold — it may be due for a bounce",
            1,
          ),
        );
      }
    }

    // Range position
    const rangeScore = Number.isFinite(rangePos)
      ? scaleClamp(rangePos, 10, 90, 35, 78)
      : null;
    if (Number.isFinite(rangePos)) {
      if (rangePos >= 85)
        findings.push(bull("Near its highest price of the past year", 1));
      else if (rangePos <= 15)
        findings.push(bear("Near its lowest price of the past year", 1));
    }

    // Risk context (informational, mostly bearish-leaning)
    if (Number.isFinite(vol) && vol > 55)
      findings.push(
        bear("The price swings a lot day to day (high volatility)", 1),
      );
    if (Number.isFinite(dd) && dd < -35)
      findings.push(
        bear(`Has fallen ${pct(Math.abs(dd))} from its recent high`, 1),
      );

    technicalScore = avg([
      trendScore != null ? trendScore * 1.0 : null, // weight handled below
      momScore,
      rsiScore,
      rangeScore,
    ]);
    // Re-weight: trend 0.35, momentum 0.30, rsi 0.15, range 0.20
    const weighted = [
      [trendScore, 0.35],
      [momScore, 0.3],
      [rsiScore, 0.15],
      [rangeScore, 0.2],
    ].filter(([v]) => Number.isFinite(v));
    const wsum = weighted.reduce((s, [, w]) => s + w, 0);
    technicalScore = wsum
      ? weighted.reduce((s, [v, w]) => s + v * w, 0) / wsum
      : technicalScore;
  } else {
    findings.push(
      neutral("Not enough price history yet to judge the trend", 1),
    );
  }

  // ---- Fundamentals / valuation ----
  let fundamentalScore = null;
  const q = sortByDateDesc(quarterly);
  const a = sortByDateDesc(annual);
  const components = [];

  if (q.length >= 1) {
    const latest = q[0];
    const yearAgo = q[4]; // same quarter, prior year

    // Revenue growth YoY
    if (
      yearAgo &&
      Number.isFinite(latest.totalRevenue) &&
      yearAgo.totalRevenue
    ) {
      const revG =
        ((latest.totalRevenue - yearAgo.totalRevenue) /
          Math.abs(yearAgo.totalRevenue)) *
        100;
      metrics.revenueGrowthYoY = revG;
      components.push(scaleClamp(revG, -10, 30, 10, 95));
      if (revG > 10)
        findings.push(
          bull(`Sales grew ${revG.toFixed(0)}% compared to a year ago`, 2),
        );
      else if (revG < 0)
        findings.push(
          bear(
            `Sales shrank ${Math.abs(revG).toFixed(0)}% compared to a year ago`,
            2,
          ),
        );
    }

    // Net income / profitability
    if (yearAgo && Number.isFinite(latest.netIncome) && yearAgo.netIncome) {
      const niG =
        ((latest.netIncome - yearAgo.netIncome) / Math.abs(yearAgo.netIncome)) *
        100;
      metrics.netIncomeGrowthYoY = niG;
      components.push(scaleClamp(niG, -25, 40, 10, 95));
      if (niG > 10)
        findings.push(
          bull(`Profit grew ${niG.toFixed(0)}% compared to a year ago`, 1),
        );
      else if (niG < -10)
        findings.push(
          bear(
            `Profit fell ${Math.abs(niG).toFixed(0)}% compared to a year ago`,
            1,
          ),
        );
    }
    if (Number.isFinite(latest.netIncome)) {
      if (latest.netIncome <= 0) {
        components.push(30);
        findings.push(bear("Lost money in the latest quarter", 2));
      }
    }

    // Net margin
    if (Number.isFinite(latest.netIncome) && latest.totalRevenue) {
      const margin = (latest.netIncome / latest.totalRevenue) * 100;
      metrics.netMargin = margin;
      components.push(scaleClamp(margin, 0, 25, 35, 90));
      if (margin > 15)
        findings.push(
          bull(
            `Keeps ${margin.toFixed(0)} cents of every sales dollar as profit (healthy)`,
            1,
          ),
        );
      else if (margin < 0)
        findings.push(bear("Spends more than it earns on each sale", 1));
    }

    // Trailing P/E
    const eps = ttmEps(q);
    metrics.ttmEps = eps;
    if (Number.isFinite(eps) && Number.isFinite(metrics.price)) {
      if (eps > 0) {
        const pe = metrics.price / eps;
        metrics.trailingPE = pe;
        components.push(scaleClamp(pe, 60, 10, 30, 80)); // lower price-to-earnings → higher score
        if (pe < 15)
          findings.push(
            bull(
              `Looks inexpensive — about $${pe.toFixed(0)} paid per $1 of yearly profit`,
              1,
            ),
          );
        else if (pe > 45)
          findings.push(
            bear(
              `Looks expensive — about $${pe.toFixed(0)} paid per $1 of yearly profit`,
              1,
            ),
          );
      } else {
        metrics.trailingPE = null;
        components.push(35);
        findings.push(
          bear(
            "Hasn't been profitable over the past year, so it's hard to value",
            1,
          ),
        );
      }
    }
  }

  if (a.length >= 2) {
    const [latest, prior] = a;
    if (Number.isFinite(latest.totalRevenue) && prior.totalRevenue) {
      const revG =
        ((latest.totalRevenue - prior.totalRevenue) /
          Math.abs(prior.totalRevenue)) *
        100;
      metrics.annualRevenueGrowth = revG;
      components.push(scaleClamp(revG, -10, 25, 15, 90));
    }
  }

  // ---- Earnings (beat/miss history) ----
  const earningsAnalysis = analyzeEarningsHistory(earnings);
  if (earningsAnalysis) {
    Object.assign(metrics, earningsAnalysis.metrics);
    findings.push(...earningsAnalysis.findings);
    components.push(...earningsAnalysis.components);
  }

  if (components.length) fundamentalScore = avg(components);

  const score = avg([technicalScore, fundamentalScore]);
  return {
    key: "dataScout",
    name: "Data Scout",
    role: "The numbers: price trend & company health",
    score,
    technicalScore,
    fundamentalScore,
    stance: stanceFromScore(technicalScore ?? score),
    summary: buildScoutSummary(technicalScore, fundamentalScore, metrics),
    findings,
    metrics,
  };
}
