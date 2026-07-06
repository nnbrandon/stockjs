import { yahooFinance } from "../lib/yahooFinance.js";
import { errorResponse, jsonResponse, requireParams } from "../lib/response.js";
import { fetchEarningsHistory } from "./earningsHistory.js";

// Reporting-period ends usually match exactly across statement modules; the
// tolerance absorbs the occasional off-by-days period end.
const MERGE_TOLERANCE_MS = 10 * 24 * 60 * 60 * 1000;

// One fundamentalsTimeSeries call, resolved to [] on failure so a missing
// statement module (common for foreign listings, ADRs, funds) never wipes out
// the income-statement data the client already depends on.
function fetchModule(symbol, params, type, module) {
  return yahooFinance
    .fundamentalsTimeSeries(
      symbol,
      { period1: params.start, period2: params.end, type, module },
      { validateResult: false },
    )
    .then((rows) => (Array.isArray(rows) ? rows : []))
    .catch((err) => {
      console.error(`fundamentals ${module}/${type} failed:`, err.message);
      return [];
    });
}

// Merge statement rows from different modules into one row per reporting
// date. Rows merge on exact date first, then nearest-within-tolerance, so the
// client keeps seeing a single quarterly/annual series with income-statement,
// cash-flow, and balance-sheet fields side by side.
function mergeRowsByDate(base, ...extraArrays) {
  const rows = base.map((r) => ({ ...r }));
  const timeOf = (r) => new Date(r.date).getTime();

  for (const extras of extraArrays) {
    for (const extra of extras) {
      const t = timeOf(extra);
      if (!Number.isFinite(t)) continue;

      let best = null;
      let bestDiff = Infinity;
      for (const row of rows) {
        const diff = Math.abs(timeOf(row) - t);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = row;
        }
      }
      if (best && bestDiff <= MERGE_TOLERANCE_MS) {
        // Income-statement fields win any name collision.
        for (const [k, v] of Object.entries(extra)) {
          if (!(k in best)) best[k] = v;
        }
      } else {
        rows.push({ ...extra });
      }
    }
  }
  return rows;
}

export async function fetchFundamentals(params, corsOrigin) {
  const missing = requireParams(params, ["symbol", "start", "end"], corsOrigin);
  if (missing) return missing;

  try {
    const [
      quarterlyIncome,
      annualIncome,
      quarterlyCashFlow,
      annualCashFlow,
      quarterlyBalance,
      annualBalance,
      earningsResult,
    ] = await Promise.all([
      fetchModule(params.symbol, params, "quarterly", "financials"),
      fetchModule(params.symbol, params, "annual", "financials"),
      fetchModule(params.symbol, params, "quarterly", "cash-flow"),
      fetchModule(params.symbol, params, "annual", "cash-flow"),
      fetchModule(params.symbol, params, "quarterly", "balance-sheet"),
      fetchModule(params.symbol, params, "annual", "balance-sheet"),
      fetchEarningsHistory(params.symbol),
    ]);

    return jsonResponse(
      200,
      {
        quarterlyResult: mergeRowsByDate(
          quarterlyIncome,
          quarterlyCashFlow,
          quarterlyBalance,
        ),
        annualResult: mergeRowsByDate(annualIncome, annualCashFlow, annualBalance),
        earningsResult,
      },
      corsOrigin,
    );
  } catch (err) {
    console.error("fundamentals error:", err);
    return errorResponse(502, err.message, corsOrigin);
  }
}
