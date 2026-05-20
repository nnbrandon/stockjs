import YahooFinance from "yahoo-finance2";

// Reuse one client across warm Lambda invocations so cookies/crumb are cached.
const yahooFinance = new YahooFinance();

const allowedOrigins = ["http://localhost:5173", "https://nnbrandon.github.io"];

const jsonResponse = (statusCode, body, corsOrigin) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": corsOrigin,
  },
  body: JSON.stringify(body),
});

const errorResponse = (statusCode, message, corsOrigin) =>
  jsonResponse(statusCode, { error: message }, corsOrigin);

const requireParams = (params, keys, corsOrigin) => {
  for (const key of keys) {
    if (!params[key]) {
      return errorResponse(400, `Missing ${key} query param`, corsOrigin);
    }
  }
  return null;
};

export const handler = async (event) => {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin;
  const corsOrigin = allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0];

  // CORS preflight
  if (
    event.httpMethod === "OPTIONS" ||
    event.requestContext?.http?.method === "OPTIONS"
  ) {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Max-Age": "86400",
      },
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const action = params.action;

    switch (action) {
      case "prices":
        return await fetchPrices(params, corsOrigin);
      case "fundamentals":
        return await fetchFundamentals(params, corsOrigin);
      case "news":
        return await fetchNews(params, corsOrigin);
      default:
        return errorResponse(
          400,
          "Invalid action. Use action=prices, action=fundamentals, or action=news",
          corsOrigin,
        );
    }
  } catch (err) {
    console.error("Unhandled handler error:", err);
    return errorResponse(500, err.message || "Internal error", corsOrigin);
  }
};

const fetchPrices = async (params, corsOrigin) => {
  const missing = requireParams(params, ["symbol", "start", "end"], corsOrigin);
  if (missing) return missing;

  try {
    const data = await yahooFinance.chart(params.symbol, {
      period1: params.start,
      period2: params.end,
    });

    return jsonResponse(200, data, corsOrigin);
  } catch (err) {
    console.error("prices error:", err);
    return errorResponse(502, err.message, corsOrigin);
  }
};

const fetchFundamentals = async (params, corsOrigin) => {
  const missing = requireParams(params, ["symbol", "start", "end"], corsOrigin);
  if (missing) return missing;

  try {
    const [quarterlyResult, annualResult] = await Promise.all([
      yahooFinance.fundamentalsTimeSeries(params.symbol, {
        period1: params.start,
        period2: params.end,
        type: "quarterly",
        module: "financials",
      }),
      yahooFinance.fundamentalsTimeSeries(params.symbol, {
        period1: params.start,
        period2: params.end,
        type: "annual",
        module: "financials",
      }),
    ]);

    return jsonResponse(200, { quarterlyResult, annualResult }, corsOrigin);
  } catch (err) {
    console.error("fundamentals error:", err);
    return errorResponse(502, err.message, corsOrigin);
  }
};

const fetchNews = async (params, corsOrigin) => {
  const missing = requireParams(params, ["symbol"], corsOrigin);
  if (missing) return missing;

  try {
    const result = await yahooFinance.search(params.symbol, {
      lang: "en-US",
      region: "US",
      quotesCount: 6,
      newsCount: 20,
    });

    const news = (result?.news ?? []).map((item) => ({
      id: item.uuid,
      title: item.title,
      publisher: item.publisher,
      link: item.link,
      // v3 returns a Date for providerPublishTime; older shape was unix-seconds.
      date:
        item.providerPublishTime instanceof Date
          ? item.providerPublishTime.toISOString()
          : typeof item.providerPublishTime === "number"
            ? new Date(item.providerPublishTime * 1000).toISOString()
            : new Date(item.providerPublishTime).toISOString(),
      thumbnail: item.thumbnail,
    }));

    return jsonResponse(200, news, corsOrigin);
  } catch (err) {
    console.error("news error:", err);
    return errorResponse(502, err.message, corsOrigin);
  }
};
