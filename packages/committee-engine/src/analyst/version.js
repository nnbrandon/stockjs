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
// v5 (2026-07-10): news-mood pillar reworked from a mean of signed FinBERT
// magnitudes (which regressed to ~50 as articles piled up) to a weighted
// diffusion index — the balance of positive vs. negative coverage — so the
// score uses the full 0–100 range. Mapping band retuned to ±0.7.
// v6 (2026-07-10): long-term lens — the fundamental pillar now scores
// multi-year consistency (annual revenue/profit track record, margin drift),
// share-count trend (buybacks vs. dilution), and dividend affordability
// (payout vs. free cash flow) from data already fetched. Verdict additionally
// exposes `answers` — the "worth owning?" / "good time to add?" split.
// v7 (2026-07-10): peer-relative valuation — trailing P/E is now judged
// against a static per-sector band (sectorBenchmarks.js) and averaged into the
// own-valuation component (no double-count). Also this round (display-only, no
// score effect): tier-change explanations, an upcoming-earnings heads-up
// finding, and an ease-in tranche plan on BUY verdicts.
export const COMMITTEE_ENGINE_VERSION = 7;
