import { fetchArticle } from "./handlers/article.js";
import { fetchFundamentals } from "./handlers/fundamentals.js";
import { fetchNews } from "./handlers/news.js";
import { fetchPrices } from "./handlers/prices.js";
import { fetchQuote } from "./handlers/quote.js";
import { fetchSymbolSearch } from "./handlers/search.js";
import { fetchTrending } from "./handlers/trending.js";
import {
  corsPreflightResponse,
  errorResponse,
  resolveCorsOrigin,
} from "./lib/response.js";

const VALID_ACTIONS = [
  "prices",
  "quote",
  "fundamentals",
  "news",
  "article",
  "trending",
  "search",
];

export const handler = async (event) => {
  const corsOrigin = resolveCorsOrigin(event.headers || {});

  if (
    event.httpMethod === "OPTIONS" ||
    event.requestContext?.http?.method === "OPTIONS"
  ) {
    return corsPreflightResponse(corsOrigin);
  }

  try {
    const params = event.queryStringParameters || {};
    const action = params.action;

    switch (action) {
      case "prices":
        return await fetchPrices(params, corsOrigin);
      case "quote":
        return await fetchQuote(params, corsOrigin);
      case "fundamentals":
        return await fetchFundamentals(params, corsOrigin);
      case "news":
        return await fetchNews(params, corsOrigin);
      case "article":
        return await fetchArticle(params, corsOrigin);
      case "trending":
        return await fetchTrending(corsOrigin);
      case "search":
        return await fetchSymbolSearch(params, corsOrigin);
      default:
        return errorResponse(
          400,
          `Invalid action. Use action=${VALID_ACTIONS.join(", action=")}`,
          corsOrigin,
        );
    }
  } catch (err) {
    console.error("Unhandled handler error:", err);
    return errorResponse(500, err.message || "Internal error", corsOrigin);
  }
};
