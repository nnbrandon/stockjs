// A persistent thesis with kill criteria — "why you own it", checked every
// run. Verdicts are recomputed from scratch daily and remember nothing about
// WHY the committee liked a stock. This stores that reason at BUY time as 2–3
// metric-based legs (not prose — prose changes wording, metrics don't), then
// re-checks each leg on every later run: intact, weakening, broken, or can't
// tell. "The reason you bought is gone" is the best sell signal a long-term
// investor has.
//
// Pure engine code. The PERSISTENCE (storing the snapshot per symbol) lives in
// the server pipeline; this file only builds and checks. DISPLAY-ONLY — the
// metrics that break a leg are already dragging the fundamental score, so
// scoring the thesis again would double-count.

import { COMMITTEE_ENGINE_VERSION } from "./analyst/version.js";

const round = (v) => Math.round(v);
const cents = (v) => `${round(v)} cents`;
const pct = (v) => `${round(v)}%`;

// The leg catalog, in fixed PRIORITY order (build takes the first N that
// qualify — deterministic, no scoring). Each leg reads report.metrics (`m`):
//   read      — the value captured at thesis time and re-read later
//   qualifies — strong enough to anchor a thesis, at build time
//   status    — intact | weakening | broken | nodata, given current metrics
//               and the captured value
//   line      — a plain sentence with the numbers, per status
const CATALOG = [
  {
    id: "margins",
    label: "Strong profit margins",
    read: (m) => m.netMargin,
    qualifies: (m) => Number.isFinite(m.netMargin) && m.netMargin >= 12,
    status: (m, cap) => {
      const cur = m.netMargin;
      if (!Number.isFinite(cur)) return "nodata";
      if (cur < 0 || cur < cap - 6) return "broken";
      if (cur < cap - 3) return "weakening";
      return "intact";
    },
    line: (st, cur, cap) => {
      if (st === "nodata") return "Profit margins can't be checked right now.";
      const now = Number.isFinite(cur) ? cents(cur) : "—";
      const then = round(cap);
      if (st === "broken")
        return `Profit margins have broken down — ${now} of each sales dollar now vs. ${then} when the thesis was set.`;
      if (st === "weakening")
        return `Profit margins are slipping — ${now} of each sales dollar vs. ${then} at the thesis.`;
      return `Profit margins have held up — ${now} of each sales dollar vs. ${then} when the thesis was set.`;
    },
  },
  {
    id: "cash",
    label: "Turns sales into real cash",
    read: (m) => m.fcfMargin,
    qualifies: (m) => Number.isFinite(m.fcfMargin) && m.fcfMargin >= 10,
    status: (m, cap) => {
      const cur = m.fcfMargin;
      if (!Number.isFinite(cur)) return "nodata";
      if (cur < 0) return "broken";
      if (cur < cap - 5) return "weakening";
      return "intact";
    },
    line: (st, cur, cap) => {
      if (st === "nodata") return "Cash generation can't be checked right now.";
      const now = Number.isFinite(cur) ? cents(cur) : "—";
      const then = round(cap);
      if (st === "broken")
        return `It has stopped turning sales into cash — ${now} of each sales dollar now vs. ${then} at the thesis.`;
      if (st === "weakening")
        return `Less of each sale is becoming cash — ${now} vs. ${then} cents at the thesis.`;
      return `Still turns sales into cash — ${now} of each sales dollar vs. ${then} at the thesis.`;
    },
  },
  {
    id: "growth",
    label: "Sales still growing",
    read: (m) => m.revenueGrowthYoY,
    qualifies: (m) =>
      Number.isFinite(m.revenueGrowthYoY) && m.revenueGrowthYoY >= 8,
    status: (m, cap) => {
      const cur = m.revenueGrowthYoY;
      if (!Number.isFinite(cur)) return "nodata";
      if (cur < 0) return "broken";
      if (cur < cap / 2) return "weakening";
      return "intact";
    },
    line: (st, cur, cap) => {
      if (st === "nodata") return "Sales growth can't be checked right now.";
      const then = pct(cap);
      if (st === "broken")
        return `Sales are shrinking (${pct(cur)}) — the growth reason to own it is gone (was ${then} at the thesis).`;
      if (st === "weakening")
        return `Sales growth has slowed to ${pct(cur)} from ${then} at the thesis.`;
      return `Sales are still growing ${pct(cur)} a year (was ${then} at the thesis).`;
    },
  },
  {
    id: "quality",
    label: "High return on the money invested",
    read: (m) => m.roe,
    qualifies: (m) => Number.isFinite(m.roe) && m.roe >= 15,
    status: (m, cap) => {
      const cur = m.roe;
      if (!Number.isFinite(cur)) return "nodata";
      if (cur < 5) return "broken";
      if (cur < cap - 7) return "weakening";
      return "intact";
    },
    line: (st, cur, cap) => {
      if (st === "nodata")
        return "Return on shareholders' money can't be checked right now.";
      const then = pct(cap);
      if (st === "broken")
        return `It now earns very little on shareholders' money (${pct(cur)}, was ${then} at the thesis).`;
      if (st === "weakening")
        return `Return on shareholders' money has fallen to ${pct(cur)} from ${then} at the thesis.`;
      return `Still earns a high return on shareholders' money (${pct(cur)} vs. ${then} at the thesis).`;
    },
  },
  {
    id: "fortress",
    label: "Fortress balance sheet",
    read: (m) => m.debtToEquity,
    qualifies: (m) =>
      m.netCash === true ||
      (Number.isFinite(m.debtToEquity) && m.debtToEquity < 0.5),
    status: (m, cap) => {
      const cur = m.debtToEquity;
      if (!Number.isFinite(cur)) return m.netCash === true ? "intact" : "nodata";
      if (cur > 1.5) return "broken";
      if (Number.isFinite(cap) && cur > cap * 2) return "weakening";
      return "intact";
    },
    line: (st, cur) => {
      if (st === "nodata") return "The debt load can't be checked right now.";
      if (st === "broken")
        return `Debt has piled up — now $${Number.isFinite(cur) ? cur.toFixed(1) : "—"} of debt per $1 shareholders own, a heavy load.`;
      if (st === "weakening")
        return `Debt has crept up since the thesis was set (now ${Number.isFinite(cur) ? cur.toFixed(1) : "—"}× equity).`;
      return "Balance sheet is still rock-solid — little or no net debt.";
    },
  },
  {
    id: "buybacks",
    label: "Buying back its own shares",
    read: (m) => m.shareCountChangePerYearPct,
    qualifies: (m) =>
      Number.isFinite(m.shareCountChangePerYearPct) &&
      m.shareCountChangePerYearPct <= -0.75,
    status: (m) => {
      const cur = m.shareCountChangePerYearPct;
      if (!Number.isFinite(cur)) return "nodata";
      if (cur >= 1) return "broken";
      if (cur > 0) return "weakening";
      return "intact";
    },
    line: (st, cur) => {
      if (st === "nodata")
        return "The share count trend can't be checked right now.";
      if (st === "broken")
        return `It has switched to issuing new shares (${pct(Math.abs(cur))} more a year) — that waters down your stake instead of concentrating it.`;
      if (st === "weakening")
        return "The buybacks have stopped — the share count is creeping up again.";
      return `Still shrinking its share count (${pct(Math.abs(cur))} a year), which grows your slice of the company.`;
    },
  },
  {
    id: "dividend",
    label: "Affordable, growing dividend",
    read: (m) => m.dividendPayoutOfCashPct,
    qualifies: (m) =>
      Number.isFinite(m.dividendPayoutOfCashPct) &&
      m.dividendPayoutOfCashPct <= 60 &&
      Number.isFinite(m.dividendYieldPct),
    status: (m, cap) => {
      const cur = m.dividendPayoutOfCashPct;
      if (!Number.isFinite(cur)) return "nodata";
      if (
        cur > 100 ||
        (Number.isFinite(m.dividendGrowthYoY) && m.dividendGrowthYoY <= -4)
      )
        return "broken";
      if (cur > 85) return "weakening";
      // cap unused for intact/weakening thresholds beyond the absolute floors.
      void cap;
      return "intact";
    },
    line: (st, cur) => {
      if (st === "nodata")
        return "The dividend's affordability can't be checked right now.";
      if (st === "broken")
        return "The dividend looks stretched — it's paying out more cash than it comfortably earns, or has started cutting it.";
      if (st === "weakening")
        return `The dividend is taking a bigger bite of cash flow (${pct(cur)}) — less room to spare.`;
      return `The dividend still looks affordable (about ${pct(cur)} of free cash flow).`;
    },
  },
];

