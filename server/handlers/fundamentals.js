import { fetchFundamentalsData } from "../lib/marketData.js";
import { errorResponse, jsonResponse, requireParams } from "../lib/response.js";

export async function fetchFundamentals(params, corsOrigin) {
  const missing = requireParams(params, ["symbol", "start", "end"], corsOrigin);
  if (missing) return missing;

  try {
    const data = await fetchFundamentalsData(params.symbol, {
      start: params.start,
      end: params.end,
    });
    return jsonResponse(200, data, corsOrigin);
  } catch (err) {
    console.error("fundamentals error:", err);
    return errorResponse(502, err.message, corsOrigin);
  }
}
