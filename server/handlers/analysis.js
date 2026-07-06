import { yahooFinance } from "../lib/yahooFinance.js";
import { errorResponse, jsonResponse, requireParams } from "../lib/response.js";

// Forward-looking analyst data: estimate revisions, forward valuation,
// consensus. Flattened to a stable shape — Yahoo's nesting churns, and the
// client caches this, so the contract must not.
const num = (v) => (Number.isFinite(v) ? v : Number.isFinite(v?.raw) ? v.raw : null);

function trendFor(earningsTrend, period) {
  return earningsTrend?.trend?.find((t) => t.period === period) ?? null;
}

export async function fetchAnalysis(params, corsOrigin) {
  const missing = requireParams(params, ["symbol"], corsOrigin);
  if (missing) return missing;

  try {
    const result = await yahooFinance.quoteSummary(
      params.symbol,
      { modules: ["earningsTrend", "financialData", "defaultKeyStatistics"] },
      { validateResult: false },
    );

    const nextYear = trendFor(result?.earningsTrend, "+1y");
    const epsTrend = nextYear?.epsTrend ?? {};
    const revisions = nextYear?.epsRevisions ?? {};
    const fin = result?.financialData ?? {};
    const stats = result?.defaultKeyStatistics ?? {};

    return jsonResponse(
      200,
      {
        symbol: params.symbol.toUpperCase(),
        fetchedAt: new Date().toISOString(),
        forwardEps: num(epsTrend.current),
        eps30dAgo: num(epsTrend["30daysAgo"]),
        eps90dAgo: num(epsTrend["90daysAgo"]),
        forwardEpsGrowth: num(nextYear?.growth),
        revisionsUp30d: num(revisions.upLast30days),
        revisionsDown30d: num(revisions.downLast30days),
        analystCount: num(nextYear?.earningsEstimate?.numberOfAnalysts),
        targetMeanPrice: num(fin.targetMeanPrice),
        recommendationMean: num(fin.recommendationMean),
        recommendationKey: fin.recommendationKey ?? null,
        forwardPE: num(stats.forwardPE),
        pegRatio: num(stats.pegRatio),
        beta: num(stats.beta),
      },
      corsOrigin,
    );
  } catch (err) {
    // Thin coverage (funds, small caps, foreign listings) is normal — return
    // an empty payload rather than an error so the client caches "nothing".
    console.error(`analysis ${params.symbol} failed:`, err.message);
    return jsonResponse(
      200,
      { symbol: params.symbol.toUpperCase(), fetchedAt: new Date().toISOString() },
      corsOrigin,
    );
  }
}
