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

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

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
      if (best) byAction[best.action].push((cur / best.price - 1) * 100);
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
    return { horizon, per, spread, graded, enough: graded >= MIN_GRADED };
  });

  return { horizons: out, gradedTotal: out.reduce((s, h) => s + h.graded, 0) };
}
