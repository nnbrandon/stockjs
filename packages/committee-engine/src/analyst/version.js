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
// v8 (2026-07-10): "think like an analyst" round. The one SCORING change is
// quality-of-earnings red flags in dataScout — receivables running ahead of
// sales, a heavy stock-based-compensation load, and inventory piling up faster
// than sales each add a bearish scored component (silent when the field is
// missing). Also this round, all DISPLAY-ONLY (no score effect): a persistent
// thesis with kill criteria (thesis.js), a rough 5-year expected-return
// estimate (expectedReturn.js), a post-earnings review (earningsReview.js), and
// portfolio-level sector-concentration + correlation-cluster flags
// (portfolioHealth.js).
// v9 (2026-07-10): insider net-purchase signal in dataScout — insiders buying
// more of their own stock than they sell scores up (meaningfully for heavy
// buying, mildly for modest buying), and only heavy selling with several sellers
// scores down mildly. Asymmetric by design: buying is a strong signal, selling a
// weak one. Silent below three transactions or when Yahoo omits the module. Also
// this round, DISPLAY-ONLY (no score effect): position-aware advice
// (positionRead.js) surfaced on SELL verdicts and doubled winners.
export const COMMITTEE_ENGINE_VERSION = 9;
