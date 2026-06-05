// The deterministic "analyst committee". Each function is one persona from a
// multi-agent investing workflow, but instead of an LLM it runs transparent,
// rule-based heuristics over the data the app already caches. Every agent
// returns a structured report (score + stance + human-readable findings) so
// the UI can show the full reasoning, not just a verdict.

import {
  toCloses,
  sma,
  rsi,
  atr,
  momentum,
  annualizedVolatility,
  maxDrawdown,
  rangePosition,
  ttmEps,
  clamp,
  scaleClamp,
} from "./indicators";
import { analyzeNewsSentiment } from "./sentiment";

const bull = (text, weight = 1) => ({ text, polarity: "bull", weight });
const bear = (text, weight = 1) => ({ text, polarity: "bear", weight });
const neutral = (text, weight = 1) => ({ text, polarity: "neutral", weight });

const pct = (n, d = 1) => (Number.isFinite(n) ? `${n.toFixed(d)}%` : "n/a");
const sortByDateDesc = (rows = []) =>
  [...rows].sort((a, b) => new Date(b.date) - new Date(a.date));

const EARNINGS_TRACK_QUARTERS = 8;
const EPS_SURPRISE_THRESH = 5;
const FRESH_EARNINGS_DAYS = 14;

const beatEps = (e) =>
  Number.isFinite(e.epsActual) &&
  Number.isFinite(e.epsEstimate) &&
  e.epsActual >= e.epsEstimate;

// Beat/miss track record + latest surprise for the Data Scout.
function analyzeEarningsHistory(earnings = []) {
  const tracked = sortByDateDesc(earnings)
    .filter(
      (e) => Number.isFinite(e.epsActual) && Number.isFinite(e.epsEstimate),
    )
    .slice(0, EARNINGS_TRACK_QUARTERS);

  if (!tracked.length) return null;

  const latest = tracked[0];
  const beats = tracked.filter(beatEps).length;
  const beatRate = (beats / tracked.length) * 100;

  let streak = 0;
  const streakIsBeat = beatEps(latest);
  for (const e of tracked) {
    if (beatEps(e) === streakIsBeat) streak++;
    else break;
  }

  const metrics = {
    earningsBeatRate: beatRate,
    earningsBeatStreak: streak,
    earningsQuartersTracked: tracked.length,
    lastEpsSurprise: latest.surprisePercent,
  };

  const findings = [];
  const components = [];

  const beatRateScore = scaleClamp(beatRate, 25, 100, 20, 90);
  const surpriseScore = Number.isFinite(latest.surprisePercent)
    ? scaleClamp(latest.surprisePercent, -15, 15, 15, 90)
    : null;
  components.push(
    surpriseScore != null ? avg([beatRateScore, surpriseScore]) : beatRateScore,
  );

  const quarterLabel = tracked.length === 1 ? "quarter" : "quarters";

  if (streak >= 3 && streakIsBeat) {
    findings.push(
      bull(
        `Beat profit expectations ${streak} ${quarterLabel} in a row — analysts keep underestimating it`,
        2,
      ),
    );
  } else if (streak >= 3 && !streakIsBeat) {
    findings.push(
      bear(
        `Missed profit expectations ${streak} ${quarterLabel} in a row — a worrying pattern`,
        2,
      ),
    );
  } else if (beatRate >= 75) {
    findings.push(
      bull(
        `Usually beats profit expectations — ${beats} of the last ${tracked.length} ${quarterLabel} (${beatRate.toFixed(0)}% hit rate)`,
        2,
      ),
    );
  } else if (beatRate < 50) {
    findings.push(
      bear(
        `Often misses profit expectations — only ${beats} of the last ${tracked.length} ${quarterLabel} beat (${beatRate.toFixed(0)}% hit rate)`,
        2,
      ),
    );
  } else {
    findings.push(
      neutral(
        `Mixed record vs. profit expectations — beat ${beats} of the last ${tracked.length} ${quarterLabel} (${beatRate.toFixed(0)}% hit rate)`,
        1,
      ),
    );
  }

  if (Number.isFinite(latest.surprisePercent)) {
    const actual = latest.epsActual.toFixed(2);
    const estimate = latest.epsEstimate.toFixed(2);
    if (latest.surprisePercent > EPS_SURPRISE_THRESH) {
      findings.push(
        bull(
          `Latest quarter crushed the estimate by ${latest.surprisePercent.toFixed(1)}% ($${actual} vs. $${estimate} expected)`,
          streak >= 3 && streakIsBeat ? 1 : 2,
        ),
      );
    } else if (latest.surprisePercent < -EPS_SURPRISE_THRESH) {
      findings.push(
        bear(
          `Latest quarter fell short of the estimate by ${Math.abs(latest.surprisePercent).toFixed(1)}% ($${actual} vs. $${estimate} expected)`,
          2,
        ),
      );
    } else {
      findings.push(
        neutral(
          `Latest quarter landed near the estimate ($${actual} vs. $${estimate} expected)`,
          1,
        ),
      );
    }
  }

  const yearAgo = tracked[4];
  if (
    yearAgo &&
    Number.isFinite(latest.revenueActual) &&
    Number.isFinite(yearAgo.revenueActual) &&
    yearAgo.revenueActual !== 0
  ) {
    const revYoY =
      ((latest.revenueActual - yearAgo.revenueActual) /
        Math.abs(yearAgo.revenueActual)) *
      100;
    metrics.earningsRevenueGrowthYoY = revYoY;
    if (revYoY > 10) {
      findings.push(
        bull(
          `Revenue from the latest report grew ${revYoY.toFixed(0)}% vs. the same quarter last year`,
          1,
        ),
      );
    } else if (revYoY < -5) {
      findings.push(
        bear(
          `Revenue from the latest report shrank ${Math.abs(revYoY).toFixed(0)}% vs. the same quarter last year`,
          1,
        ),
      );
    }
  }

  if (latest.reportedDate) {
    const daysSince =
      (Date.now() - new Date(latest.reportedDate).getTime()) /
      (1000 * 60 * 60 * 24);
    metrics.daysSinceLastEarnings = daysSince;
    if (daysSince <= FRESH_EARNINGS_DAYS) {
      findings.push(
        neutral(
          `Fresh earnings report — reported ${Math.round(daysSince)} day${Math.round(daysSince) === 1 ? "" : "s"} ago`,
          1,
        ),
      );
    }
  }

  return { metrics, findings, components, latest, tracked };
}

