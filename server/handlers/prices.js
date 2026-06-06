import { yahooFinance } from "../lib/yahooFinance.js";
import { errorResponse, jsonResponse, requireParams } from "../lib/response.js";

export async function fetchPrices(params, corsOrigin) {
  const missing = requireParams(params, ["symbol", "start", "end"], corsOrigin);
  if (missing) return missing;

  try {
    const data = await yahooFinance.chart(
      params.symbol,
      {
        period1: params.start,
        period2: params.end,
      },
      { validateResult: false },
    );

    return jsonResponse(200, data, corsOrigin);
  } catch (err) {
    console.error("prices error:", err);
    return errorResponse(502, err.message, corsOrigin);
  }
}
