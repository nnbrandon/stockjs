// Bump whenever scoring logic changes (thresholds, weights, new components).
// Verdict-history comparisons only trust snapshots from the same engine
// version — otherwise every tweak to the engine manufactures fake
// "downgrades" against scores the old engine produced.
// v3 (2026-07-08): long-term reweight (fundamentals 45 / technical 35 /
// sentiment 20, was 40/35/25) + "quality on sale" nudge for strong-finance
// stocks trading well below their 52-week high.
// v4 (2026-07-08): fire-sale flag hardened against value traps — valuation
// gate (cheap vs its own history/growth, not just off its high), fundamental
// trajectory (deteriorating finances cap confidence at Low), staleness decay
// for flags that persist a quarter without recovering, and a market-relative
// drawdown check (benchmark candles) to separate company-specific discounts
// from market-wide selloffs.
export const COMMITTEE_ENGINE_VERSION = 4;
