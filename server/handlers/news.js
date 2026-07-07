import { fetchNewsData } from "../lib/marketData.js";
import { errorResponse, jsonResponse, requireParams } from "../lib/response.js";

export async function fetchNews(params, corsOrigin) {
  const missing = requireParams(params, ["symbol"], corsOrigin);
  if (missing) return missing;

  try {
    const news = await fetchNewsData(params.symbol);
    return jsonResponse(200, news, corsOrigin);
  } catch (err) {
    console.error("news error:", err);
    return errorResponse(502, err.message, corsOrigin);
  }
}
