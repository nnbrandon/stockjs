import { atr, clamp } from "../indicators";
import { COMMITTEE_ENGINE_VERSION } from "../version";
import { bear, bull, neutral, sortByDateDesc } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

const MOMENTUM_LOOKBACK_DAYS = 21;
const MOMENTUM_THRESHOLD = 12; // score points
const MOMENTUM_NUDGE = 4;

// "Quality on sale": a business whose finances still score well while the
// stock trades far below its 52-week high. For a long-term investor that
// pattern is often a discount, not decay — the weak price trend drags the
// composite down exactly when the entry gets attractive.
const DISCOUNT_MIN_FUNDAMENTAL = 62; // finances must genuinely be strong
const DISCOUNT_MIN_OFF_HIGH_PCT = 25; // meaningfully below the 52w high
const DISCOUNT_MIN_SENTIMENT = 40; // news can be mixed, not catastrophic
const DISCOUNT_MAX_TECHNICAL = 55; // only when the trend is what's dragging
const DISCOUNT_NUDGE = 5;

// Fire-sale confidence tuning.
const FIRESALE_STALE_WEEKS = 13; // a full quarter still flagged, no recovery…
const FIRESALE_STALE_MIN_DAYS = FIRESALE_STALE_WEEKS * 7;
const BENCH_MARKET_WIDE_OFF_HIGH = 15; // benchmark itself this far down = market-wide
const BENCH_NEAR_HIGH_OFF = 8; // benchmark within this of its high = idiosyncratic drop

const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// Distance below the trailing 52-week high, as a positive percent. Shared by
// the stock's discount check and the benchmark's own drawdown (#5). Thin
// history can't establish a "high" to be discounted from.
function offHighPct(candles = []) {
  const slice = candles.slice(-252);
  if (slice.length < 120) return null;
  const highs = slice.map((c) => Number(c.high)).filter(Number.isFinite);
  const price = Number(slice.at(-1)?.close);
  if (!highs.length || !Number.isFinite(price)) return null;
  const high = Math.max(...highs);
  if (!(high > 0)) return null;
  return ((high - price) / high) * 100;
}

// (#1) The stock's trailing P/E at each past quarter, using the TTM EPS known
// as of that quarter and the closing price nearest that date. Lets us ask
// "cheap versus its OWN history", not only "down from its high" — a stock can
// fall 30% and still be dear if it was wildly overvalued at the peak. Bounded
// to quarters whose date falls inside the candle window (older ones have no
// price to match), so with a short candle history it simply returns null and
// the caller falls back to a growth-relative read.
export function historicalPESeries(candles = [], quarterly = []) {
  const times = candles
    .map((c) => new Date(c.date).getTime())
    .filter(Number.isFinite);
  if (!times.length) return null;
  const minT = Math.min(...times);
  const maxT = Math.max(...times);

  const epsOf = (r) => Number(r.dilutedEPS ?? r.epsActual);
  const rows = sortByDateDesc(quarterly).filter((r) =>
    Number.isFinite(epsOf(r)),
  );
  if (rows.length < 4) return null;

  const closeNear = (dateStr) => {
    const target = new Date(dateStr).getTime();
    if (
      !Number.isFinite(target) ||
      target < minT - 10 * DAY_MS ||
      target > maxT + 10 * DAY_MS
    )
      return null;
    let best = null;
    let bestDiff = Infinity;
    for (const c of candles) {
      const t = new Date(c.date).getTime();
      if (!Number.isFinite(t)) continue;
      const diff = Math.abs(t - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = Number(c.close);
      }
    }
    return bestDiff <= 20 * DAY_MS && Number.isFinite(best) ? best : null;
  };

  const series = [];
  for (let j = 0; j + 4 <= rows.length; j++) {
    const ttm = rows.slice(j, j + 4).reduce((s, r) => s + epsOf(r), 0);
    if (!(ttm > 0)) continue;
    const price = closeNear(rows[j].date);
    if (!Number.isFinite(price)) continue;
    series.push(price / ttm);
  }
  return series.length >= 3 ? series : null;
}

// (#1) Classify how the current valuation compares to what's normal for this
// stock. Prefers its own P/E history; falls back to growth-relative (PEG) or
// forward-vs-trailing when the candle window is too short for a real history.
// Returns null when there's nothing to judge on — the caller must not block a
// flag just because valuation is unknown.
function valuationRead(candles, quarterly, metrics) {
  const current = metrics.trailingPE;
  const series = historicalPESeries(candles, quarterly);
  if (series && Number.isFinite(current) && current > 0) {
    const typical = median(series);
    if (typical > 0) {
      const cheapPct = ((typical - current) / typical) * 100;
      return {
        basis: "own-history",
        current,
        typical,
        cheapPct,
        verdict: cheapPct >= 10 ? "cheap" : cheapPct <= -15 ? "rich" : "fair",
      };
    }
  }
  if (Number.isFinite(metrics.peg)) {
    return {
      basis: "growth",
      peg: metrics.peg,
      verdict:
        metrics.peg <= 1.2 ? "cheap" : metrics.peg >= 2.5 ? "rich" : "fair",
    };
  }
  if (
    Number.isFinite(metrics.forwardPE) &&
    Number.isFinite(current) &&
    current > 0
  ) {
    return {
      basis: "forward",
      forwardPE: metrics.forwardPE,
      trailingPE: current,
      verdict:
        metrics.forwardPE < current * 0.85
          ? "cheap"
          : metrics.forwardPE > current * 1.15
            ? "rich"
            : "fair",
    };
  }
  return null;
}

