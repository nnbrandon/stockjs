import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";

import { jsonResponse, requireParams } from "../lib/response.js";

// Server-side fetch of a news article URL + lightweight readable-text
// extraction. Done here (not in the browser) because publishers don't send
// CORS headers, so the browser can't read their responses. Best-effort:
// returns { ok:false } for timeouts, non-HTML, paywalls, or blocked requests
// rather than failing the request.

const ARTICLE_TIMEOUT_MS = 4500;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);
const MAX_ARTICLE_BYTES = 600_000;
// Yahoo (and many news sites) reply with a huge stack of Set-Cookie/consent
// headers that exceed Node's default 16KB HTTP header limit, which makes the
// global `fetch` (undici) throw UND_ERR_HEADERS_OVERFLOW before we ever see the
// body. Node's http/https modules accept a per-request `maxHeaderSize`, so we
// use them directly — no `--max-http-header-size` launch flag required.
const MAX_HEADER_SIZE = 256 * 1024;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

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

// Fetch + extract a single article. Returns a plain result object (never
// throws) so it can be reused both by the single-URL handler and the batch
// handler that fans out server-side.
export async function extractArticle(rawUrl) {
  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return { url: rawUrl, ok: false, reason: "invalid-url" };
  }
  if (!ALLOWED_PROTOCOLS.has(target.protocol)) {
    return { url: rawUrl, ok: false, reason: "bad-protocol" };
  }

  try {
    const {
      status,
      contentType,
      html: raw,
    } = await httpGetHtml(target.toString());

    if (status !== 200 || !contentType.includes("html")) {
      return {
        url: rawUrl,
        ok: false,
        reason: status !== 200 ? `status-${status}` : "not-html",
      };
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

    return {
      url: rawUrl,
      ok: text.length > 0,
      title,
      excerpt: description.slice(0, 300),
      text,
      wordCount: text ? text.split(" ").length : 0,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    const cause = err.cause;
    const detail = cause?.code || cause?.message || err.message;
    console.error("article fetch error:", rawUrl, "→", detail, cause || err);
    return { url: rawUrl, ok: false, reason: detail };
  }
}

export async function fetchArticle(params, corsOrigin) {
  const missing = requireParams(params, ["url"], corsOrigin);
  if (missing) return missing;

  const data = await extractArticle(params.url);
  return jsonResponse(200, data, corsOrigin);
}
