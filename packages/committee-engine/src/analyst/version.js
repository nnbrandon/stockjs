// Bump whenever scoring logic changes (thresholds, weights, new components).
// Verdict-history comparisons only trust snapshots from the same engine
// version — otherwise every tweak to the engine manufactures fake
// "downgrades" against scores the old engine produced.
// v3 (2026-07-08): long-term reweight (fundamentals 45 / technical 35 /
// sentiment 20, was 40/35/25) + "quality on sale" nudge for strong-finance
// stocks trading well below their 52-week high.
export const COMMITTEE_ENGINE_VERSION = 3;
