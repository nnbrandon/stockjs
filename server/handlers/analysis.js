import { fetchAnalysisData } from "../lib/marketData.js";
import { jsonResponse, requireParams } from "../lib/response.js";

export async function fetchAnalysis(params, corsOrigin) {
  const missing = requireParams(params, ["symbol"], corsOrigin);
  if (missing) return missing;

  try {
    const data = await fetchAnalysisData(params.symbol);
    return jsonResponse(200, data, corsOrigin);
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