function valuationReason(v) {
  const cheap = v.verdict === "cheap";
  if (v.basis === "own-history")
    return cheap
      ? `Genuinely cheap, not just down — ${v.current.toFixed(0)}× earnings vs. its own typical ${v.typical.toFixed(0)}× (about ${Math.abs(v.cheapPct).toFixed(0)}% below usual).`
      : `Valued in line with its own history (${v.current.toFixed(0)}× earnings vs. a typical ${v.typical.toFixed(0)}×).`;
  if (v.basis === "growth")
    return cheap
      ? `Cheap for its growth (PEG ${v.peg.toFixed(1)}) — not just unwinding an overvaluation.`
      : `Fairly priced for its growth (PEG ${v.peg.toFixed(1)}) — not a bargain, not expensive.`;
  if (v.basis === "forward")
    return cheap
      ? `Cheaper on next year's expected profits (forward P/E ${v.forwardPE.toFixed(0)} vs. ${v.trailingPE.toFixed(0)} trailing).`
      : `Forward P/E ${v.forwardPE.toFixed(0)} vs. ${v.trailingPE.toFixed(0)} trailing — no strong valuation signal either way.`;
  return "Valuation looks reasonable.";
}

// (#2) Which way the business is heading, from the year-over-year figures the
// scout already computed. A cheap price on shrinking fundamentals is the
// classic value trap — this is what separates "on sale" from "on the way
// down". Seasonally aware (YoY, not sequential).
function fundamentalTrajectory(metrics) {
  const rev = metrics.revenueGrowthYoY;
  const ni = metrics.netIncomeGrowthYoY;
  const marginChange = metrics.netMarginChange;
  if (![rev, ni, marginChange].some(Number.isFinite))
    return { state: "unknown" };

  const shrinking = Number.isFinite(rev) && rev < 0;
  const marginEroding = Number.isFinite(marginChange) && marginChange <= -3;
  const profitFalling = Number.isFinite(ni) && ni <= -15;
  if (shrinking || marginEroding || profitFalling) {
    const bits = [];
    if (shrinking)
      bits.push(`revenue is down ${Math.abs(rev).toFixed(0)}% year over year`);
    if (marginEroding)
      bits.push(
        `margins are ${Math.abs(marginChange).toFixed(0)} points thinner than a year ago`,
      );
    if (profitFalling && !shrinking)
      bits.push(`profit is down ${Math.abs(ni).toFixed(0)}% year over year`);
    return { state: "deteriorating", note: bits.join(", ") };
  }

  const growing = Number.isFinite(rev) && rev > 5;
  const marginOk = !Number.isFinite(marginChange) || marginChange >= 0;
  const profitOk = !Number.isFinite(ni) || ni >= 0;
  if (growing && marginOk && profitOk) {
    return {
      state: "improving",
      note: `revenue up ${rev.toFixed(0)}% year over year with steady or rising margins`,
    };
  }
  return { state: "stable" };
}

// (#3) The current unbroken run of prior days already flagged as a fire sale,
// trusting only same-engine-version rows. History is oldest → newest and does
// NOT yet include today's row. Returns how long the streak has run and how
// far off its high the stock was when it started, so the caller can tell a
// discount that's persisting from one that's finally narrowing.
export function fireSaleStreak(history) {
  if (!Array.isArray(history) || !history.length) return null;
  let start = null;
  let latestDay = null;
  for (let i = history.length - 1; i >= 0; i--) {
    const row = history[i];
    if (row.engineVersion !== COMMITTEE_ENGINE_VERSION || !row.fireSale) break;
    if (!latestDay) latestDay = row.day;
    start = row;
  }
  if (!start || !latestDay) return null;
  const days = Math.round(
    (new Date(latestDay).getTime() - new Date(start.day).getTime()) / DAY_MS,
  );
  return {
    days,
    startOffHighPct: Number.isFinite(start.fireSale?.offHighPct)
      ? start.fireSale.offHighPct
      : null,
  };
}

/**
 * Detect the discount setup. Deliberately conservative: it needs strong
 * fundamentals, a real markdown from the high, news that isn't screaming
 * "something broke", and a weak trend as the thing holding the score back.
 * A collapsing business fails the fundamental/sentiment gates — this is not
 * a falling-knife pass, and the exit line still applies.
 */
