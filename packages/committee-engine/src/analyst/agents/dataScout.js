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
  clamp,
  volumeTrend,
} from "../indicators";
import { analyzeEarningsHistory } from "./earningsHistory";
import { analyzeLongTermLens } from "./longTermLens";
import { sectorValuationRead } from "../../sectorBenchmarks";
import {
  avg,
  bear,
  bull,
  findYearAgoRow,
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
  analysis = null,
  nextEarningsDate = null,
  nextEarningsDateIsEstimate = false,
  sector = null,
}) {
  const closes = toCloses(candles);
  const findings = [];
  const metrics = {};
  if (sector) metrics.sector = sector;

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

    // Trend. The 200-day average's own direction distinguishes a pullback in
    // a healthy uptrend from a confirmed, still-falling downtrend — the
    // distinction a position trader actually acts on.
    const sma200Prev =
      closes.length >= 220 ? sma(closes.slice(0, -20), 200) : null;
    const sma200Rising =
      sma200 != null && sma200Prev != null && sma200 > sma200Prev;
    const sma200Falling =
      sma200 != null && sma200Prev != null && sma200 < sma200Prev;

    let trendScore;
    if (sma50 != null && sma200 != null) {
      if (price > sma50 && sma50 > sma200) {
        trendScore = sma200Rising ? 88 : 82;
        findings.push(
          bull(
            "Price is above both its 50-day and 200-day average, with the 50-day on top — a steady uptrend",
            2,
          ),
        );
      } else if (price > sma50) {
        trendScore = 58;
        findings.push(
          neutral(
            "Above its 50-day average price but still below the 200-day — looks like it's recovering",
            1,
          ),
        );
      } else if (price > sma200) {
        trendScore = 40;
        findings.push(
          bear(
            "Has dipped below its 50-day average price, though the longer trend is still up",
            1,
          ),
        );
      } else if (sma50 > sma200) {
        trendScore = 28;
        findings.push(
          bear(
            "Price has fallen below both its 50-day and 200-day averages — the uptrend is breaking down",
            2,
          ),
        );
      } else {
        trendScore = sma200Falling ? 10 : 15;
        findings.push(
          bear(
            sma200Falling
              ? "Price is below both averages and the long-term trend itself is falling — a confirmed downtrend"
              : "Price is below both its 50-day and 200-day average — a downtrend",
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
    metrics.sma200Rising = sma200Prev != null ? sma200Rising : null;

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

    // RSI, read in the context of the trend. In an uptrend, a dip is a
    // buying opportunity; in a downtrend, "oversold" is not a buy signal —
    // stocks in downtrends can stay oversold for months, and bounces there
    // tend to fade. Treating oversold as bullish everywhere was a bias that
    // kept falling stocks scored near neutral.
    const inUptrend =
      sma200 != null ? price > sma200 : sma50 != null ? price > sma50 : null;
    let rsiScore = null;
    if (Number.isFinite(rsi14)) {
      if (inUptrend === false) {
        if (rsi14 >= 60) {
          rsiScore = 40;
          findings.push(
            bear(
              "Bounced hard within a downtrend — rallies like this often fade before the trend turns",
              1,
            ),
          );
        } else if (rsi14 >= 45) {
          rsiScore = 42;
        } else if (rsi14 >= 30) {
          rsiScore = 35;
        } else {
          rsiScore = 30;
          findings.push(
            bear(
              "Falling hard and oversold — in a downtrend that's a warning, not a bargain",
              1,
            ),
          );
        }
      } else if (inUptrend === null) {
        // Not enough history to know the trend — don't let RSI lean either
        // way beyond a mild nudge.
        rsiScore = rsi14 >= 70 ? 45 : rsi14 < 30 ? 50 : 55;
      } else if (rsi14 >= 70) {
        rsiScore = 40;
        findings.push(
          bear(
            "Has risen quickly and looks overbought — a pullback wouldn't be surprising",
            1,
          ),
        );
      } else if (rsi14 >= 55) {
        rsiScore = 68;
      } else if (rsi14 >= 45) {
        rsiScore = 58;
      } else if (rsi14 >= 30) {
        rsiScore = 55;
      } else {
        rsiScore = 50;
        findings.push(
          neutral(
            "Oversold within a longer-term uptrend — often where patient buyers step in",
            1,
          ),
        );
      }
    }

    // Range position. Full width matters: near the 52-week low must be able
    // to score low, or beaten-down stocks never register as weak.
    const rangeScore = Number.isFinite(rangePos)
      ? scaleClamp(rangePos, 5, 95, 15, 85)
      : null;
    if (Number.isFinite(rangePos)) {
      if (rangePos >= 85)
        findings.push(bull("Near its highest price of the past year", 1));
      else if (rangePos <= 15)
        findings.push(bear("Near its lowest price of the past year", 1));
    }

    // Volume confirmation: does volume back the price move? A rally on rising
    // volume is "confirmed"; one on fading volume lacks conviction, and a
    // decline on heavy volume signals active selling. Nudges the score (±,
    // capped) rather than dominating it.
    const vt = volumeTrend(candles, 10, 60);
    metrics.volumeTrend = vt;
    let volumeAdj = 0;
    if (Number.isFinite(vt) && Number.isFinite(mom20)) {
      const rising = mom20 > 2;
      const falling = mom20 < -2;
      const heavy = vt >= 1.15;
      const light = vt <= 0.85;
      if (rising && heavy) {
        volumeAdj = 6;
        findings.push(
          bull(
            "Rising on increasing volume — buyers are committed (a confirmed move)",
            1,
          ),
        );
      } else if (rising && light) {
        volumeAdj = -6;
        findings.push(
          bear("Rising but on fading volume — the rally lacks conviction", 1),
        );
      } else if (falling && heavy) {
        volumeAdj = -5;
        findings.push(
          bear("Falling on heavy volume — active selling pressure", 1),
        );
      }
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

    // Weighted blend: trend 0.35, momentum 0.30, rsi 0.15, range 0.20.
    const weighted = [
      [trendScore, 0.35],
      [momScore, 0.3],
      [rsiScore, 0.15],
      [rangeScore, 0.2],
    ].filter(([v]) => Number.isFinite(v));
    const wsum = weighted.reduce((s, [, w]) => s + w, 0);
    technicalScore = wsum
      ? weighted.reduce((s, [v, w]) => s + v * w, 0) / wsum
      : null;

    // Apply the volume-confirmation nudge to the blended technical score.
    if (Number.isFinite(technicalScore) && volumeAdj !== 0) {
      technicalScore = clamp(technicalScore + volumeAdj, 0, 100);
    }
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
    const yearAgo = findYearAgoRow(q, latest); // same quarter, prior year

    // Fresh earnings land as earnings-only rows (revenue but usually no net
    // income), which would silently blank the margin and profitability
    // checks right after a report — the moment they matter most. Fall back
    // to the newest row with full income-statement data for those checks.
    const latestIncome =
      q.find(
        (r) =>
          Number.isFinite(r.netIncome) && Number.isFinite(r.totalRevenue),
      ) ?? latest;
    const incomeYearAgo =
      latestIncome === latest ? yearAgo : findYearAgoRow(q, latestIncome);

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
      components.push(scaleClamp(revG, -10, 30, 5, 95));
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
    if (
      incomeYearAgo &&
      Number.isFinite(latestIncome.netIncome) &&
      incomeYearAgo.netIncome
    ) {
      const niG =
        ((latestIncome.netIncome - incomeYearAgo.netIncome) /
          Math.abs(incomeYearAgo.netIncome)) *
        100;
      metrics.netIncomeGrowthYoY = niG;
      components.push(scaleClamp(niG, -25, 40, 5, 95));
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
    if (Number.isFinite(latestIncome.netIncome)) {
      if (latestIncome.netIncome <= 0) {
        components.push(20);
        findings.push(bear("Lost money in the latest quarter", 2));
      }
    }

    // Net margin
    if (Number.isFinite(latestIncome.netIncome) && latestIncome.totalRevenue) {
      const margin = (latestIncome.netIncome / latestIncome.totalRevenue) * 100;
      metrics.netMargin = margin;
      components.push(scaleClamp(margin, -5, 25, 10, 90));
      if (margin > 15)
        findings.push(
          bull(
            `Keeps ${margin.toFixed(0)} cents of every sales dollar as profit (healthy)`,
            1,
          ),
        );
      else if (margin < 0)
        findings.push(bear("Spends more than it earns on each sale", 1));

      // Margin trend: profitability quietly eroding is one of the earliest
      // signs a business is deteriorating, before revenue growth rolls over.
      if (
        Number.isFinite(incomeYearAgo?.netIncome) &&
        incomeYearAgo?.totalRevenue
      ) {
        const marginThen =
          (incomeYearAgo.netIncome / incomeYearAgo.totalRevenue) * 100;
        const marginChange = margin - marginThen;
        metrics.netMarginChange = marginChange;
        if (marginChange <= -3) {
          components.push(25);
          findings.push(
            bear(
              `Profitability is slipping — keeps ${Math.abs(marginChange).toFixed(0)} cents less of each sales dollar than a year ago`,
              2,
            ),
          );
        } else if (marginChange >= 3) {
          components.push(80);
          findings.push(
            bull(
              `Profitability is improving — keeps ${marginChange.toFixed(0)} cents more of each sales dollar than a year ago`,
              1,
            ),
          );
        }
      }
    }

    // ---- Financial strength: cash flow & balance sheet ----
    // TTM = the latest four quarters that report the field. Merged
    // earnings-only rows lack these fields, so filter before slicing.
    const ttmSum = (field) => {
      const rows = q.filter((r) => Number.isFinite(r[field])).slice(0, 4);
      if (rows.length < 4) return null;
      return rows.reduce((s, r) => s + r[field], 0);
    };
    // Ratios must compare the SAME four quarters — summing each field over
    // its own latest-4 window can silently mix quarters when one statement
    // lags the other.
    const ttmPaired = (fieldA, fieldB) => {
      const rows = q
        .filter(
          (r) => Number.isFinite(r[fieldA]) && Number.isFinite(r[fieldB]),
        )
        .slice(0, 4);
      if (rows.length < 4) return null;
      return [
        rows.reduce((s, r) => s + r[fieldA], 0),
        rows.reduce((s, r) => s + r[fieldB], 0),
      ];
    };
    const fcfTTM = ttmSum("freeCashFlow");
    const netIncomeTTM = ttmSum("netIncome");
    metrics.fcfTTM = fcfTTM;

    // Free-cash-flow margin: how much of each sales dollar becomes cash the
    // company can actually spend.
    const fcfVsRevenue = ttmPaired("freeCashFlow", "totalRevenue");
    if (fcfVsRevenue && fcfVsRevenue[1] > 0) {
      const fcfMargin = (fcfVsRevenue[0] / fcfVsRevenue[1]) * 100;
      metrics.fcfMargin = fcfMargin;
      components.push(scaleClamp(fcfMargin, -5, 20, 5, 90));
      if (fcfMargin > 15)
        findings.push(
          bull(
            `Turns ${fcfMargin.toFixed(0)} cents of every sales dollar into spendable cash (excellent)`,
            1,
          ),
        );
      else if (fcfMargin < 0)
        findings.push(
          bear("Burning cash — spends more than the business brings in", 2),
        );
    }

    // Earnings quality: profits that don't turn into cash are a warning sign.
    const fcfVsIncome = ttmPaired("freeCashFlow", "netIncome");
    if (fcfVsIncome) {
      const [fcfP, niP] = fcfVsIncome;
      if (niP > 0 && fcfP < 0) {
        components.push(10);
        findings.push(
          bear(
            "Claims a profit but actually loses cash — the worst kind of earnings",
            2,
          ),
        );
      } else if (niP > 0 && fcfP < 0.5 * niP) {
        components.push(25);
        findings.push(
          bear(
            "Reported profits aren't turning into real cash — a classic warning sign",
            2,
          ),
        );
      } else if (niP > 0 && fcfP > niP * 1.1) {
        findings.push(
          bull(
            "Generates more cash than its reported profit — high-quality earnings",
            1,
          ),
        );
      }
    }

    // Balance sheet: debt load and return on equity from the latest quarter
    // that reports them.
    const bsRow = q.find(
      (r) =>
        Number.isFinite(r.totalDebt) && Number.isFinite(r.stockholdersEquity),
    );
    if (bsRow) {
      const equity = bsRow.stockholdersEquity;
      const cash =
        bsRow.cashCashEquivalentsAndShortTermInvestments ??
        bsRow.cashAndCashEquivalents;
      if (equity <= 0) {
        components.push(15);
        findings.push(
          bear(
            "Owes more than the whole company is worth on paper (negative equity)",
            2,
          ),
        );
      } else {
        const debtToEquity = bsRow.totalDebt / equity;
        metrics.debtToEquity = debtToEquity;
        components.push(scaleClamp(debtToEquity, 2.5, 0, 10, 85));
        if (Number.isFinite(cash) && cash > bsRow.totalDebt) {
          metrics.netCash = true;
          findings.push(
            bull("Has more cash than debt — a fortress balance sheet", 1),
          );
        } else if (debtToEquity > 2) {
          findings.push(
            bear(
              `Carries $${debtToEquity.toFixed(1)} of debt for every $1 shareholders own — a heavy load`,
              1,
            ),
          );
        }

        // ROE is only meaningful when it isn't manufactured by leverage —
        // dividing by a sliver of equity makes any return look heroic, so
        // skip the component for heavily indebted companies.
        if (Number.isFinite(netIncomeTTM) && debtToEquity <= 2) {
          const roe = (netIncomeTTM / equity) * 100;
          metrics.roe = roe;
          components.push(scaleClamp(roe, 0, 25, 15, 90));
          if (roe > 20)
            findings.push(
              bull(
                `Earns ${roe.toFixed(0)} cents a year on every dollar shareholders have in the business — a sign of a high-quality company`,
                1,
              ),
            );
          else if (roe > 0 && roe < 5)
            findings.push(
              bear("Earns very little on the money invested in it", 1),
            );
        }
      }
    } else if (Number.isFinite(latest.totalRevenue)) {
      findings.push(
        neutral(
          "No cash-flow or debt data saved yet — refresh this symbol to pull it",
          1,
        ),
      );
    }

    // Trailing P/E
    const eps = ttmEps(q);
    metrics.ttmEps = eps;
    if (Number.isFinite(eps) && Number.isFinite(metrics.price)) {
      if (eps > 0) {
        const pe = metrics.price / eps;
        metrics.trailingPE = pe;

        // Growth-adjusted valuation (PEG): a high P/E backed by fast earnings
        // growth isn't truly "expensive". Prefer earnings growth, fall back to
        // revenue growth, and only when growth is solidly positive (>5%);
        // otherwise judge on raw P/E.
        const growth = [
          metrics.netIncomeGrowthYoY,
          metrics.revenueGrowthYoY,
        ].find((g) => Number.isFinite(g) && g > 5);

        // The own-valuation score (PEG-based or raw-P/E-based).
        let ownPeScore;
        if (Number.isFinite(growth)) {
          const peg = pe / growth;
          metrics.peg = peg;
          ownPeScore = scaleClamp(peg, 2.5, 0.5, 20, 90); // lower PEG → higher
          if (peg < 1)
            findings.push(
              bull(
                `Reasonably priced for its growth (PEG ${peg.toFixed(1)})`,
                1,
              ),
            );
          else if (peg > 2.5)
            findings.push(
              bear(
                `Expensive even accounting for its growth (PEG ${peg.toFixed(1)})`,
                1,
              ),
            );
        } else {
          ownPeScore = scaleClamp(pe, 60, 10, 20, 80); // lower P/E → higher
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
        }

        // Peer context: how the P/E compares with what's typical for its
        // sector. Averaged INTO the own-valuation score (not a second
        // component) so valuation isn't double-counted. Unknown sector → no
        // effect at all.
        const sectorRead = sectorValuationRead(pe, sector);
        if (sectorRead) {
          metrics.sectorValuationVerdict = sectorRead.verdict;
          components.push(avg([ownPeScore, sectorRead.score]));
          if (sectorRead.verdict === "cheap")
            findings.push(
              bull(
                `Cheap for its industry — about $${pe.toFixed(0)} per $1 of profit, while ${sector} companies typically run $${sectorRead.low.toFixed(0)}–${sectorRead.high.toFixed(0)}`,
                1,
              ),
            );
          else if (sectorRead.verdict === "rich")
            findings.push(
              bear(
                `Expensive even for ${sector} — about $${pe.toFixed(0)} per $1 of profit vs. a typical $${sectorRead.low.toFixed(0)}–${sectorRead.high.toFixed(0)}. It needs to keep growing fast to justify that`,
                1,
              ),
            );
        } else {
          components.push(ownPeScore);
        }
      } else {
        metrics.trailingPE = null;
        // No profits to value it on — fall back to price-to-free-cash-flow
        // when the company generates cash and we know the share count. The
        // newest row may be earnings-only (no share count) — search back.
        const sharesRow = q.find((r) =>
          [r.dilutedAverageShares, r.basicAverageShares].some(
            (s) => Number.isFinite(s) && s > 0,
          ),
        );
        const shares = sharesRow
          ? [sharesRow.dilutedAverageShares, sharesRow.basicAverageShares].find(
              (s) => Number.isFinite(s) && s > 0,
            )
          : null;
        if (Number.isFinite(fcfTTM) && fcfTTM > 0 && shares) {
          const pfcf = metrics.price / (fcfTTM / shares);
          metrics.priceToFcf = pfcf;
          components.push(scaleClamp(pfcf, 60, 8, 25, 80));
          findings.push(
            neutral(
              `Not profitable on paper, but generates real cash — priced at $${pfcf.toFixed(0)} per $1 of yearly cash flow`,
              1,
            ),
          );
        } else {
          components.push(25);
          findings.push(
            bear(
              "Hasn't been profitable over the past year, so it's hard to value",
              1,
            ),
          );
        }
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
      components.push(scaleClamp(revG, -10, 25, 10, 90));
    }
  }

  // ---- Expectations (forward estimates & revisions) ----
  // Everything above is trailing; markets price the future. Analyst estimate
  // *revisions* — the direction forecasts are moving — are among the
  // better-documented public signals. Targets and buy/sell ratings are shown
  // for context only (they skew optimistic) and never scored.
  if (analysis) {
    const up = analysis.revisionsUp30d;
    const down = analysis.revisionsDown30d;
    if (Number.isFinite(up) && Number.isFinite(down) && up + down >= 1) {
      metrics.revisionsUp30d = up;
      metrics.revisionsDown30d = down;
      const netShare = (up - down) / Math.max(up + down, 1);
      components.push(scaleClamp(netShare, -1, 1, 15, 90));
      if (netShare >= 0.5)
        findings.push(
          bull(
            `Analysts have been raising their profit forecasts (${up} up vs. ${down} down this month) — expectations are improving`,
            1,
          ),
        );
      else if (netShare <= -0.5)
        findings.push(
          bear(
            `Analysts have been cutting their profit forecasts (${down} down vs. ${up} up this month)`,
            1,
          ),
        );
    }

    // Forecast drift: where has the consensus number itself moved?
    if (
      Number.isFinite(analysis.forwardEps) &&
      Number.isFinite(analysis.eps30dAgo) &&
      Math.abs(analysis.eps30dAgo) > 0.01
    ) {
      const drift =
        ((analysis.forwardEps - analysis.eps30dAgo) /
          Math.abs(analysis.eps30dAgo)) *
        100;
      metrics.forwardEpsDrift = drift;
      if (drift < -5)
        findings.push(
          bear(
            `Analysts keep cutting next year's profit forecast (down ${Math.abs(drift).toFixed(1)}% in a month) — a bad sign that tends to continue`,
            2,
          ),
        );
    }

    // Forward vs. trailing valuation. Only scored when trailing P/E couldn't
    // be, to avoid double-counting valuation.
    if (Number.isFinite(analysis.forwardPE) && analysis.forwardPE > 0) {
      metrics.forwardPE = analysis.forwardPE;
      if (metrics.trailingPE == null) {
        components.push(scaleClamp(analysis.forwardPE, 50, 8, 20, 85));
      }
      if (
        Number.isFinite(metrics.trailingPE) &&
        analysis.forwardPE < metrics.trailingPE * 0.8
      ) {
        findings.push(
          bull(
            `Priced more reasonably against next year's expected profits (forward P/E ${analysis.forwardPE.toFixed(0)} vs. ${metrics.trailingPE.toFixed(0)} trailing)`,
            1,
          ),
        );
      } else if (
        Number.isFinite(metrics.trailingPE) &&
        analysis.forwardPE > metrics.trailingPE * 1.1
      ) {
        findings.push(
          bear(
            "Analysts expect profits to shrink next year (forward P/E is higher than trailing)",
            1,
          ),
        );
      }
    }

    // Context only — never scored.
    if (Number.isFinite(analysis.targetMeanPrice) && Number.isFinite(metrics.price)) {
      findings.push(
        neutral(
          `Analyst average target: $${analysis.targetMeanPrice.toFixed(0)} (take with salt — targets skew optimistic)`,
          1,
        ),
      );
    }
  }

  // ---- Earnings (beat/miss history) ----
  const earningsAnalysis = analyzeEarningsHistory(earnings);
  if (earningsAnalysis) {
    Object.assign(metrics, earningsAnalysis.metrics);
    findings.push(...earningsAnalysis.findings);
    components.push(...earningsAnalysis.components);
  }

  // ---- Long-term lens (multi-year consistency, buybacks, dividends) ----
  const longTerm = analyzeLongTermLens(quarterly, annual, metrics.price);
  if (longTerm) {
    Object.assign(metrics, longTerm.metrics);
    findings.push(...longTerm.findings);
    components.push(...longTerm.components);
  }

  // ---- Upcoming earnings heads-up (non-scored) ----
  // A scheduled quarterly report is when prices and verdicts swing most. Never
  // touches the score — it's a plain calendar warning so a beginner doesn't
  // buy blind into a binary event. `metrics.nextEarningsDate` is also read by
  // the entry plan (to time the middle tranche).
  if (nextEarningsDate) {
    const when = new Date(nextEarningsDate).getTime();
    if (Number.isFinite(when)) {
      metrics.nextEarningsDate = nextEarningsDate;
      metrics.nextEarningsDateIsEstimate = Boolean(nextEarningsDateIsEstimate);
      const days = Math.round((when - Date.now()) / (24 * 60 * 60 * 1000));
      if (days >= 0 && days <= 14) {
        const label = new Date(nextEarningsDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        const approx = nextEarningsDateIsEstimate ? "around " : "";
        findings.push(
          neutral(
            `Earnings report expected ${approx}${label} — prices often jump or drop on report day, and this verdict can change after it.`,
            1,
          ),
        );
      }
    }
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
