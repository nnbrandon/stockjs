import { scaleClamp } from "../indicators";
import { avg, bear, bull, neutral, sortByDateDesc } from "./helpers";

const EARNINGS_TRACK_QUARTERS = 8;
const EPS_SURPRISE_THRESH = 5;
const FRESH_EARNINGS_DAYS = 14;

const beatEps = (e) =>
  Number.isFinite(e.epsActual) &&
  Number.isFinite(e.epsEstimate) &&
  e.epsActual >= e.epsEstimate;

// Beat/miss track record + latest surprise for the Data Scout.
export function analyzeEarningsHistory(earnings = []) {
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
