// FinBERT sentiment scoring on the Lambda — the server-side twin of
// client/src/workers/finbert.worker.js. Both sides share the model id, text
// prep, and label→{sentiment, confidence, label} mapping via the engine's
// finbertScore.js, so a score produced here is byte-compatible with one
// produced in the browser.
//
// @huggingface/transformers is loaded lazily (dynamic import) so the ordinary
// API actions never pay its startup cost — only the daily report does.

import {
  FINBERT_MODEL_ID,
  prepareFinbertText,
  toSignedScore,
} from "@stockjs/committee-engine/finbertScore.js";
import { extractArticle } from "../handlers/article.js";

// Node inference is CPU-bound and single-model; small batches keep memory and
// per-call latency sane (mirrors the worker's WASM batch size).
const BATCH_SIZE = 8;
const CRAWL_CONCURRENCY = 4;

let classifierPromise = null;

/**
 * Lazy-init the FinBERT pipeline once per Lambda container. The quantized
 * model (~tens of MB) downloads to /tmp on the first (usually only) run of a
 * container; the scheduled daily report sees roughly one cold start per day.
 */
export function getClassifier() {
  if (!classifierPromise) {
    classifierPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      // /tmp is the only writable path on Lambda.
      env.cacheDir = process.env.HF_CACHE_DIR || "/tmp/hf-cache";
      return pipeline("text-classification", FINBERT_MODEL_ID, {
        dtype: "q8", // quantized → smaller download, faster inference
      });
    })();
    classifierPromise.catch(() => {
      // Allow a retry on the next call instead of caching the failure.
      classifierPromise = null;
    });
  }
  return classifierPromise;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Score `{id, text}` items with FinBERT. Returns a Map of id →
 * {sentiment, confidence, label}. Items with empty text are skipped (they'd
 * only ever score neutral and neutral-by-default would dilute the aggregate).
 * Throws if the model can't be loaded — callers degrade honestly.
 */
export async function scoreTexts(items = []) {
  const scores = new Map();
  const prepared = items
    .map((it) => ({ id: it.id, text: prepareFinbertText(it.text) }))
    .filter((it) => it.id != null && it.text);
  if (!prepared.length) return scores;

  const classifier = await getClassifier();

  // Length bucketing: similar-length texts batch together → minimal padding.
  prepared.sort((a, b) => a.text.length - b.text.length);

  for (const batch of chunk(prepared, BATCH_SIZE)) {
    const preds = await classifier(
      batch.map((b) => b.text),
      { top_k: 3 },
    );
    // With an array input + top_k, the result is an array (per input) of
    // arrays (per label).
    batch.forEach((b, idx) => {
      const p = preds[idx];
      scores.set(b.id, toSignedScore(Array.isArray(p) ? p : [p]));
    });
  }
  return scores;
}

/**
 * Crawl full text for articles (bounded concurrency, per-article timeout is
 * built into extractArticle) and return id → text. Articles that fail to
 * crawl fall back to `title + ". " + summary` — same degradation the browser
 * pipeline uses for paywalls.
 */
export async function crawlArticleTexts(articles = []) {
  const texts = new Map();
  const fallback = (a) =>
    [a.title, a.summary].filter(Boolean).join(". ").trim();

  const withLinks = articles.filter((a) => a.link);
  for (const a of articles) {
    if (!a.link) texts.set(a.id, fallback(a));
  }

  let cursor = 0;
  const worker = async () => {
    while (cursor < withLinks.length) {
      const article = withLinks[cursor++];
      const res = await extractArticle(article.link);
      texts.set(
        article.id,
        res.ok && res.text ? res.text : fallback(article),
      );
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(CRAWL_CONCURRENCY, withLinks.length) },
      worker,
    ),
  );
  return texts;
}

/**
 * Crawl + score articles that don't have a FinBERT score yet, and attach
 * `article.model = {sentiment, confidence, label}` in place.
 *
 * @returns {Promise<number>} how many articles were scored
 */
export async function scoreNewArticles(articles = []) {
  if (!articles.length) return 0;

  const texts = await crawlArticleTexts(articles);
  const items = articles
    .map((a) => ({ id: a.id, text: texts.get(a.id) || a.title || "" }))
    .filter((it) => it.text);

  const scores = await scoreTexts(items);
  let scored = 0;
  for (const article of articles) {
    const model = scores.get(article.id);
    if (model) {
      article.model = model;
      scored += 1;
    }
  }
  return scored;
}
