import { fetchAnalysis } from "./handlers/analysis.js";
import { fetchArticle } from "./handlers/article.js";
import { fetchArticles } from "./handlers/articles.js";
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
  "analysis",
  "news",
  "article",
  "articles",
  "trending",
  "search",
];

// Lambda Function URLs deliver POST bodies as a (sometimes base64-encoded)
// string. Parse defensively so a malformed body becomes {} rather than a 500.
function parseBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

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
      case "analysis":
        return await fetchAnalysis(params, corsOrigin);
      case "news":
        return await fetchNews(params, corsOrigin);
      case "article":
        return await fetchArticle(params, corsOrigin);
      case "articles":
        return await fetchArticles(parseBody(event), corsOrigin);
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
