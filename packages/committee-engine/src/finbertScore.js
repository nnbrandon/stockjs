// FinBERT scoring contract, shared by the browser Web Worker
// (client/src/workers/finbert.worker.js) and the Lambda daily report — both
// must produce byte-compatible `article.model` objects or the sentiment
// pillar means different things in different places.

export const FINBERT_MODEL_ID = "Xenova/finbert";

/** ~roughly within FinBERT's 512-token limit. */
export const FINBERT_MAX_CHARS = 1600;

export const NEUTRAL_SCORE = Object.freeze({
  sentiment: 0,
  confidence: 0,
  label: "neutral",
});

/** Trim + truncate article text the same way everywhere. */
export function prepareFinbertText(text) {
  return (text || "").slice(0, FINBERT_MAX_CHARS).trim();
}

/**
 * Map FinBERT's {positive, negative, neutral} probabilities to a single
 * signed score in [-1, 1] plus a confidence (the winning probability).
 * Input: the pipeline's per-input prediction array (top_k: 3).
 */
export function toSignedScore(predictions) {
  let pos = 0;
  let neg = 0;
  let top = { label: "neutral", score: 0 };
  for (const p of predictions) {
    const label = String(p.label).toLowerCase();
    if (label === "positive") pos = p.score;
    else if (label === "negative") neg = p.score;
    if (p.score > top.score) top = { label, score: p.score };
  }
  return {
    sentiment: pos - neg, // -1..+1
    confidence: top.score, // 0..1
    label: top.label,
  };
}
