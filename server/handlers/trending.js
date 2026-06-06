import { yahooFinance } from "../lib/yahooFinance.js";
import { errorResponse, jsonResponse } from "../lib/response.js";
import { num } from "../lib/yahooUtils.js";

export async function fetchTrending(corsOrigin) {
  try {
    const trending = await yahooFinance.trendingSymbols(
      "US",
      { count: 50 },
      { validateResult: false },
    );

    const symbols = (trending?.quotes ?? [])
      .map((q) => q.symbol)
      .filter(Boolean);
    if (!symbols.length) {
      return jsonResponse(200, [], corsOrigin);
    }

    // Trending lists include private companies & other types that fail
    // yahoo-finance2's quote schema — skip validation, filter to equities below.
    const quotes = await yahooFinance.quote(symbols, {}, { validateResult: false });
    const quoteList = Array.isArray(quotes) ? quotes : [quotes];

    const stocks = quoteList
      .filter((q) => q?.quoteType === "EQUITY" && q.symbol)
      .slice(0, 12)
      .map((q) => ({
        symbol: q.symbol,
        name: q.shortName || q.longName || q.symbol,
        price: num(q.regularMarketPrice),
        changePercent: num(q.regularMarketChangePercent),
      }))
      .filter((q) => Number.isFinite(q.price));

    return jsonResponse(200, stocks, corsOrigin);
  } catch (err) {
    console.error("trending error:", err);
    return errorResponse(502, err.message, corsOrigin);
  }
}