function discountCheck(candles = [], pillars, quarterly = [], metrics = {}) {
  const { technical, fundamental, sentiment } = pillars;
  if (!Number.isFinite(fundamental) || fundamental < DISCOUNT_MIN_FUNDAMENTAL)
    return null;
  if (!Number.isFinite(technical) || technical >= DISCOUNT_MAX_TECHNICAL)
    return null;
  if (Number.isFinite(sentiment) && sentiment < DISCOUNT_MIN_SENTIMENT)
    return null;

  // Distance below the 52-week high, from the same 252-candle window the
  // technical pillar uses.
  const off = offHighPct(candles);
  if (!Number.isFinite(off) || off < DISCOUNT_MIN_OFF_HIGH_PCT) return null;

  // (#1) Valuation gate: a stock down from its high but still richly valued
  // versus its own history/growth isn't "on sale" — it's a correction
  // unwinding an overvaluation. Only blocks on a positive "rich" reading;
  // unknown valuation never blocks. Own-history is primary; the sector read
  // only adds a gate when we have no own read at all (so a stock that's
  // expensive versus its peers can't sneak through as "on sale" unjudged).
  const valuation = valuationRead(candles, quarterly, metrics);
  if (valuation?.verdict === "rich") return null;
  if (!valuation && metrics.sectorValuationVerdict === "rich") return null;

  return { offHighPct: off, fundamental, valuation };
}

function discountFinding(discount) {
  return bull(
    `On sale, not broken — finances score ${discount.fundamental.toFixed(0)}/100 while the stock sits ${discount.offHighPct.toFixed(0)}% below its 52-week high with news holding up. (Discounts can keep discounting: the exit line still applies.)`,
    2,
  );
}

// Grades the fire-sale setup itself, separately from the verdict's own
// conviction: how far the finances clear the bar, whether news backs the
// "not broken" read, whether the price shows any sign of turning, and
// whether the markdown is so deep it might be telling us something. Returns
// confidence 0-100, a label on the same High/Moderate/Low scale the verdict
// uses, and the plain-English reasons/cautions behind the grade.
function buildFireSale(discount, pillars, metrics, ctx = {}) {
  const { valuation, trajectory, benchmark, streak } = ctx;
  const reasons = [];
  const cautions = [];
  let confidence = 50;

  // Financial strength (level).
  const fundMargin = discount.fundamental - DISCOUNT_MIN_FUNDAMENTAL;
  confidence += Math.min(fundMargin * 1.2, 25);
  reasons.push(
    `Finances score ${discount.fundamental.toFixed(0)}/100 — ${fundMargin >= 10 ? "comfortably" : "just"} above the ${DISCOUNT_MIN_FUNDAMENTAL} bar this flag requires.`,
  );
  reasons.push(
    `Sits ${discount.offHighPct.toFixed(0)}% below its 52-week high — a genuine markdown, not a routine dip.`,
  );

  // (#1) Valuation: cheap versus its own history/growth, not just off its high.
  if (valuation) {
    if (valuation.verdict === "cheap") {
      confidence += 10;
      reasons.push(valuationReason(valuation));
    } else if (valuation.verdict === "fair") {
      reasons.push(valuationReason(valuation));
    }
    // "rich" can't reach here — discountCheck rejects the flag outright.
  } else {
    confidence -= 5;
    cautions.push(
      "Couldn't confirm it's genuinely cheap (not enough valuation data) — down from its high isn't the same as a bargain.",
    );
  }

  // (#2) Fundamental trajectory: filters the classic value trap.
  if (trajectory?.state === "deteriorating") {
    confidence = Math.min(confidence, 29); // force a Low grade
    cautions.unshift(
      `The business is heading the wrong way (${trajectory.note}) — cheap plus shrinking is the classic value trap, so treat this flag with caution.`,
    );
  } else if (trajectory?.state === "improving") {
    confidence += 8;
    reasons.push(`The fundamentals are still improving — ${trajectory.note}.`);
  } else if (trajectory?.state === "unknown") {
    cautions.push(
      "Not enough quarters to tell whether the business is improving or slipping.",
    );
  }

  // News.
  const sentiment = pillars.sentiment;
  if (Number.isFinite(sentiment)) {
    if (sentiment >= 55) {
      confidence += 10;
      reasons.push(
        `News mood is holding up (${sentiment.toFixed(0)}/100) — the markdown doesn't look news-driven.`,
      );
    } else {
      confidence -= 5;
      cautions.push(
        `News is mixed (${sentiment.toFixed(0)}/100) — check whether there's a real story behind the drop.`,
      );
    }
  } else {
    confidence -= 10;
    cautions.push(
      "No scored news available — can't rule out a story behind the drop.",
    );
  }

  // Sign of a turn.
  const { price, sma50 } = metrics;
  if (Number.isFinite(price) && Number.isFinite(sma50)) {
    if (price > sma50) {
      confidence += 10;
      reasons.push(
        "Back above its 50-day average — an early sign the bounce may have started.",
      );
    } else {
      confidence -= 5;
      cautions.push(
        "Still below its 50-day average — no sign of a turn yet, so the discount could deepen first.",
      );
    }
  }

  // (#5) Market-relative: is this a company-specific discount, or just beta?
  if (Number.isFinite(benchmark)) {
    if (benchmark >= BENCH_MARKET_WIDE_OFF_HIGH) {
      confidence -= 8;
      cautions.push(
        `Much of the markdown is market-wide — the broad market is itself ${benchmark.toFixed(0)}% off its high.`,
      );
    } else if (benchmark <= BENCH_NEAR_HIGH_OFF) {
      confidence += 8;
      reasons.push(
        `The broad market is near its highs (${benchmark.toFixed(0)}% off) while this stock is ${discount.offHighPct.toFixed(0)}% down — the discount is specific to this stock.`,
      );
    }
  }

  // Deep-markdown caution.
  if (discount.offHighPct >= 50) {
    confidence -= 15;
    cautions.push(
      `A very deep markdown (${discount.offHighPct.toFixed(0)}% off the high) — sometimes the market sees a problem the numbers don't show yet.`,
    );
  }

  // (#3) Staleness: a flag that's persisted a long time without recovering.
  let weeksFlagged = null;
  if (
    streak &&
    Number.isFinite(streak.days) &&
    streak.days >= FIRESALE_STALE_MIN_DAYS
  ) {
    weeksFlagged = Math.round(streak.days / 7);
    const noRecovery =
      !Number.isFinite(streak.startOffHighPct) ||
      discount.offHighPct >= streak.startOffHighPct - 2;
    if (noRecovery) {
      confidence =
        Math.min(confidence, 55) -
        Math.min((streak.days - FIRESALE_STALE_MIN_DAYS) / 14, 15);
      cautions.push(
        `Flagged as a fire sale for about ${weeksFlagged} weeks without recovering — the longer a discount persists, the more likely the market sees something the numbers don't.`,
      );
    } else {
      reasons.push(
        `Flagged for about ${weeksFlagged} weeks and the discount is finally narrowing — the recovery may be underway.`,
      );
    }
  }

  confidence = clamp(confidence, 0, 100);
  const confidenceLabel =
    confidence >= 60 ? "High" : confidence >= 30 ? "Moderate" : "Low";
  // Deliberately a different vocabulary from the verdict's High/Moderate/Low
  // conviction — "FIRE SALE · High next to Low Confidence" read as a
  // contradiction. "Signal" grades the setup; "confidence" stays the verdict's.
  const signalLabel =
    confidence >= 60
      ? "Strong signal"
      : confidence >= 30
        ? "Mixed signal"
        : "Weak signal";

  return {
    offHighPct: discount.offHighPct,
    fundamental: discount.fundamental,
    confidence,
    confidenceLabel,
    signalLabel,
    valuationBasis: valuation?.basis ?? null,
    trajectory: trajectory?.state ?? null,
    weeksFlagged,
    reasons,
    cautions,
  };
}

