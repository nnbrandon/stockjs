import LambdaService from "../LambdaService";
import { saveNewsSentiment } from "../db";
import { runNewsAgentPipeline } from "./analyst/newsAgent";
import {
  hasFinbertScore,
  selectNewsForAnalysis,
} from "./selectNewsForAnalysis";

const PORTFOLIO_CRAWL_CONCURRENCY = 6;

/**
 * Crawl and FinBERT-score all un-scored articles across a portfolio in two
 * batched passes (one shared crawl pool, one shared FinBERT run) instead of
 * repeating per ticker.
 *
 * @param {object} opts
 * @param {Array<{ symbol: string, news: Array }>} opts.entries
 * @param {(items: Array<{ id, text }>) => Promise<object>} opts.finbertRun
 * @returns {Promise<Record<string, Array>>} merged news keyed by symbol
 */
export async function scorePortfolioNews({
  entries = [],
  finbertRun,
  onProgress,
}) {
  const pending = [];

  for (const { symbol, news } of entries) {
    const selected = selectNewsForAnalysis(news);
    const targets = selected.filter((n) => !hasFinbertScore(n));
    for (const article of targets) {
      pending.push({ symbol, article });
    }
  }

  const mergedBySymbol = Object.fromEntries(
    entries.map(({ symbol, news }) => [symbol, news || []]),
  );

  if (!pending.length) {
    return mergedBySymbol;
  }

  onProgress?.({ phase: "crawl", articlesTotal: pending.length });

  const { bodies } = await runNewsAgentPipeline({
    news: pending.map((p) => p.article),
    cap: pending.length,
    concurrency: PORTFOLIO_CRAWL_CONCURRENCY,
    fetchArticles: (urls) => LambdaService.fetchArticlesBatch(urls),
  });

  const items = pending
    .map(({ article }) => {
      const text = (
        bodies?.[article.id] ||
        article.body ||
        article.summary ||
        article.title ||
        ""
      ).trim();
      return article?.id != null && text ? { id: article.id, text } : null;
    })
    .filter(Boolean);

  onProgress?.({ phase: "finbert", articlesTotal: items.length });

  const scores = (await finbertRun(items)) || {};

  const updates = items
    .map((it) => (scores[it.id] ? { id: it.id, model: scores[it.id] } : null))
    .filter(Boolean);
  if (updates.length) {
    await saveNewsSentiment(updates);
  }

  for (const { symbol, news } of entries) {
    mergedBySymbol[symbol] = (news || []).map((n) => {
      const model = scores[n.id] || n.model;
      return model ? { ...n, model } : n;
    });
  }

  return mergedBySymbol;
}
