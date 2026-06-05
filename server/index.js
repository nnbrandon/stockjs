import YahooFinance from "yahoo-finance2";
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";

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
      case "article":
        return await fetchArticle(params, corsOrigin);
      default:
        return errorResponse(
          400,
          "Invalid action. Use action=prices, action=fundamentals, action=news, or action=article",
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
    const data = await yahooFinance.chart(
      params.symbol,
      {
        period1: params.start,
        period2: params.end,
      },
      { validateResult: false },
    );

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
};

// Yahoo sometimes wraps numbers as { raw, fmt }; sometimes they're plain.
const num = (v) =>
  v && typeof v === "object" && "raw" in v
    ? v.raw
    : typeof v === "number"
      ? v
      : null;

const toIso = (v) => {
  if (!v) return null;
  const d =
    v instanceof Date ? v : new Date(num(v) != null ? num(v) * 1000 : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// Analyst EPS estimates vs. actuals (the "beat/miss" signal). Best-effort:
// returns [] if the module is unavailable so it never breaks the fundamentals
// response. Note these EPS figures are analyst-basis and can differ from the
// GAAP dilutedEPS in the financials time series.
// Match a fundamentals/earningsHistory quarter-end to the earnings chart's
// reportedDate. Dates can differ by a few days across Yahoo modules.
const findReportedDate = (quarterIso, chart = []) => {
  if (!quarterIso) return null;
  const target = new Date(quarterIso).getTime();
  if (!Number.isFinite(target)) return null;

  let best = null;
  let bestDelta = Infinity;
  for (const row of chart) {
    const end = toIso(row.periodEndDate);
    const reported = toIso(row.reportedDate);
    if (!end || !reported) continue;
    const delta = Math.abs(new Date(end).getTime() - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = reported;
    }
  }
  // Quarter-end vs. period-end can be up to ~45 days apart for some symbols.
  return bestDelta <= 45 * 24 * 60 * 60 * 1000 ? best : null;
};

// Yahoo's earnings.financialsChart has quarterly revenue & profit (often available
// before the fundamentals time series updates).
const findFinancialsRow = (quarterIso, chart = [], financials = []) => {
  if (!quarterIso) return null;
  const target = new Date(quarterIso).getTime();
  if (!Number.isFinite(target)) return null;

  let matchedChart = null;
  let bestDelta = Infinity;
  for (const row of chart) {
    const end = toIso(row.periodEndDate);
    if (!end) continue;
    const delta = Math.abs(new Date(end).getTime() - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      matchedChart = row;
    }
  }
  if (!matchedChart || bestDelta > 45 * 24 * 60 * 60 * 1000) return null;

  const fiscalQuarter = matchedChart.fiscalQuarter;
  return financials.find((f) => f.fiscalQuarter === fiscalQuarter) ?? null;
};

const fetchEarningsHistory = async (symbol) => {
  try {
    const res = await yahooFinance.quoteSummary(
      symbol,
      { modules: ["earningsHistory", "earnings", "calendarEvents"] },
      { validateResult: false },
    );
    const chart = res?.earnings?.earningsChart?.quarterly ?? [];
    const financials = res?.earnings?.financialsChart?.quarterly ?? [];

    const history = (res?.earningsHistory?.history ?? [])
      .map((h) => {
        const epsActual = num(h.epsActual);
        const epsEstimate = num(h.epsEstimate);
        const epsDifference = num(h.epsDifference);
        const date = toIso(h.quarter);
        const fin = findFinancialsRow(date, chart, financials);
        // Compute the surprise ourselves — Yahoo's surprisePercent is
        // inconsistently a fraction vs. a percentage across symbols.
        const surprisePercent =
          Number.isFinite(epsActual) &&
          Number.isFinite(epsEstimate) &&
          epsEstimate !== 0
            ? ((epsActual - epsEstimate) / Math.abs(epsEstimate)) * 100
            : null;
        return {
          date,
          epsActual,
          epsEstimate,
          epsDifference:
            epsDifference ??
            (Number.isFinite(epsActual) && Number.isFinite(epsEstimate)
              ? epsActual - epsEstimate
              : null),
          surprisePercent,
          reportedDate: findReportedDate(date, chart),
          revenueActual: fin?.revenue ?? null,
          netIncomeActual: fin?.earnings ?? null,
          profitMargin: fin?.profitMargin ?? null,
        };
      })
      .filter((h) => h.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    // Fallback: earnings call date is often the announcement day.
    if (history.length && !history[0].reportedDate) {
      const now = Date.now();
      const callDate = (res?.calendarEvents?.earnings?.earningsCallDate ?? [])
        .map((d) => toIso(d))
        .filter((d) => d && new Date(d).getTime() <= now)
        .sort((a, b) => new Date(b) - new Date(a))[0];
      if (callDate) history[0].reportedDate = callDate;
    }

    return { history, reportedDate: history[0]?.reportedDate ?? null };
  } catch (err) {
    console.error("earningsHistory error:", err);
    return { history: [], reportedDate: null };
  }
};

const fetchNews = async (params, corsOrigin) => {
  const missing = requireParams(params, ["symbol"], corsOrigin);
  if (missing) return missing;

  try {
    const result = await yahooFinance.search(
      params.symbol,
      {
        lang: "en-US",
        region: "US",
        quotesCount: 6,
        newsCount: 20,
      },
      { validateResult: false },
    );

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

// ─────────────────────── Article text extraction ───────────────────────
// Server-side fetch of a news article URL + lightweight readable-text
// extraction. Done here (not in the browser) because publishers don't send
// CORS headers, so the browser can't read their responses. Best-effort:
// returns { ok:false } for timeouts, non-HTML, paywalls, or blocked requests
// rather than failing the request.

const ARTICLE_TIMEOUT_MS = 4500;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

const decodeEntities = (s = "") =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));

const stripTags = (html = "") => html.replace(/<[^>]+>/g, " ");
const collapse = (s = "") => s.replace(/\s+/g, " ").trim();
const clean = (s) => collapse(decodeEntities(stripTags(s)));

const metaContent = (html, ...names) => {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`,
      "i",
    );
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
    if (content) return collapse(decodeEntities(content));
  }
  return "";
};

const extractParagraphs = (html) => {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  const paragraphs = [];
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = re.exec(cleaned)) && paragraphs.length < 12) {
    const text = clean(match[1]);
    // Skip nav/cookie/boilerplate fragments.
    if (text.length >= 40) paragraphs.push(text);
  }
  return paragraphs.join(" ");
};

const MAX_ARTICLE_BYTES = 600_000;
// Yahoo (and many news sites) reply with a huge stack of Set-Cookie/consent
// headers that exceed Node's default 16KB HTTP header limit, which makes the
// global `fetch` (undici) throw UND_ERR_HEADERS_OVERFLOW before we ever see the
// body. Node's http/https modules accept a per-request `maxHeaderSize`, so we
// use them directly — no `--max-http-header-size` launch flag required.
const MAX_HEADER_SIZE = 256 * 1024;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const httpGetHtml = (
  urlStr,
  { timeout = ARTICLE_TIMEOUT_MS, maxRedirects = 5 } = {},
) =>
  new Promise((resolve, reject) => {
    let redirects = 0;

    const visit = (current) => {
      let target;
      try {
        target = new URL(current);
      } catch {
        return reject(new Error("invalid-url"));
      }
      if (!ALLOWED_PROTOCOLS.has(target.protocol)) {
        return reject(new Error("bad-protocol"));
      }

      const lib = target.protocol === "https:" ? https : http;
      const req = lib.request(
        target,
        {
          method: "GET",
          maxHeaderSize: MAX_HEADER_SIZE,
          headers: {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "en-US,en;q=0.9",
          },
        },
        (res) => {
          const status = res.statusCode || 0;
          const location = res.headers.location;

          // Follow redirects manually.
          if (status >= 300 && status < 400 && location) {
            res.resume();
            if (redirects++ >= maxRedirects) {
              return reject(new Error("too-many-redirects"));
            }
            return visit(new URL(location, target).toString());
          }

          const contentType = res.headers["content-type"] || "";
          const encoding = (
            res.headers["content-encoding"] || ""
          ).toLowerCase();
          let stream = res;
          if (encoding === "gzip") stream = res.pipe(zlib.createGunzip());
          else if (encoding === "deflate")
            stream = res.pipe(zlib.createInflate());
          else if (encoding === "br")
            stream = res.pipe(zlib.createBrotliDecompress());

          const chunks = [];
          let bytes = 0;
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            resolve({
              status,
              contentType,
              html: Buffer.concat(chunks).toString("utf8"),
            });
          };

          stream.on("data", (c) => {
            bytes += c.length;
            if (bytes <= MAX_ARTICLE_BYTES) {
              chunks.push(c);
            } else {
              // Got enough — stop reading and resolve with what we have.
              res.destroy();
              finish();
            }
          });
          stream.on("end", finish);
          stream.on("error", (e) => {
            if (!settled) reject(e);
          });
        },
      );

      req.on("error", reject);
      req.setTimeout(timeout, () => req.destroy(new Error("timeout")));
      req.end();
    };

    visit(urlStr);
  });

const fetchArticle = async (params, corsOrigin) => {
  const missing = requireParams(params, ["url"], corsOrigin);
  if (missing) return missing;

  let target;
  try {
    target = new URL(params.url);
  } catch {
    return errorResponse(400, "Invalid url", corsOrigin);
  }
  if (!ALLOWED_PROTOCOLS.has(target.protocol)) {
    return errorResponse(400, "Unsupported protocol", corsOrigin);
  }

  try {
    const {
      status,
      contentType,
      html: raw,
    } = await httpGetHtml(target.toString());

    if (status !== 200 || !contentType.includes("html")) {
      return jsonResponse(
        200,
        {
          url: params.url,
          ok: false,
          reason: status !== 200 ? `status-${status}` : "not-html",
        },
        corsOrigin,
      );
    }

    // Cap the bytes we parse so a giant page can't blow the Lambda's memory.
    const html = raw.slice(0, MAX_ARTICLE_BYTES);

    const description = metaContent(
      html,
      "og:description",
      "description",
      "twitter:description",
    );
    const title =
      metaContent(html, "og:title", "twitter:title") ||
      clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
    const body = extractParagraphs(html);

    const text = collapse([description, body].filter(Boolean).join(" ")).slice(
      0,
      2000,
    );

    return jsonResponse(
      200,
      {
        url: params.url,
        ok: text.length > 0,
        title,
        excerpt: description.slice(0, 300),
        text,
        wordCount: text ? text.split(" ").length : 0,
        fetchedAt: new Date().toISOString(),
      },
      corsOrigin,
    );
  } catch (err) {
    const cause = err.cause;
    const detail = cause?.code || cause?.message || err.message;
    console.error(
      "article fetch error:",
      params.url,
      "→",
      detail,
      cause || err,
    );
    return jsonResponse(
      200,
      { url: params.url, ok: false, reason: detail },
      corsOrigin,
    );
  }
};
