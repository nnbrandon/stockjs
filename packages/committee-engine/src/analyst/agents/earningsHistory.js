import { scaleClamp } from "../indicators";
import {
  avg,
  bear,
  bull,
  findYearAgoRow,
  neutral,
  sortByDateDesc,
} from "./helpers";

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

  const beatRateScore = scaleClamp(beatRate, 25, 100, 10, 90);
  const surpriseScore = Number.isFinite(latest.surprisePercent)
    ? scaleClamp(latest.surprisePercent, -15, 15, 10, 90)
    : null;
  components.push(
    surpriseScore != null ? avg([beatRateScore, surpriseScore]) : beatRateScore,
  );

  const quarterLabel = tracked.length === 1 ? "quarter" : "quarters";

  // Track record and latest surprise share one bullet when they agree; a
  // beat streak broken by a fresh miss (or vice versa) stays two bullets so
  // the colors don't lie. `base` is the tail-less phrasing used when merged.
  let track;
  if (streak >= 3 && streakIsBeat) {
    track = {
      polarity: "bull",
      weight: 2,
      base: `Beat profit expectations ${streak} ${quarterLabel} in a row`,
      text: `Beat profit expectations ${streak} ${quarterLabel} in a row — analysts keep underestimating it`,
    };
  } else if (streak >= 3 && !streakIsBeat) {
    track = {
      polarity: "bear",
      weight: 2,
      base: `Missed profit expectations ${streak} ${quarterLabel} in a row`,
      text: `Missed profit expectations ${streak} ${quarterLabel} in a row — a worrying pattern`,
    };
  } else if (beatRate >= 75) {
    track = {
      polarity: "bull",
      weight: 2,
      base: `Usually beats profit expectations (${beats} of the last ${tracked.length} ${quarterLabel})`,
      text: `Usually beats profit expectations — ${beats} of the last ${tracked.length} ${quarterLabel}`,
    };
  } else if (beatRate < 50) {
    track = {
      polarity: "bear",
      weight: 2,
      base: `Often misses profit expectations (only ${beats} of the last ${tracked.length} ${quarterLabel} beat)`,
      text: `Often misses profit expectations — only ${beats} of the last ${tracked.length} ${quarterLabel} beat`,
    };
  } else {
    track = {
      polarity: "neutral",
      weight: 1,
      base: `Mixed record vs. profit expectations (beat ${beats} of the last ${tracked.length} ${quarterLabel})`,
      text: `Mixed record vs. profit expectations — beat ${beats} of the last ${tracked.length} ${quarterLabel}`,
    };
  }

  let surprise = null;
  if (Number.isFinite(latest.surprisePercent)) {
    const actual = latest.epsActual.toFixed(2);
    const estimate = latest.epsEstimate.toFixed(2);
    if (latest.surprisePercent > EPS_SURPRISE_THRESH) {
      surprise = {
        polarity: "bull",
        weight: streak >= 3 && streakIsBeat ? 1 : 2,
        tail: `latest crushed the estimate ($${actual} vs. $${estimate}, +${latest.surprisePercent.toFixed(1)}%)`,
        text: `Latest quarter crushed the estimate ($${actual} vs. $${estimate}, +${latest.surprisePercent.toFixed(1)}%)`,
      };
    } else if (latest.surprisePercent < -EPS_SURPRISE_THRESH) {
      surprise = {
        polarity: "bear",
        weight: 2,
        tail: `latest missed ($${actual} vs. $${estimate}, -${Math.abs(latest.surprisePercent).toFixed(1)}%)`,
        text: `Latest quarter missed the estimate ($${actual} vs. $${estimate}, -${Math.abs(latest.surprisePercent).toFixed(1)}%)`,
      };
    } else {
      surprise = {
        polarity: "neutral",
        weight: 1,
        tail: `latest landed near the estimate ($${actual} vs. $${estimate})`,
        text: `Latest quarter landed near the estimate ($${actual} vs. $${estimate})`,
      };
    }
  }

  const mk = { bull, bear, neutral };
  if (surprise && surprise.polarity === track.polarity) {
    findings.push(
      mk[track.polarity](
        `${track.base} — ${surprise.tail}`,
        Math.max(track.weight, surprise.weight),
      ),
    );
  } else {
    findings.push(mk[track.polarity](track.text, track.weight));
    if (surprise) findings.push(mk[surprise.polarity](surprise.text, surprise.weight));
  }

  // Match by date, not position — a skipped quarter would silently shift a
  // positional tracked[4] onto the wrong comparison quarter.
  const yearAgo = findYearAgoRow(tracked, latest);
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
          `Latest report: revenue up ${revYoY.toFixed(0)}% vs. the same quarter last year`,
          1,
        ),
      );
    } else if (revYoY < -5) {
      findings.push(
        bear(
          `Latest report: revenue down ${Math.abs(revYoY).toFixed(0)}% vs. the same quarter last year`,
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
