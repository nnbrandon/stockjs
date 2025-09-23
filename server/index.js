import yahooFinance from "yahoo-finance2";
import axios from "axios";

const allowedOrigins = ["http://localhost:5173", "https://nnbrandon.github.io"];

export const handler = async (event) => {
  const origin = event.headers.origin;
  const corsOrigin = allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0];

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": corsOrigin,
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    };
  }

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
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": corsOrigin,
        },
        body: JSON.stringify({
          error:
            "Invalid action. Use action=prices, action=fundamentals  or action=news",
        }),
      };
  }
};

const fetchPrices = async (params, corsOrigin) => {
  try {
    // Read query parameters from Lambda Function URL
    const symbol = params.symbol;
    const start = params.start;
    const end = params.end;

    if (!symbol) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": corsOrigin,
        },
        body: JSON.stringify({ error: "Missing symbol query param" }),
      };
    }

    if (!start) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": corsOrigin,
        },
        body: JSON.stringify({ error: "Missing start query param" }),
      };
    }

    if (!end) {
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": corsOrigin,
        },
        body: JSON.stringify({ error: "Missing end query param" }),
      };
    }

    const data = await yahooFinance.chart(symbol, {
      period1: start,
      period2: end,
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": corsOrigin, // Allow your React frontend
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": corsOrigin,
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

const fetchFundamentals = async (params, corsOrigin) => {
  const start = params.start;
  const end = params.end;
  const symbol = params.symbol;

  if (!symbol) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": corsOrigin,
      },
      body: JSON.stringify({ error: "Missing symbol query param" }),
    };
  }

  if (!start) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": corsOrigin,
      },
      body: JSON.stringify({ error: "Missing start query param" }),
    };
  }

  if (!end) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": corsOrigin,
      },
      body: JSON.stringify({ error: "Missing end query param" }),
    };
  }

  try {
    const [quarterlyResult, annualResult] = await Promise.all([
      yahooFinance.fundamentalsTimeSeries(symbol, {
        period1: start,
        period2: end,
        type: "quarterly",
        module: "financials",
      }),
      yahooFinance.fundamentalsTimeSeries(symbol, {
        period1: start,
        period2: end,
        type: "annual",
        module: "financials",
      }),
    ]);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": corsOrigin,
      },
      body: JSON.stringify({ quarterlyResult, annualResult }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": corsOrigin,
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
};

const fetchNews = async (params, corsOrigin) => {
  const symbol = params.symbol;

  if (!symbol) {
    return {
      statusCode: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": corsOrigin,
      },
      body: JSON.stringify({ error: "Missing symbol query param" }),
    };
  }

  try {
    const { data } = await axios.get(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${symbol}&lang=en-US&region=US&quotesCount=6&newsCount=20`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
      }
    );
    const news = data?.news.map((item) => ({
      id: item.uuid,
      title: item.title,
      publisher: item.publisher,
      link: item.link,
      date: new Date(item.providerPublishTime * 1000).toISOString(),
      thumbnail: item.thumbnail,
    }));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": corsOrigin, // Allow your React frontend
      },
      body: JSON.stringify(news),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": corsOrigin,
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
