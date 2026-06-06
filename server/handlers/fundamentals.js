import { yahooFinance } from "../lib/yahooFinance.js";
import { errorResponse, jsonResponse, requireParams } from "../lib/response.js";
import { fetchEarningsHistory } from "./earningsHistory.js";

export async function fetchFundamentals(params, corsOrigin) {
  const missing = requireParams(params, ["symbol", "start", "end"], corsOrigin);
  if (missing) return missing;

  try {
    const [quarterlyResult, annualResult, earningsResult] = await Promise.all([
      yahooFinance.fundamentalsTimeSeries(
        params.symbol,
        {
          period1: params.start,
          period2: params.end,
          type: "quarterly",
          module: "financials",
        },
        { validateResult: false },
      ),
      yahooFinance.fundamentalsTimeSeries(
        params.symbol,
        {
          period1: params.start,
          period2: params.end,
          type: "annual",
          module: "financials",
        },
        { validateResult: false },
      ),
      fetchEarningsHistory(params.symbol),
    ]);

    return jsonResponse(
      200,
      { quarterlyResult, annualResult, earningsResult },
      corsOrigin,
    );
  } catch (err) {
    console.error("fundamentals error:", err);
    return errorResponse(502, err.message, corsOrigin);
  }
}
