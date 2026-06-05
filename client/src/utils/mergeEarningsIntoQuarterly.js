import { toIsoDate } from "../db/utils";

// Quarter-end dates can differ by a few days between the fundamentals feed
// and the earnings endpoint — bucket by calendar quarter for matching.
function quarterKey(isoDate) {
  const d = new Date(toIsoDate(isoDate));
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3)}`;
}

/**
 * Overlay analyst earnings (EPS, revenue, profit) onto quarterly financials
 * rows. Creates earnings-only rows when the fundamentals time series hasn't
 * caught up yet.
 */
export function mergeEarningsIntoQuarterly(quarterly = [], earnings = []) {
  if (!earnings.length) return quarterly;

  const byQuarter = new Map();
  for (const e of earnings) {
    const key = quarterKey(e.date);
    if (key) byQuarter.set(key, e);
  }

  const matchedKeys = new Set();
  const merged = quarterly.map((row) => {
    const key = quarterKey(row.date);
    const match = key ? byQuarter.get(key) : null;
    if (!match) return row;
    matchedKeys.add(key);
    return {
      ...row,
      totalRevenue: row.totalRevenue ?? match.revenueActual ?? null,
      netIncome: row.netIncome ?? match.netIncomeActual ?? null,
      dilutedEPS: row.dilutedEPS ?? null,
      epsActual: match.epsActual ?? null,
      epsEstimate: match.epsEstimate ?? null,
      epsDifference: match.epsDifference ?? null,
      surprisePercent: match.surprisePercent ?? null,
      reportedDate: match.reportedDate ?? null,
      revenueActual: match.revenueActual ?? null,
      netIncomeActual: match.netIncomeActual ?? null,
      profitMargin: match.profitMargin ?? null,
    };
  });

  const earningsOnly = earnings
    .filter((e) => {
      const key = quarterKey(e.date);
      return key && !matchedKeys.has(key);
    })
    .map((e) => ({
      date: toIsoDate(e.date),
      totalRevenue: e.revenueActual ?? null,
      netIncome: e.netIncomeActual ?? null,
      dilutedEPS: null,
      epsActual: e.epsActual ?? null,
      epsEstimate: e.epsEstimate ?? null,
      epsDifference: e.epsDifference ?? null,
      surprisePercent: e.surprisePercent ?? null,
      reportedDate: e.reportedDate ?? null,
      revenueActual: e.revenueActual ?? null,
      netIncomeActual: e.netIncomeActual ?? null,
      profitMargin: e.profitMargin ?? null,
      earningsOnly: true,
    }));

  return [...earningsOnly, ...merged];
}
