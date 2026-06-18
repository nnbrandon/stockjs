import { yahooFinance } from "../lib/yahooFinance.js";
import { errorResponse, jsonResponse, requireParams } from "../lib/response.js";

// Batch quote lookup for extended-hours (pre/post-market) prices. The daily
// `chart` candle freezes at the 4pm close, so after-hours moves only show up on
// the quote endpoint's pre/post-market fields. One call covers the whole
// watchlist (Yahoo's quote accepts an array), so this is cheap even when polled.
export async function fetchQuote(params, corsOrigin) {
  const missing = requireParams(params, ["symbols"], corsOrigin);
  if (missing) return missing;

  const symbols = params.symbols
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (!symbols.length) return jsonResponse(200, [], corsOrigin);

  try {
    const result = await yahooFinance.quote(
      symbols,
      {},
      { validateResult: false },
    );
    const list = Array.isArray(result) ? result : [result];

    const quotes = list
      .filter((q) => q?.symbol)
      .map((q) => ({
        symbol: q.symbol,
        marketState: q.marketState ?? null,
        regularMarketPrice: q.regularMarketPrice ?? null,
        regularMarketChange: q.regularMarketChange ?? null,
        regularMarketChangePercent: q.regularMarketChangePercent ?? null,
        preMarketPrice: q.preMarketPrice ?? null,
        preMarketChange: q.preMarketChange ?? null,
        preMarketChangePercent: q.preMarketChangePercent ?? null,
        preMarketTime: q.preMarketTime ?? null,
        postMarketPrice: q.postMarketPrice ?? null,
        postMarketChange: q.postMarketChange ?? null,
        postMarketChangePercent: q.postMarketChangePercent ?? null,
        postMarketTime: q.postMarketTime ?? null,
      }));

    return jsonResponse(200, quotes, corsOrigin);
  } catch (err) {
    console.error("quote error:", err);
    return errorResponse(502, err.message, corsOrigin);
  }
}
