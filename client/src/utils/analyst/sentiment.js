// News sentiment for the AI Committee. Sentiment comes exclusively from
// FinBERT (an on-device neural model) — see workers/finbert.worker.js. This
// module no longer scores polarity from a word lexicon; it only:
//   • de-duplicates wire reprints,
//   • classifies each article's event type + materiality (how much it can move
//     a stock, and whether it's forward-looking), and
//   • aggregates FinBERT's per-article scores with a recency × materiality ×
//     confidence weight.
// Articles without a FinBERT score contribute nothing until they're analyzed.

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Event / materiality lexicon. Mirrors what an agent's "Sentiment Analyst"
// would judge per article: what kind of event is this, how much does it move a
// stock, and is it forward-looking (markets price the future more than the
// past). Each rule: { type, materiality 0..1, forward, terms[] }.
const EVENT_RULES = [
  {
    type: "earnings",
    materiality: 0.95,
    forward: false,
    terms: [
      "earnings",
      "eps",
      "quarterly results",
      "quarter results",
      "beats estimates",
      "misses estimates",
      "missed estimates",
      "tops estimates",
      "profit",
      "revenue",
    ],
  },
  {
    type: "guidance",
    materiality: 0.95,
    forward: true,
    terms: [
      "guidance",
      "outlook",
      "forecast",
      "raises guidance",
      "cuts guidance",
      "lowers guidance",
    ],
  },
  {
    type: "M&A",
    materiality: 0.9,
    forward: true,
    terms: [
      "acquire",
      "acquires",
      "acquisition",
      "merger",
      "buyout",
      "takeover",
      "to buy",
      "stake in",
    ],
  },
  {
    type: "analyst action",
    materiality: 0.75,
    forward: true,
    terms: [
      "upgrade",
      "downgrade",
      "price target",
      "initiated coverage",
      "overweight",
      "underweight",
      "buy rating",
      "sell rating",
    ],
  },
  {
    type: "legal / regulatory",
    materiality: 0.8,
    forward: false,
    terms: [
      "lawsuit",
      "probe",
      "investigation",
      "settlement",
      "antitrust",
      "subpoena",
      "fraud",
      "fine",
    ],
  },
  {
    type: "product / ops",
    materiality: 0.65,
    forward: true,
    terms: [
      "launch",
      "unveil",
      "recall",
      "approval",
      "fda",
      "patent",
      "partnership",
      "contract",
    ],
  },
  {
    type: "capital return",
    materiality: 0.6,
    forward: true,
    terms: ["dividend", "buyback", "repurchase", "stock split", "offering"],
  },
  {
    type: "leadership",
    materiality: 0.55,
    forward: false,
    terms: [
      "ceo",
      "cfo",
      "resign",
      "steps down",
      "appoints",
      "layoffs",
      "job cuts",
    ],
  },
];

// Low-signal "listicle" patterns an agent would discount as noise.
const NOISE_TERMS = [
  "stocks to watch",
  "stocks to buy",
  "best stocks",
  "stocks to consider",
  "things to know",
  "what to know",
  "reasons to",
  "reasons why",
  "could make you",
  "make you rich",
  "is it too late",
  "better buy",
  "prediction",
  "here's why you should",
];

// Classify the article's event type + materiality from its text.
function classifyEvent(text) {
  const lower = (text || "").toLowerCase();

  if (NOISE_TERMS.some((t) => lower.includes(t))) {
    return { type: "general / listicle", materiality: 0.15, forward: false };
  }

  let best = null;
  for (const rule of EVENT_RULES) {
    if (rule.terms.some((t) => lower.includes(t))) {
      if (!best || rule.materiality > best.materiality) best = rule;
    }
  }
  return best
    ? { type: best.type, materiality: best.materiality, forward: best.forward }
    : { type: "general", materiality: 0.4, forward: false };
}