function fireSaleFindings(fireSale) {
  return [
    bull(
      `Fire sale flagged (${fireSale.signalLabel.toLowerCase()}) — priced low on a healthy business, not a broken one. (Discounts can keep discounting: the exit line still applies.)`,
      2,
    ),
    ...fireSale.reasons.map((r) => bull(`Why: ${r}`, 1)),
    ...fireSale.cautions.map((c) => neutral(`Keep in mind: ${c}`, 1)),
  ];
}

// Compare today's raw composite with the committee's own stored score from
// ~3+ weeks ago. A sliding score is itself a signal — deterioration in the
// evidence, not just in the price. Only trusts snapshots from the same
// engine version; returns null (no-op) whenever history is thin.
function scoreMomentum(history, rawComposite) {
  if (!Array.isArray(history) || history.length < 2) return null;
  const valid = history.filter(
    (r) =>
      r.engineVersion === COMMITTEE_ENGINE_VERSION &&
      Number.isFinite(r.composite),
  );
  if (valid.length < 2) return null;

  const cutoff = Date.now() - MOMENTUM_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  // History is oldest → newest; take the newest row old enough to compare.
  const past = [...valid]
    .reverse()
    .find((r) => new Date(r.day).getTime() <= cutoff);
  if (!past) return null;

  const delta = rawComposite - past.composite;
  if (delta <= -MOMENTUM_THRESHOLD) return { nudge: -MOMENTUM_NUDGE, past };
  if (delta >= MOMENTUM_THRESHOLD) return { nudge: MOMENTUM_NUDGE, past };
  return null;
}

// Built after the nudge is applied so the finding quotes the same final
// composite the verdict banner shows.
function momentumFinding(momentum, finalComposite) {
  if (!momentum) return null;
  const from = momentum.past.composite.toFixed(0);
  const to = finalComposite.toFixed(0);
  return momentum.nudge < 0
    ? bear(
        `The committee's own score is sliding (${from} → ${to} since ${momentum.past.day}) — the picture is deteriorating`,
        1,
      )
    : bull(
        `The committee's own score is climbing (${from} → ${to} since ${momentum.past.day}) — the picture is improving`,
        1,
      );
}

const fmtPrice = (n) =>
  Number.isFinite(n)
    ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : null;

// How to ease in, by conviction: the fraction of the planned position to add
// now vs. later. Higher conviction → more up front; lower → hold more back.
// Long-term beginners do better averaging in than committing everything at a
// single price.
const TRANCHE_SPLIT = {
  High: [50, 25, 25],
  Moderate: [40, 30, 30],
  Low: [25, 25, 50],
};

