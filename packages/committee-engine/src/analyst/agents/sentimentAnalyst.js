import { scaleClamp } from "../indicators";
import { analyzeNewsSentiment } from "../sentiment";
import {
  bear,
  bull,
  labelScore,
  neutral,
  stanceFromScore,
  truncate,
} from "./helpers";

export function runSentimentAnalyst({ news = [] }) {
  const result = analyzeNewsSentiment(news);
  const { score, counts, topPositive, topNegative } = result;
  const findings = [];
  const unscored = result.unscoredCount || 0;

  // FinBERT polarity is decisive; map -1..+1 → 0..100 over a ±0.5 band. Two
  // things widened the effective range vs. the old ±0.7: the band itself, and
  // the directional weighting in sentiment.js (which stops neutral wire copy
  // from dragging the aggregate to 0). ±0.5 balances the two — a ±0.25
  // aggregate reads as a clear one-sided ~75/25, without a single material
  // headline pegging the whole score to an extreme.
  const sentimentScore =
    counts.total > 0 ? scaleClamp(score, -0.5, 0.5, 0, 100) : null;

  if (counts.total === 0) {
    findings.push(
      neutral(
        unscored > 0
          ? `${unscored} saved article${unscored === 1 ? "" : "s"} — analyze them to read the mood`
          : "No saved news articles yet",
        1,
      ),
    );
  } else {
    findings.push(
      neutral(
        `Read ${counts.total} recent article${counts.total === 1 ? "" : "s"} — ${counts.positive} upbeat, ${counts.negative} negative, ${counts.neutral} neutral`,
        1,
      ),
    );
    const enriched = result.enrichedCount || 0;
    if (enriched > 0)
      findings.push(
        neutral(
          `${enriched} of ${counts.total} read in full, not just the headline`,
          1,
        ),
      );
    if (unscored > 0)
      findings.push(
        neutral(
          `${unscored} more saved article${unscored === 1 ? "" : "s"} not read yet`,
          1,
        ),
      );
    if (result.duplicatesRemoved > 0)
      findings.push(
        neutral(
          `Skipped ${result.duplicatesRemoved} repeat cop${result.duplicatesRemoved === 1 ? "y" : "ies"} of the same story`,
          1,
        ),
      );
    if (result.dominantEvent)
      findings.push(
        neutral(`Most stories are about: ${result.dominantEvent}`, 1),
      );
    if (topPositive) {
      const finding = bull("Most upbeat story: ", 1);
      if (topPositive.link) {
        finding.link = topPositive.link;
        finding.linkText = truncate(topPositive.title);
      } else {
        finding.text = `Most upbeat story: "${truncate(topPositive.title)}"`;
      }
      findings.push(finding);
    }
    if (topNegative) {
      const finding = bear("Most negative story: ", 1);
      if (topNegative.link) {
        finding.link = topNegative.link;
        finding.linkText = truncate(topNegative.title);
      } else {
        finding.text = `Most negative story: "${truncate(topNegative.title)}"`;
      }
      findings.push(finding);
    }
    if (counts.total < 3)
      findings.push(
        neutral("Only a few articles, so this read is less reliable", 1),
      );
  }

  return {
    key: "sentiment",
    name: "Sentiment Analyst",
    role: "What the news is saying",
    score: sentimentScore,
    stance:
      sentimentScore == null ? "No data" : stanceFromScore(sentimentScore),
    summary:
      sentimentScore == null
        ? "Analyze the news to gauge the overall mood."
        : `The news mood is ${labelScore(sentimentScore)} (${sentimentScore.toFixed(0)}/100) across ${counts.total} recent article${counts.total === 1 ? "" : "s"}.`,
    findings,
    raw: result,
  };
}
