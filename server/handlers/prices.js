import { fetchChartData } from "../lib/marketData.js";
import { errorResponse, jsonResponse, requireParams } from "../lib/response.js";

export async function fetchPrices(params, corsOrigin) {
  const missing = requireParams(params, ["symbol", "start", "end"], corsOrigin);
  if (missing) return missing;

  try {
    const data = await fetchChartData(params.symbol, params.start, params.end);
    return jsonResponse(200, data, corsOrigin);
  } catch (err) {
    console.error("prices error:", err);
    return errorResponse(502, err.message, corsOrigin);
  }
}
