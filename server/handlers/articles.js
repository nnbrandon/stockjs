import { extractArticle } from "./article.js";
import { errorResponse, jsonResponse } from "../lib/response.js";

// Batch article fetch: take many URLs in one request and fan them out
// server-side. The browser caps concurrent connections to a single host
// (~6), so issuing one request per article throttles a deep review to ~6 in
// flight no matter what. Batching here lets a handful of requests each carry
// many URLs, and the server fetches publishers with much higher concurrency.

// Upper bound per request so a single batch can't run unbounded or blow the
// Lambda's response size / execution time.
const MAX_URLS = 40;
// Server-side fan-out width. No browser connection cap applies here, so this
// can be far higher than the client could achieve on its own.
const FETCH_CONCURRENCY = 10;

export async function fetchArticles(body, corsOrigin) {
  const urls = Array.isArray(body?.urls)
    ? body.urls.filter((u) => typeof u === "string" && u).slice(0, MAX_URLS)
    : [];

  if (!urls.length) {
    return errorResponse(
      400,
      "Body must include a non-empty urls array",
      corsOrigin,
    );
  }

  const results = new Array(urls.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      const i = cursor++;
      results[i] = await extractArticle(urls[i]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, urls.length) }, worker),
  );

  return jsonResponse(200, { results }, corsOrigin);
}
