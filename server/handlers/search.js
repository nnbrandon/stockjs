import { yahooFinance } from "../lib/yahooFinance.js";
import { errorResponse, jsonResponse, requireParams } from "../lib/response.js";

const SEARCHABLE_QUOTE_TYPES = new Set(["EQUITY", "ETF"]);

export async function fetchSymbolSearch(params, corsOrigin) {
  const missing = requireParams(params, ["q"], corsOrigin);
  if (missing) return missing;

  const q = params.q.trim();
  if (!q) return jsonResponse(200, [], corsOrigin);

  try {
    const result = await yahooFinance.search(
      q,
      {
        lang: "en-US",
        region: "US",
        quotesCount: 12,
        newsCount: 0,
      },
      { validateResult: false },
    );

    const quotes = (result?.quotes ?? [])
      .filter(
        (item) => item?.symbol && SEARCHABLE_QUOTE_TYPES.has(item.quoteType),
      )
      .map((item) => ({
        symbol: item.symbol,
        name: item.shortname || item.longname || item.symbol,
        quoteType: item.quoteType,
        exchange: item.exchDisp || item.exchange || null,
      }));

    return jsonResponse(200, quotes, corsOrigin);
  } catch (err) {
    console.error("search error:", err);
    return errorResponse(502, err.message, corsOrigin);
  }
}
