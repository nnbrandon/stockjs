// Outcome tracking (#2): the committee grading itself. Every daily run stamps
// the verdict price into the symbol's history; here we compare a past verdict's
// price against the current price to measure the realized return, bucketed by
// how long ago the verdict was made and by its action. It answers the only
// question that matters for trust: did Buy-rated names actually beat Sell-rated?
//
// Pure + dependency-free — the caller supplies each holding's history + current
// price. Nothing renders until verdicts age into the shortest horizon.

const DAY_MS = 24 * 60 * 60 * 1000;
// Don't report a horizon graded on fewer than this many verdicts — a personal
// portfolio is a small sample and a handful of names would be pure noise.
const MIN_GRADED = 3;
// A correlation on fewer than this many verdicts is noise — hide ρ until
// there's enough to be worth reading (still small statistically; n is shown).
const MIN_PREDICTIVE = 8;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Average-rank Spearman correlation: rank each series (ties share the mean
// rank), then Pearson-correlate the ranks. Robust to outliers and monotonic
// (not just linear) relationships — the right tool for "did higher scores go
// with higher returns" on a small, noisy sample.
function averageRanks(xs) {
  const order = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const avg = (i + j) / 2 + 1; // mean of the 1-based ranks i+1..j+1
    for (let k = i; k <= j; k++) ranks[order[k][1]] = avg;
    i = j + 1;
  }
  return ranks;
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : null;
}

function spearman(xs, ys) {
  if (xs.length !== ys.length || xs.length < 2) return null;
  return pearson(averageRanks(xs), averageRanks(ys));
}

/**
 * @param {Array} items  [{ symbol, currentPrice, history:[{day, price, action}] }]
 * @param {object} [opts] { horizons:number[] (days), nowMs:number }
 * @returns {{ horizons: Array<{horizon, per, spread, graded, enough}>, gradedTotal:number }}
 */
export function computeTrackRecord(
  items = [],
  { horizons = [30, 90], nowMs = Date.now() } = {},
) {
  const out = horizons.map((horizon) => {
    const byAction = { BUY: [], HOLD: [], SELL: [] };
    const target = nowMs - horizon * DAY_MS;
    // Grade a verdict against this horizon only if its age is within ±40% —
    // wide enough to catch a daily-ish cadence, tight enough to stay "~N days".
    const lo = nowMs - horizon * 1.4 * DAY_MS;
    const hi = nowMs - horizon * 0.6 * DAY_MS;

    const samples = []; // { technical, fundamental, sentiment, ret } per graded verdict
    for (const it of items) {
      const cur = it.currentPrice;
      if (!Number.isFinite(cur) || cur <= 0) continue;
      // Each holding contributes at most once per horizon — the verdict closest
      // to `horizon days ago` — so one name can't dominate a bucket.
      let best = null;
      let bestDiff = Infinity;
      for (const r of it.history || []) {
        if (!Number.isFinite(r.price) || r.price <= 0 || !byAction[r.action])
          continue;
        const t = new Date(r.day).getTime();
        if (!Number.isFinite(t) || t < lo || t > hi) continue;
        const diff = Math.abs(t - target);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = r;
        }
      }
      if (best) {
        const ret = (cur / best.price - 1) * 100;
        byAction[best.action].push(ret);
        // Keep the pillar scores alongside the return for predictive value.
        samples.push({
          technical: best.technical,
          fundamental: best.fundamental,
          sentiment: best.sentiment,
          ret,
        });
      }
    }

    const per = {};
    let graded = 0;
    for (const action of ["BUY", "HOLD", "SELL"]) {
      per[action] = {
        n: byAction[action].length,
        meanReturn: mean(byAction[action]),
      };
      graded += byAction[action].length;
    }
    // The headline: how much the committee's buys out- (or under-) performed
    // its sells over this window. Null until both sides have a reading.
    const spread =
      per.BUY.meanReturn != null && per.SELL.meanReturn != null
        ? per.BUY.meanReturn - per.SELL.meanReturn
        : null;

    // Per-pillar predictive value: did each pillar's score rank-track the
    // realized return? ρ ∈ [-1, +1]; null until there's enough to be worth it.
    // This is the honest evidence for whether the 35/45/20 weights are right.
    const predictive = {};
    for (const pillar of ["technical", "fundamental", "sentiment"]) {
      const pairs = samples.filter(
        (s) => Number.isFinite(s[pillar]) && Number.isFinite(s.ret),
      );
      predictive[pillar] = {
        n: pairs.length,
        rho:
          pairs.length >= MIN_PREDICTIVE
            ? spearman(
                pairs.map((s) => s[pillar]),
                pairs.map((s) => s.ret),
              )
            : null,
      };
    }

    return { horizon, per, spread, graded, enough: graded >= MIN_GRADED, predictive };
  });

  return { horizons: out, gradedTotal: out.reduce((s, h) => s + h.graded, 0) };
}
