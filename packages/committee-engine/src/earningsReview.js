// A post-earnings review, the way an analyst writes one: what we expected,
// what happened, how the stock reacted, and whether our view changed. Surfaces
// for ~10 days after each report, then goes quiet. All the inputs already
// exist (estimate vs. actual, verdict history, candles) — this just
// synthesizes them into a few plain sentences. DISPLAY-ONLY; never scored.

const DAY_MS = 24 * 60 * 60 * 1000;

const isoDay = (d) => {
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};

const round = (n, d = 0) => (Number.isFinite(n) ? Number(n.toFixed(d)) : null);

/**
 * @param {object} args
 * @param {Array}  args.earnings   earnings rows (newest first), each with
 *                                 {reportedDate, epsActual, epsEstimate, surprisePercent}
 * @param {Array}  args.history    verdict-history rows {day, tier, composite}
 * @param {Array}  args.candles    OHLCV candles (oldest → newest)
 * @param {object|null} args.report  the fresh committee report (for tierNow +
 *                                 metrics.earningsRevenueGrowthYoY)
 * @param {number} args.windowDays how recent the report must be (default 10)
 * @param {number} args.nowMs      clock (injectable for tests)
 * @returns {object|null} review, or null when no report landed in the window
 */
export function buildEarningsReview({
  earnings = [],
  history = [],
  candles = [],
  report = null,
  windowDays = 10,
  nowMs = Date.now(),
} = {}) {
  // Newest report within the window, not in the future.
  const recent = [...earnings]
    .filter((e) => {
      const t = e?.reportedDate ? new Date(e.reportedDate).getTime() : NaN;
      if (!Number.isFinite(t) || t > nowMs) return false;
      return (nowMs - t) / DAY_MS <= windowDays;
    })
    .sort((a, b) => new Date(b.reportedDate) - new Date(a.reportedDate))[0];
  if (!recent) return null;

  const reportedDay = isoDay(recent.reportedDate);
  const reportedMs = new Date(recent.reportedDate).getTime();

  // Price reaction: last close strictly before the report vs. the latest close.
  let priceReactionPct = null;
  const sorted = [...candles]
    .filter((c) => Number.isFinite(new Date(c?.date).getTime()))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const before = [...sorted]
    .reverse()
    .find((c) => new Date(c.date).getTime() < reportedMs);
  const last = sorted[sorted.length - 1];
  const after =
    last && new Date(last.date).getTime() >= reportedMs ? last : null;
  if (
    before &&
    after &&
    Number.isFinite(before.close) &&
    before.close > 0 &&
    Number.isFinite(after.close)
  ) {
    priceReactionPct = (after.close / before.close - 1) * 100;
  }

  // The committee's stance going into the report (any engine version — a tier
  // label is comparable across versions, and this is display only).
  let verdictBefore = null;
  if (reportedDay) {
    const prior = history
      .filter((r) => r?.day && r.day < reportedDay && r.tier)
      .sort((a, b) => (a.day < b.day ? 1 : -1))[0];
    if (prior) {
      verdictBefore = {
        tier: prior.tier,
        composite: Number.isFinite(prior.composite) ? prior.composite : null,
        day: prior.day,
      };
    }
  }
  const tierNow = report?.verdict?.tier ?? null;
  const revenueGrowthYoY = report?.metrics?.earningsRevenueGrowthYoY ?? null;

  // ── Beginner-voice lines; each skipped when its data is missing. ──
  const lines = [];

  const { epsActual, epsEstimate } = recent;
  if (Number.isFinite(epsActual) && Number.isFinite(epsEstimate)) {
    const surprise = Number.isFinite(recent.surprisePercent)
      ? recent.surprisePercent
      : epsEstimate !== 0
        ? ((epsActual - epsEstimate) / Math.abs(epsEstimate)) * 100
        : null;
    let outcome;
    if (Number.isFinite(surprise) && surprise > 1) {
      outcome = `beat it by ${round(surprise)}%`;
    } else if (Number.isFinite(surprise) && surprise < -1) {
      outcome = `fell ${round(Math.abs(surprise))}% short`;
    } else {
      outcome = "landing right in line";
    }
    lines.push(
      `Before the report, analysts expected profits of $${epsEstimate.toFixed(2)} per share; the company delivered $${epsActual.toFixed(2)} — ${outcome}.`,
    );
  }

  if (Number.isFinite(revenueGrowthYoY)) {
    const dir = revenueGrowthYoY >= 0 ? "grew" : "shrank";
    lines.push(
      `Sales ${dir} ${round(Math.abs(revenueGrowthYoY))}% vs. the same quarter last year.`,
    );
  }

  if (Number.isFinite(priceReactionPct)) {
    const dir = priceReactionPct >= 0 ? "up" : "down";
    lines.push(
      `The stock has moved ${dir} ${round(Math.abs(priceReactionPct))}% since the report.`,
    );
  }

  if (verdictBefore) {
    const tail =
      tierNow && tierNow !== verdictBefore.tier
        ? `, and it's ${tierNow} now`
        : " — unchanged after the report";
    lines.push(
      `The committee rated it ${verdictBefore.tier} going in${tail}.`,
    );
  }

  return {
    reportedDate: recent.reportedDate,
    epsActual: Number.isFinite(epsActual) ? epsActual : null,
    epsEstimate: Number.isFinite(epsEstimate) ? epsEstimate : null,
    surprisePercent: Number.isFinite(recent.surprisePercent)
      ? recent.surprisePercent
      : null,
    revenueGrowthYoY: Number.isFinite(revenueGrowthYoY)
      ? revenueGrowthYoY
      : null,
    priceReactionPct,
    verdictBefore,
    tierNow,
    lines,
  };
}