function buildTranches(convictionLabel, nextEarningsDate) {
  const split = TRANCHE_SPLIT[convictionLabel] ?? TRANCHE_SPLIT.Moderate;
  let earningsSoon = false;
  let label = null;
  if (nextEarningsDate) {
    const days = Math.round(
      (new Date(nextEarningsDate).getTime() - Date.now()) / DAY_MS,
    );
    if (days >= 0 && days <= 21) {
      earningsSoon = true;
      label = new Date(nextEarningsDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  }
  return [
    { pct: split[0], when: "now" },
    {
      pct: split[1],
      when: earningsSoon ? `after the report on ${label}` : "in about a month",
    },
    {
      pct: split[2],
      when: earningsSoon
        ? "once it settles after the report"
        : "a month or two later",
    },
  ];
}

// 3-5-7 rule: ≤3% account risk per trade, ≤5% per position, ≤7% total exposure.
function buildEntryPlan(candles, metrics, convictionLabel) {
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
    // Ease-in schedule (fractions of the planned position) + the earnings
    // date, so the UI/email can show "buy a third now, the rest later".
    tranches: buildTranches(convictionLabel, metrics.nextEarningsDate ?? null),
    nextEarningsDate: metrics.nextEarningsDate ?? null,
    actionable: true,
  };
}

// How much of the position to let go. The tier sets the base (Reduce = trim,
// Sell = exit) and conviction scales it — a low-confidence sell shouldn't
// liquidate a whole position, and a high-confidence Reduce warrants a deeper
// trim than a shaky one.
function recommendedTrimPct(tier, conviction) {
  if (tier === "Sell") {
    if (conviction >= 60) return 100;
    if (conviction >= 30) return 75;
    return 50;
  }
  // Reduce
  if (conviction >= 60) return 50;
  if (conviction >= 30) return 33;
  return 25;
}

// Why-sell reasons, exit level, and what to do with the proceeds. A committee
// that says "sell" owes the holder both the reasons and a next step.
function buildExitPlan(metrics, bearAgent, pillars, tier, conviction) {
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
  const trimPct = recommendedTrimPct(tier, conviction);

  return {
    kind: "exit",
    reasons,
    reclaimPrice,
    tier,
    // Suggested fraction of the position to sell (percent). 100 = full exit.
    trimPct,
    fullExit: trimPct >= 100,
    reinvest: [
      "No rush to reinvest — cash is a position too. Wait for an idea that actually scores Buy here.",
      "To stay invested, move the freed-up money toward holdings this committee rates Buy.",
      "If nothing qualifies, a broad market index fund is the boring-but-sound default while you look.",
    ],
    actionable: true,
  };
}

function buildWatchPlan(metrics) {
  const { price, sma50, sma200 } = metrics;
  if (!Number.isFinite(price)) return null;
  const aboveLevel = Number.isFinite(sma50) && price < sma50 ? sma50 : null;
  const belowLevel = Number.isFinite(sma200)
    ? sma200
    : Number.isFinite(sma50)
      ? sma50
      : null;
  return {
    kind: "watch",
    upgradePrice: aboveLevel,
    downgradePrice:
      Number.isFinite(belowLevel) && belowLevel < price ? belowLevel : null,
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
    // Ease in rather than commit everything at one price.
    if (plan.tranches?.length === 3) {
      const [t0, t1, t2] = plan.tranches;
      out.push(
        neutral(
          `If buying, ease in: ~${t0.pct}% of your planned amount ${t0.when}, ${t1.pct}% ${t1.when}, ${t2.pct}% ${t2.when} — and keep the position under ~${plan.positionSizePct.toFixed(0)}% of your portfolio.`,
          1,
        ),
      );
    } else {
      out.push(
        neutral(
          `If buying: keep it to about ${plan.positionSizePct.toFixed(1)}% of your portfolio.`,
          1,
        ),
      );
    }
    out.push(
      neutral(
        `Treat ${fmtPrice(plan.stopPrice)} (${plan.stopDistancePct.toFixed(1)}% below) as the line where this thesis is wrong.`,
        1,
      ),
    );
    out.push(
      neutral(
        `Above that line, ignore day-to-day noise; ${fmtPrice(plan.targetPrice)} is a checkpoint to re-review the thesis, not an order to sell a winner.`,
        1,
      ),
    );
    out.push(
      neutral(
        "Below it, sell rather than average down — being wrong small keeps you in the game.",
        1,
      ),
    );
    return out;
  }

  if (action === "SELL") {
    out.push(
      bear(
        tier === "Reduce"
          ? "The evidence leans negative — if you hold this, trimming beats adding."
          : "The evidence is firmly negative — if you hold this, consider exiting rather than riding it down.",
        2,
      ),
    );
    if (Number.isFinite(plan.trimPct)) {
      out.push(
        neutral(
          plan.fullExit
            ? "How much: confidence is high enough to close the whole position rather than average down."
            : `How much: sell ~${plan.trimPct}% now and reassess the rest — sized to the committee's ${plan.trimPct >= 50 ? "firmer" : "lower"} confidence.`,
          1,
        ),
      );
    }
    for (const r of plan.reasons.slice(0, 4)) out.push(bear(`Why: ${r}`, 1));
    if (Number.isFinite(plan.reclaimPrice)) {
      out.push(
        neutral(
          `We'd revisit this call above its 50-day average (about ${fmtPrice(plan.reclaimPrice)}).`,
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
      "No edge either way right now — the committee wouldn't add new money or pull money out.",
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

// ── Two answers, one verdict ────────────────────────────────────────────────
// A single 0-100 score blends two questions a long-term investor should keep
// separate: "is this a business worth owning?" (which barely changes month to
// month) and "is now a decent time to add?" (which is all the month-to-month
// noise). Professionals answer them separately — a great company can be a bad
// buy today, and vice versa — so the verdict exposes both, in plain words.

function buildOwnItAnswer(fundamental) {
  if (!Number.isFinite(fundamental)) {
    return {
      score: null,
      label: "Not enough info",
      tone: "na",
      line: "No company financials saved yet — refresh this symbol to judge the business itself.",
    };
  }
  const score = fundamental;
  if (score >= 70)
    return {
      score,
      label: "Strong business",
      tone: "pos",
      line: "Healthy finances with staying power — the kind of company you can hold through rough patches.",
    };
  if (score >= 58)
    return {
      score,
      label: "Solid business",
      tone: "pos",
      line: "The finances are in good shape overall, with a few soft spots worth watching.",
    };
  if (score >= 45)
    return {
      score,
      label: "Average business",
      tone: "mid",
      line: "Nothing alarming, nothing special — owning this long-term means betting it improves.",
    };
  if (score >= 33)
    return {
      score,
      label: "Shaky business",
      tone: "neg",
      line: "The finances have real weak spots — a tough company to hold for years with confidence.",
    };
  return {
    score,
    label: "Weak business",
    tone: "neg",
    line: "The finances score poorly — long-term holders are fighting the odds here.",
  };
}

function buildAddNowAnswer({ action, technical, fireSale, rsi14 }) {
  if (action === "SELL") {
    return {
      score: Number.isFinite(technical) ? technical : null,
      label: "Don't add",
      tone: "neg",
      line: "The committee wouldn't put new money in at all right now — see the plan below.",
    };
  }
  if (fireSale) {
    return {
      score: Number.isFinite(technical) ? technical : null,
      label: "Marked down",
      tone: "pos",
      line: "The price is on sale while the business holds up — a reasonable moment for patient money, though discounts can deepen first.",
    };
  }
  if (!Number.isFinite(technical)) {
    return {
      score: null,
      label: "Not enough info",
      tone: "na",
      line: "Not enough price history yet to judge the timing.",
    };
  }
  if (Number.isFinite(rsi14) && rsi14 >= 75 && technical >= 55) {
    return {
      score: technical,
      label: "Running hot",
      tone: "mid",
      line: "It's run up fast — good businesses are worth owning, but waiting for a breather usually gets a better price.",
    };
  }
  if (technical >= 58) {
    return {
      score: technical,
      label: "Decent time",
      tone: "pos",
      line: "The trend is healthy — buying here means joining strength, not catching a falling price.",
    };
  }
  if (technical >= 45) {
    return {
      score: technical,
      label: "No rush",
      tone: "mid",
      line: "The trend is flat to mixed — nothing says buy today, so you can afford to be patient.",
    };
  }
  return {
    score: technical,
    label: "Still falling",
    tone: "neg",
    line: "The price hasn't stopped falling — if you want to own it, waiting for the trend to steady usually gets a better price.",
  };
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

// ── Narrative synthesis ("the chair's verdict") ────────────────────────────
// One short reasoned paragraph that reads the way an analyst writes: lead with
// the dominant driver, concede the strongest opposing signal, then resolve to
// the action with language calibrated to conviction. A pure function of the
// same structured inputs the bullets use — it can never state a number the
// engine didn't compute, so it stays deterministic and hallucination-proof.

const PILLAR_LABELS = {
  technical: "the price trend",
  fundamental: "the company's finances",
  sentiment: "the news mood",
};

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Deterministic index into a phrase bank, seeded by the numeric inputs so the
// same verdict always reads the same while different stocks vary. Not for
// security — just to break the "every row is worded identically" template tell.
const pick = (bank, seed) => bank[Math.abs(Math.round(seed)) % bank.length];

// A pillar's state in words, graded off distance from neutral (50). "finances"
// is plural, so its verbs agree separately from the singular trend/mood labels.
function describePillar(key, val) {
  const label = PILLAR_LABELS[key];
  const plural = key === "fundamental";
  const look = plural ? "look" : "looks";
  const be = plural ? "are" : "is";
  if (val >= 65) return { key, val, text: `${label} ${look} strong` };
  if (val >= 55) return { key, val, text: `${label} ${be} holding up` };
  if (val > 45) return { key, val, text: `${label} ${be} mixed` };
  if (val > 35) return { key, val, text: `${label} ${be} soft` };
  return { key, val, text: `${label} ${look} weak` };
}

// The action, hedged to conviction — appropriate hedging is what reads as
// judgment rather than a canned label.
function resolutionSentence(action, tier, convictionLabel, seed, onSale) {
  const low = convictionLabel === "Low";
  const high = convictionLabel === "High";
  if (action === "BUY") {
    if (high)
      return pick(
        [
          "On balance the committee would buy.",
          "The weight of evidence lands on buy.",
        ],
        seed,
      );
    if (low) return "It edges toward a buy, but it's a close call.";
    return "The committee leans buy.";
  }
  if (action === "SELL") {
    const verb = tier === "Reduce" ? "trim" : "exit";
    if (high)
      return `The weight of evidence is firmly negative — the committee would ${verb}.`;
    if (low)
      return `It leans toward ${verb === "exit" ? "selling" : "trimming"}, though the call is close.`;
    return `The committee would ${verb} rather than add to it.`;
  }
  // A "coin-flip" HOLD line under a fire-sale framing read as a contradiction;
  // name the actual stance instead: not adding yet, but worth watching.
  if (onSale)
    return "For now it's a hold — the committee wouldn't add until the trend steadies, but this is a markdown worth watching.";
  if (low)
    return "There's no edge either way — close to a coin-flip, so the committee neither adds nor trims.";
  return "There's no clear edge, so the committee would neither add money nor pull it out.";
}

export function buildNarrative({
  tier,
  action,
  composite,
  convictionLabel,
  pillars,
  discount,
  fireSale,
  devil,
}) {
  const scored = Object.entries(pillars)
    .filter(([, v]) => Number.isFinite(v))
    .map(([k, v]) => describePillar(k, v));

  // Nothing scored — fall back to the plain thesis line.
  if (!scored.length)
    return buildThesis(tier, composite, convictionLabel, pillars);

  // Stable per verdict, varied across stocks.
  const seed = scored.reduce((s, p) => s + p.val, 0) + composite;

  // Dominant driver = the pillar furthest from neutral; strongest opposing
  // signal = the next-furthest on the other side of 50. That "but/and"
  // connective is the part that reads as reasoning rather than a list.
  const byMagnitude = [...scored].sort(
    (a, b) => Math.abs(b.val - 50) - Math.abs(a.val - 50),
  );
  const lead = byMagnitude[0];
  const leadPos = lead.val >= 50;
  const opposing = byMagnitude
    .slice(1)
    .find((p) => p.val >= 50 !== leadPos && Math.abs(p.val - 50) >= 5);
  const reinforcing = opposing
    ? null
    : byMagnitude.slice(1).find((p) => Math.abs(p.val - 50) >= 5);

  const sentences = [];
  const off = fireSale?.offHighPct ?? discount?.offHighPct;
  // The devil's sharpest contradiction is a better concession than a pillar
  // score — it names the actual tension ("healthy business, falling price")
  // rather than just noting a weak number.
  const contradiction = devil?.contradictions?.[0] ?? null;

  if (Number.isFinite(off) && (discount || fireSale)) {
    // Distinctive "quality on sale" framing when the setup is present. One
    // sentence only — the fire-sale box carries the reasons and cautions, and
    // the devil's contradiction here ("healthy business, falling price")
    // restates this same tension, so quoting it too just doubled the length.
    sentences.push(
      `Strong finances, but the stock sits ${off.toFixed(0)}% below its 52-week high — priced low on a healthy business, not a broken one.`,
    );
  } else if (contradiction) {
    // Open with the tension the devil's advocate flagged — it's a self-contained
    // "X but Y" statement, so it leads on its own without a pillar-score
    // preamble that would only restate half of it.
    sentences.push(contradiction);
  } else if (Math.abs(lead.val - 50) < 5) {
    // Everything hugs neutral — say so plainly instead of forcing a contrast.
    sentences.push(
      pick(
        [
          "Trend, finances, and news are all close to neutral, with nothing pushing hard in either direction.",
          "None of the signals — trend, finances, or news — leans far from the middle right now.",
        ],
        seed,
      ),
    );
  } else if (opposing) {
    const but = pick(["but", "yet", "while"], seed);
    sentences.push(
      `${cap(lead.text)}, ${but} ${opposing.text} — ${pick(["the two pull against each other", "so the picture is genuinely mixed", "which keeps this from being a clean call"], seed)}.`,
    );
  } else if (reinforcing) {
    sentences.push(
      `${cap(lead.text)}, and ${reinforcing.text} — the signals agree more than they conflict.`,
    );
  } else {
    sentences.push(`${cap(lead.text)}.`);
  }

  sentences.push(
    resolutionSentence(
      action,
      tier,
      convictionLabel,
      seed,
      Boolean(discount || fireSale),
    ),
  );

  return sentences.join(" ");
}

// Synthesizes everything into a single verdict and an action plan.
export function runPortfolioManager({
  dataScout,
  sentiment,
  devil,
  bear: bearAgent,
  candles = [],
  quarterly = [],
  history = [],
  benchmarkCandles = [],
}) {
  const pillarScores = {
    technical: dataScout.technicalScore,
    fundamental: dataScout.fundamentalScore,
    sentiment: sentiment.score,
  };
  // Long-term weighting: the business gets the biggest vote, the trend
  // second, month-scale news mood least. (v2 was 40/35/25 trend-first.)
  const pillars = [
    [pillarScores.technical, 0.35],
    [pillarScores.fundamental, 0.45],
    [pillarScores.sentiment, 0.2],
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
  let composite = 50 + (rawComposite - 50) * (1 - dampen);

  // Thesis tracking: nudge for the trajectory of our own past scores.
  const momentum = scoreMomentum(history, composite);
  if (momentum) composite = clamp(composite + momentum.nudge, 0, 100);

  // Quality-on-sale: strong finances marked down by a weak trend get a
  // modest lift — enough to tip a borderline Hold toward Buy (or a
  // borderline Reduce back to Hold), never enough to manufacture a
  // Strong Buy out of a middling score.
  const discount = discountCheck(
    candles,
    pillarScores,
    quarterly,
    dataScout.metrics ?? {},
  );
  if (discount) composite = clamp(composite + DISCOUNT_NUDGE, 0, 100);

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

  // Don't chase: a parabolic move can saturate the momentum score faster
  // than the overbought penalties offset it, so an excellent company going
  // vertical could out-score the same company in a steady uptrend. The
  // thesis may be intact, but the entry isn't — extreme overbought caps the
  // top tier at Buy.
  const rsi14 = dataScout.metrics?.rsi14;
  const chaseCapped =
    tier === "Strong Buy" && Number.isFinite(rsi14) && rsi14 >= 80;
  if (chaseCapped) tier = "Buy";

  // Evidence gate: the top rating means "size up" and demands the full
  // picture. With no company financials at all, a chart-only Strong Buy is
  // half a thesis — cap it at Buy. (Deliberately asymmetric: Sell verdicts
  // are NOT weakened by missing data, because reducing risk needs less
  // evidence than taking it.)
  const noFundamentals = !Number.isFinite(pillarScores.fundamental);
  const evidenceCapped = tier === "Strong Buy" && noFundamentals;
  if (evidenceCapped) tier = "Buy";

  // Fire sale: the discount setup surfaced as its own indicator — the stock
  // is priced low while the business stays strong, the kind of markdown with
  // room to bounce back toward its old high. Never shown on a SELL verdict:
  // if the composite still lands there, the markdown reads as decay, not a
  // discount.
  const fireSale =
    discount && action !== "SELL"
      ? buildFireSale(discount, pillarScores, dataScout.metrics ?? {}, {
          valuation: discount.valuation,
          trajectory: fundamentalTrajectory(dataScout.metrics ?? {}),
          benchmark: offHighPct(benchmarkCandles),
          streak: fireSaleStreak(history),
        })
      : null;

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
      ? buildEntryPlan(candles, metrics, convictionLabel)
      : action === "SELL"
        ? buildExitPlan(metrics, bearAgent, pillarScores, tier, conviction)
        : buildWatchPlan(metrics);

  // Kept for backward compatibility: `risk` is the BUY entry plan.
  const risk = plan?.kind === "entry" ? plan : null;

  // Two answers, one verdict: the slow question (own it?) and the fast
  // question (add now?), each with a plain-English label + line for the UI.
  const answers = {
    ownIt: buildOwnItAnswer(pillarScores.fundamental),
    addNow: buildAddNowAnswer({
      action,
      technical: pillarScores.technical,
      fireSale,
      rsi14,
    }),
  };

  return {
    key: "portfolioManager",
    name: "Portfolio Manager",
    role: "The decision: buy, hold, or sell — and what to do about it",
    action,
    tier,
    composite,
    conviction,
    convictionLabel,
    fireSale,
    answers,
    risk,
    plan,
    summary: buildThesis(tier, composite, convictionLabel, pillarScores),
    // The chair's verdict: a synthesized paragraph (lead → concession →
    // resolution) that reads like an analyst wrote it. `summary` is kept as the
    // terse one-liner for compact surfaces / backward compatibility.
    narrative: buildNarrative({
      tier,
      action,
      composite,
      convictionLabel,
      pillars: pillarScores,
      discount,
      fireSale,
      plan,
      devil,
    }),
    findings: [
      ...(momentum ? [momentumFinding(momentum, composite)] : []),
      ...(discount && !fireSale ? [discountFinding(discount)] : []),
      ...(fireSale ? fireSaleFindings(fireSale) : []),
      ...(chaseCapped
        ? [
            neutral(
              `Strong Buy on the numbers, but it's gone nearly vertical (RSI ${rsi14.toFixed(0)}) — wait for a pullback rather than chasing.`,
              1,
            ),
          ]
        : []),
      ...(evidenceCapped
        ? [
            neutral(
              "Strong Buy on the chart, but no company financials are saved — refresh this symbol to give the top rating the full picture.",
              1,
            ),
          ]
        : []),
      ...buildPlanFindings(action, tier, plan),
    ],
  };
}
