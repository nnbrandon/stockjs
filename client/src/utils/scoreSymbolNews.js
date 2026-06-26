import LambdaService from "../LambdaService";
import { saveNewsSentiment } from "../db";
import { runNewsAgentPipeline } from "./analyst/newsAgent";
import {
  hasFinbertScore,
  selectNewsForAnalysis,
} from "./selectNewsForAnalysis";

/**
 * Crawl un-scored articles and score them with FinBERT. Persists scores to
 * IndexedDB and returns news merged with fresh + existing model scores.
 */
export async function scoreSymbolNews({
  news = [],
  finbertRun,
  force = false,
  onProgress,
}) {
  const selected = selectNewsForAnalysis(news);
  const targets = force
    ? selected
    : selected.filter((n) => !hasFinbertScore(n));

  if (!targets.length) {
    return {
      news,
      stats: { scored: 0, cached: selected.length, pending: 0 },
    };
  }

  onProgress?.({ phase: "crawl", total: targets.length });

  const { bodies } = await runNewsAgentPipeline({
    news: targets,
    cap: targets.length,
    fetchArticles: (urls) => LambdaService.fetchArticlesBatch(urls),
  });

  const items = targets
    .filter((n) => n?.id != null)
    .map((n) => {
      const text = (
        bodies?.[n.id] ||
        n.body ||
        n.summary ||
        n.title ||
        ""
      ).trim();
      return { id: n.id, text };
    })
    .filter((it) => it.text);

  onProgress?.({ phase: "finbert", total: items.length });

  const scores = (await finbertRun(items)) || {};

  const updates = items
    .map((it) => (scores[it.id] ? { id: it.id, model: scores[it.id] } : null))
    .filter(Boolean);
  if (updates.length) {
    await saveNewsSentiment(updates);
  }

  const merged = news.map((n) => {
    const model = scores[n.id] || n.model;
    return model ? { ...n, model } : n;
  });

  return {
    news: merged,
    stats: {
      scored: updates.length,
      cached: selected.length - targets.length,
      pending: targets.length,
    },
  };
}
