// Orchestrates the analyst committee. Runs the agents in dependency order
// (scouts first, then the critics, then the portfolio manager) and returns a
// single report object the UI can render. Pure + synchronous: no network, no
// LLM, safe to call inside a useMemo.

import {
  runDataScout,
  runSentimentAnalyst,
  runBear,
  runDevilsAdvocate,
  runPortfolioManager,
} from "./agents";

/**
 * @param {object} input
 * @param {Array} input.chartData   OHLCV candles (oldest → newest)
 * @param {Array} input.quarterly   quarterly fundamentals rows
 * @param {Array} input.annual      annual fundamentals rows
 * @param {Array} input.news        cached news articles
 * @returns {object|null} full committee report, or null if there's no data
 */
export function runAnalystCommittee(input = {}) {
  const chartData = Array.isArray(input.chartData) ? input.chartData : [];
  const quarterly = Array.isArray(input.quarterly) ? input.quarterly : [];
  const annual = Array.isArray(input.annual) ? input.annual : [];
  const news = Array.isArray(input.news) ? input.news : [];

  if (!chartData.length && !news.length && !quarterly.length) return null;

  const dataScout = runDataScout({ candles: chartData, quarterly, annual });
  const sentiment = runSentimentAnalyst({ news });

  const bear = runBear({
    dataScout,
    sentiment,
    pillarScores: {
      technical: dataScout.technicalScore,
      fundamental: dataScout.fundamentalScore,
      sentiment: sentiment.score,
    },
  });

  const devil = runDevilsAdvocate({ dataScout, sentiment, candles: chartData });

  const portfolioManager = runPortfolioManager({
    dataScout,
    sentiment,
    devil,
    candles: chartData,
  });

  const verdict = {
    action: portfolioManager.action,
    tier: portfolioManager.tier,
    composite: portfolioManager.composite,
    conviction: portfolioManager.conviction,
    convictionLabel: portfolioManager.convictionLabel,
  };

  return {
    verdict,
    pillars: {
      technical: dataScout.technicalScore,
      fundamental: dataScout.fundamentalScore,
      sentiment: sentiment.score,
    },
    risk: portfolioManager.risk,
    metrics: dataScout.metrics,
    // Ordered so the UI can render the "debate" top-to-bottom.
    agents: [dataScout, sentiment, bear, devil, portfolioManager],
    generatedAt: Date.now(),
  };
}

export { runAnalystCommittee as default };