const CATALOG_BY_ID = new Map(CATALOG.map((leg) => [leg.id, leg]));
const MAX_LEGS = 3;

/**
 * Build a thesis snapshot from a fresh BUY report. Returns null for non-BUY
 * verdicts or when fewer than 2 strong business legs qualify (a chart-driven
 * buy — nothing worth anchoring a long-term thesis to).
 * @returns {{ legs: Array<{id,label,capturedValue}>, engineVersion:number } | null}
 */
export function buildThesisSnapshot(report) {
  if (report?.verdict?.action !== "BUY") return null;
  const m = report?.metrics ?? {};
  const legs = CATALOG.filter((leg) => leg.qualifies(m))
    .slice(0, MAX_LEGS)
    .map((leg) => {
      const v = leg.read(m);
      return {
        id: leg.id,
        label: leg.label,
        capturedValue: Number.isFinite(v) ? v : null,
      };
    });
  if (legs.length < 2) return null;
  return { legs, engineVersion: COMMITTEE_ENGINE_VERSION };
}

/**
 * Re-check a stored thesis against a fresh report.
 * @returns {{ status:"intact"|"watch"|"broken", legs:Array, line:string } | null}
 */
export function checkThesis(snapshot, report) {
  if (!snapshot || !Array.isArray(snapshot.legs) || !snapshot.legs.length) {
    return null;
  }
  const m = report?.metrics ?? {};

  const legs = snapshot.legs.map((stored) => {
    const def = CATALOG_BY_ID.get(stored.id);
    if (!def) {
      return {
        id: stored.id,
        label: stored.label ?? stored.id,
        status: "nodata",
        capturedValue: stored.capturedValue ?? null,
        currentValue: null,
        line: "This reason can't be checked right now.",
      };
    }
    const cap = stored.capturedValue;
    const status = def.status(m, cap);
    const currentValue = def.read(m);
    return {
      id: stored.id,
      label: def.label,
      status,
      capturedValue: Number.isFinite(cap) ? cap : null,
      currentValue: Number.isFinite(currentValue) ? currentValue : null,
      line: def.line(status, currentValue, cap),
    };
  });

  const total = legs.length;
  const checkable = legs.filter((l) => l.status !== "nodata");
  const brokenCount = checkable.filter((l) => l.status === "broken").length;
  const weakeningCount = checkable.filter(
    (l) => l.status === "weakening",
  ).length;
  const intactCount = legs.filter((l) => l.status === "intact").length;

  let status = "intact";
  if (checkable.length && brokenCount * 2 >= checkable.length) {
    status = "broken";
  } else if (brokenCount >= 1 || weakeningCount >= 2) {
    status = "watch";
  }

  let line;
  if (status === "broken") {
    const firstBroken = legs.find((l) => l.status === "broken");
    line = `Only ${intactCount} of ${total} reasons you'd own it still hold — ${firstBroken.label.toLowerCase()} has broken down since the thesis was set.`;
  } else {
    line = `The reasons you'd own it: ${intactCount} of ${total} still hold.`;
  }

  return { status, legs, line };
}
