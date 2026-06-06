import { yahooFinance } from "../lib/yahooFinance.js";
import { num, toIso } from "../lib/yahooUtils.js";

// Match a fundamentals/earningsHistory quarter-end to the earnings chart's
// reportedDate. Dates can differ by a few days across Yahoo modules.
const findReportedDate = (quarterIso, chart = []) => {
  if (!quarterIso) return null;
  const target = new Date(quarterIso).getTime();
  if (!Number.isFinite(target)) return null;

  let best = null;
  let bestDelta = Infinity;
  for (const row of chart) {
    const end = toIso(row.periodEndDate);
    const reported = toIso(row.reportedDate);
    if (!end || !reported) continue;
    const delta = Math.abs(new Date(end).getTime() - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = reported;
    }
  }
  // Quarter-end vs. period-end can be up to ~45 days apart for some symbols.
  return bestDelta <= 45 * 24 * 60 * 60 * 1000 ? best : null;
};

// Yahoo's earnings.financialsChart has quarterly revenue & profit (often available
// before the fundamentals time series updates).
const findFinancialsRow = (quarterIso, chart = [], financials = []) => {
  if (!quarterIso) return null;
  const target = new Date(quarterIso).getTime();
  if (!Number.isFinite(target)) return null;

  let matchedChart = null;
  let bestDelta = Infinity;
  for (const row of chart) {
    const end = toIso(row.periodEndDate);
    if (!end) continue;
    const delta = Math.abs(new Date(end).getTime() - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      matchedChart = row;
    }
  }
  if (!matchedChart || bestDelta > 45 * 24 * 60 * 60 * 1000) return null;

  const fiscalQuarter = matchedChart.fiscalQuarter;
  return financials.find((f) => f.fiscalQuarter === fiscalQuarter) ?? null;
};

// Analyst EPS estimates vs. actuals (the "beat/miss" signal). Best-effort:
// returns [] if the module is unavailable so it never breaks the fundamentals
// response.
export async function fetchEarningsHistory(symbol) {
  try {
    const res = await yahooFinance.quoteSummary(
      symbol,
      { modules: ["earningsHistory", "earnings", "calendarEvents"] },
      { validateResult: false },
    );
    const chart = res?.earnings?.earningsChart?.quarterly ?? [];
    const financials = res?.earnings?.financialsChart?.quarterly ?? [];

    const history = (res?.earningsHistory?.history ?? [])
      .map((h) => {
        const epsActual = num(h.epsActual);
        const epsEstimate = num(h.epsEstimate);
        const epsDifference = num(h.epsDifference);
        const date = toIso(h.quarter);
        const fin = findFinancialsRow(date, chart, financials);
        // Compute the surprise ourselves — Yahoo's surprisePercent is
        // inconsistently a fraction vs. a percentage across symbols.
        const surprisePercent =
          Number.isFinite(epsActual) &&
          Number.isFinite(epsEstimate) &&
          epsEstimate !== 0
            ? ((epsActual - epsEstimate) / Math.abs(epsEstimate)) * 100
            : null;
        return {
          date,
          epsActual,
          epsEstimate,
          epsDifference:
            epsDifference ??
            (Number.isFinite(epsActual) && Number.isFinite(epsEstimate)
              ? epsActual - epsEstimate
              : null),
          surprisePercent,
          reportedDate: findReportedDate(date, chart),
          revenueActual: fin?.revenue ?? null,
          netIncomeActual: fin?.earnings ?? null,
          profitMargin: fin?.profitMargin ?? null,
        };
      })
      .filter((h) => h.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Fallback: earnings call date is often the announcement day.
    if (history.length && !history[0].reportedDate) {
      const now = Date.now();
      const callDate = (res?.calendarEvents?.earnings?.earningsCallDate ?? [])
        .map((d) => toIso(d))
        .filter((d) => d && new Date(d).getTime() <= now)
        .sort((a, b) => new Date(b) - new Date(a))[0];
      if (callDate) history[0].reportedDate = callDate;
    }

    return { history, reportedDate: history[0]?.reportedDate ?? null };
  } catch (err) {
    console.error("earningsHistory error:", err);
    return { history: [], reportedDate: null };
  }
}