// Exponential recency weight. Half-life in days.
function recencyWeight(dateStr, halfLifeDays = 10) {
  const ts = new Date(dateStr).getTime();
  if (!Number.isFinite(ts)) return 0.5;
  const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Normalized key for de-duplicating wire reprints (same story, many outlets).
export function titleKey(title = "") {
  return tokenize(title).slice(0, 9).join(" ");
}

/**
 * Analyze news articles for the Sentiment Analyst. De-dupes reprints, classifies
 * each article's event/materiality, and aggregates FinBERT's per-article scores
 * (attached as `item.model = { sentiment, confidence, label }`) with a
 * recency × materiality × confidence weight. Articles without a FinBERT score
 * are carried as "unscored" and contribute nothing to the aggregate.
 *
 * @returns {{
 *   score: number,                 // -1..+1 weighted polarity (FinBERT only)
 *   counts: { positive, negative, neutral, total }, // total = FinBERT-scored
 *   unscoredCount: number,         // articles awaiting FinBERT
 *   scored: Array,                 // rich per-article analysis
 *   topPositive: object|null,
 *   topNegative: object|null,
 *   enrichedCount: number,         // how many had full body text
 *   modelCount: number,            // how many were scored by FinBERT
 *   duplicatesRemoved: number,
 *   dominantEvent: string|null,
 * }}
 */
export function analyzeNewsSentiment(news = []) {
  // 1) De-dupe near-identical headlines, preferring the copy that has body text.
  const byKey = new Map();
  let duplicatesRemoved = 0;
  for (const item of news) {
    const key = titleKey(item.title);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
    } else {
      duplicatesRemoved += 1;
      const existingHasBody = Boolean(existing.body);
      const itemHasBody = Boolean(item.body);
      if (itemHasBody && !existingHasBody) byKey.set(key, item);
    }
  }
  const unique = [...byKey.values()];

  // 2) Per-article structured analysis. Event type / materiality come from the
  // classifier; sentiment + confidence come exclusively from FinBERT.
  const scored = unique.map((item) => {
    const hasBody = Boolean(item.body);
    const text = `${item.title || ""}. ${item.body || item.summary || ""}`;
    const event = classifyEvent(text);

    const model = item.model;
    const usedModel = Boolean(model && Number.isFinite(model.sentiment));
    const sentiment = usedModel
      ? Math.max(-1, Math.min(1, model.sentiment))
      : 0;
    // Unscored articles get 0 confidence → 0 weight → no effect on the average.
    const confidence = usedModel
      ? clamp01(0.5 + (model.confidence || 0) * 0.5)
      : 0;

    return {
      id: item.id,
      title: item.title,
      date: item.date,
      hasBody,
      usedModel,
      modelLabel: usedModel ? model.label : null,
      sentiment,
      eventType: event.type,
      materiality: event.materiality,
      forward: event.forward,
      confidence,
      recency: recencyWeight(item.date),
    };
  });

  // 3) Aggregate over FinBERT-scored articles only.
  let positive = 0;
  let negative = 0;
  let neutral = 0;
  let weightedSum = 0;
  let weightTotal = 0;
  const eventTally = new Map();

  for (const a of scored) {
    if (!a.usedModel) continue;

    if (a.sentiment > 0.05) positive += 1;
    else if (a.sentiment < -0.05) negative += 1;
    else neutral += 1;

    const weight = a.recency * a.materiality * a.confidence;
    a.weight = weight;
    weightedSum += a.sentiment * weight;
    weightTotal += weight;

    if (!["general", "general / listicle"].includes(a.eventType)) {
      eventTally.set(a.eventType, (eventTally.get(a.eventType) || 0) + 1);
    }
  }

  const score = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const modelCount = positive + negative + neutral;

  const ranked = scored
    .filter((a) => a.usedModel)
    .sort((a, b) => b.sentiment - a.sentiment);
  const topPositive = ranked[0]?.sentiment > 0.05 ? ranked[0] : null;
  const topNegative = ranked.at(-1)?.sentiment < -0.05 ? ranked.at(-1) : null;

  const dominantEvent =
    [...eventTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    score,
    counts: { positive, negative, neutral, total: modelCount },
    unscoredCount: scored.length - modelCount,
    scored,
    topPositive,
    topNegative,
    enrichedCount: scored.filter((a) => a.hasBody).length,
    modelCount,
    duplicatesRemoved,
    dominantEvent,
  };
}