function avg(nums) {
  const valid = nums.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

// ───────────────────────────── Data Scout ─────────────────────────────
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

// ─────────────────────────── Sentiment Analyst ───────────────────────────
export function runSentimentAnalyst({ news = [] }) {
  const result = analyzeNewsSentiment(news);
  const { score, counts, topPositive, topNegative } = result;
  const findings = [];
  const unscored = result.unscoredCount || 0;

  // FinBERT polarity is decisive; map -1..+1 → 0..100 over a ±0.7 band.
  const sentimentScore =
    counts.total > 0 ? scaleClamp(score, -0.7, 0.7, 0, 100) : null;

  if (counts.total === 0) {
    findings.push(
      neutral(
        unscored > 0
          ? `${unscored} saved article${unscored === 1 ? "" : "s"} — analyze them to read the mood`
          : "No saved news articles yet",
        1,
      ),
    );
  } else {
    findings.push(
      neutral(
        `Read ${counts.total} recent article${counts.total === 1 ? "" : "s"} — ${counts.positive} upbeat, ${counts.negative} negative, ${counts.neutral} neutral`,
        1,
      ),
    );
    const enriched = result.enrichedCount || 0;
    if (enriched > 0)
      findings.push(
        neutral(
          `${enriched} of ${counts.total} read in full, not just the headline`,
          1,
        ),
      );
    if (unscored > 0)
      findings.push(
        neutral(
          `${unscored} more saved article${unscored === 1 ? "" : "s"} not read yet`,
          1,
        ),
      );
    if (result.duplicatesRemoved > 0)
      findings.push(
        neutral(
          `Skipped ${result.duplicatesRemoved} repeat cop${result.duplicatesRemoved === 1 ? "y" : "ies"} of the same story`,
          1,
        ),
      );
    if (result.dominantEvent)
      findings.push(
        neutral(`Most stories are about: ${result.dominantEvent}`, 1),
      );
    if (topPositive)
      findings.push(
        bull(`Most upbeat story: "${truncate(topPositive.title)}"`, 1),
      );
    if (topNegative)
      findings.push(
        bear(`Most negative story: "${truncate(topNegative.title)}"`, 1),
      );
    if (counts.total < 3)
      findings.push(
        neutral("Only a few articles, so this read is less reliable", 1),
      );
  }

  return {
    key: "sentiment",
    name: "Sentiment Analyst",
    role: "What the news is saying",
    score: sentimentScore,
    stance:
      sentimentScore == null ? "No data" : stanceFromScore(sentimentScore),
    summary:
      sentimentScore == null
        ? "Analyze the news to gauge the overall mood."
        : `The news mood is ${labelScore(sentimentScore)} (${sentimentScore.toFixed(0)}/100) across ${counts.total} recent article${counts.total === 1 ? "" : "s"}.`,
    findings,
    raw: result,
  };
}

// ───────────────────────────── The Bear ─────────────────────────────
// Hard-wired to argue the downside. It collects every bearish data point the
// other agents surfaced and grades how strong the case against buying is.
export function runBear({ dataScout, sentiment, pillarScores }) {
  const bearFindings = [
    ...dataScout.findings.filter((f) => f.polarity === "bear"),
    ...sentiment.findings.filter((f) => f.polarity === "bear"),
  ];

  // Bear strength rises as the (bullish) pillar scores fall and as the count
  // of severe negatives grows.
  const meanScore = avg(Object.values(pillarScores).filter(Number.isFinite));
  const severe = bearFindings.filter((f) => f.weight >= 2).length;
  const bearStrength = clamp(
    (Number.isFinite(meanScore) ? 100 - meanScore : 50) + severe * 6,
    0,
    100,
  );

  const summary = bearFindings.length
    ? `Found ${bearFindings.length} warning sign${bearFindings.length > 1 ? "s" : ""}; the case against buying is ${bearStrength.toFixed(0)}/100.`
    : "Couldn't find real warning signs — little reason for concern here.";

  return {
    key: "bear",
    name: "The Bear",
    role: "The pessimist: what could go wrong",
    score: bearStrength,
    scoreIsRisk: true,
    stance:
      bearStrength >= 60
        ? "Caution"
        : bearStrength >= 40
          ? "Watchful"
          : "Not worried",
    summary,
    findings: bearFindings.length
      ? bearFindings
      : [neutral("No real warning signs found", 1)],
  };
}

// ────────────────────────── Devil's Advocate ──────────────────────────
// Critiques the bull & bear cases, hunting for contradictions and blind spots.
// It doesn't pick a side; it lowers conviction where the evidence conflicts.
export function runDevilsAdvocate({ dataScout, sentiment, candles = [] }) {
  const caveats = [];
  const m = dataScout.metrics;
  const closes = toCloses(candles);

  const uptrend = Number.isFinite(m.sma50) && m.price > m.sma50;
  const overbought = Number.isFinite(m.rsi14) && m.rsi14 >= 70;
  const techStrong =
    Number.isFinite(dataScout.technicalScore) && dataScout.technicalScore >= 60;
  const fundWeak =
    Number.isFinite(dataScout.fundamentalScore) &&
    dataScout.fundamentalScore < 45;
  const sentScore = sentiment.score;
  const sentPositive = Number.isFinite(sentScore) && sentScore >= 58;
  const sentNegative = Number.isFinite(sentScore) && sentScore <= 42;

  let penalty = 0;
  const flag = (text, p) => {
    caveats.push(text);
    penalty += p;
  };

  if (uptrend && overbought)
    flag(
      "The trend is up, but the stock has run up fast — buyers may be chasing it.",
      8,
    );
  if (techStrong && fundWeak)
    flag(
      "The rising price isn't backed by the company's finances — the move could be fragile.",
      10,
    );
  if (sentPositive && Number.isFinite(m.sma50) && m.price < m.sma50)
    flag(
      "The news is upbeat, but the price is still falling — the good story isn't showing up in the stock yet.",
      8,
    );
  if (sentNegative && uptrend)
    flag(
      "The price is rising even though the news is negative — that can reverse if reality catches up.",
      6,
    );
  if (dataScout.fundamentalScore == null)
    flag(
      "No company financials are saved — we can't judge whether it's fairly priced.",
      6,
    );
  if (closes.length < 200)
    flag(
      "Less than a year of price history — the long-term trend is unknown.",
      6,
    );
  if (sentiment.raw && sentiment.raw.counts.total < 3)
    flag("The news read is based on very few articles — easily skewed.", 5);
  if (Number.isFinite(m.volatility) && m.volatility > 55)
    flag(
      "The price swings a lot, which makes it harder and riskier to trade.",
      5,
    );

  const confidencePenalty = clamp(penalty, 0, 45);

  return {
    key: "devil",
    name: "Devil's Advocate",
    role: "The skeptic: mixed signals & blind spots",
    confidencePenalty,
    stance:
      caveats.length >= 3
        ? "Many concerns"
        : caveats.length
          ? "A few concerns"
          : "No concerns",
    summary: caveats.length
      ? `Raised ${caveats.length} concern${caveats.length > 1 ? "s" : ""} that lower our confidence by ${confidencePenalty.toFixed(0)} points.`
      : "Found no major conflicts between the signals.",
    findings: caveats.length
      ? caveats.map((c) => neutral(c, 1))
      : [neutral("The signals agree with each other", 1)],
  };
}

// ───────────────────────── Portfolio Manager ─────────────────────────
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

// ───────────────────────────── helpers ─────────────────────────────
function stanceFromScore(score) {
  if (!Number.isFinite(score)) return "No data";
  if (score >= 64) return "Positive";
  if (score >= 40) return "Neutral";
  return "Negative";
}

function labelScore(score) {
  if (!Number.isFinite(score)) return "unavailable";
  if (score >= 70) return "strong";
  if (score >= 55) return "good";
  if (score >= 45) return "mixed";
  if (score >= 30) return "weak";
  return "poor";
}

function truncate(text = "", max = 80) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
