# Plan: AI Committee roadmap — from scoring engine to long-term investing system

**Status: ALL PHASES IMPLEMENTED (2026-07-06).** Kept as design
documentation. Notes from implementation:

- Phase A: Dexie v4 `committeeHistory` store; snapshots written from both
  `usePortfolioCommittee` and an `AnalystPanel` effect; momentum nudge lives
  in `portfolioManager.js` (±4 pts at a ±12-pt delta over ≥21 days);
  `COMMITTEE_ENGINE_VERSION` lives in `utils/analyst/version.js` (currently 2)
  to avoid an import cycle. UI: tier-change chips, score sparkline (reuses
  `TickerSparkline`), "Changed" filter.
- Phase B: `utils/backtest/` (pure `walkForward.js` + browser `index.js`),
  exposed as `window.__stockjsBacktest` in dev via `main.jsx`. Synthetic
  regime-flip self-test passed (Buy fwd6m beat Sell fwd6m by ~15 pts).
- Phase C: `utils/portfolioHealth.js` + `correlation()` in indicators +
  `PortfolioHealthCard` above the summary chips. Health is computed in the
  run loop (chart data in hand) and session-cached.
- Phase D: `server/handlers/analysis.js` (`action=analysis`; analyst count is
  at `trend.earningsEstimate.numberOfAnalysts`); Dexie v5 `analysis` store;
  fetch wired into `useRefreshData` + `addSymbolToWatchlist` (best-effort);
  expectations block in `dataScout.js`; revisions check in the Bear;
  missing-analysis dataGap in the Devil. Targets/ratings shown, never scored.
- Phase E: `utils/guardrails.js` + amber banner in AnalystPanel
  (`--palette-warning` tokens added to `index.css` for both themes);
  stale-price/stale-financials dataGaps in the Devil's Advocate. Rule 2
  (oversized weak position) ships as the Phase C `weakLarge` flag.

Original plan follows for design rationale.

**Prerequisite:** `docs/financial-strength-plan.md` (cash-flow + balance-sheet
scoring) should land first — Phase B (backtesting) and Phase C (portfolio
intelligence) benefit from its metrics, and it's the highest value-per-effort
change. It is a separate, independent plan.

## Goal & grading

The owner is a **long-term position investor (not a day trader)** who wants
beginner-friendly output. The honest ceiling for "picks stocks that beat the
market" with public data is ~7/10 — nothing here claims otherwise. This
roadmap targets 8–9 on the metric that actually determines long-term
outcomes: **"does this system measurably improve the user's decisions"** —
allocation, exit discipline, and behavior, not stock-picking IQ.

Phases in priority order. Each is independently shippable; A and B are the
natural next implementations, C and E are what push the rating into the 8s.

| Phase | What | Why it matters |
|---|---|---|
| A | Verdict history & thesis tracking | Trajectory beats snapshot; downgrades are the signal |
| B | Backtest harness | Converts hand-tuned thresholds into measured ones |
| C | Portfolio-level intelligence | Allocation drives long-term returns more than picking |
| D | Forward-looking inputs | Fixes "everything is trailing" |
| E | Behavioral guardrails | Cheap nudges; disproportionate long-term value |

## Architecture primer (read first)

- **Committee engine**: `client/src/utils/analyst/` — pure, synchronous,
  deterministic JS. `runAnalystCommittee({chartData, quarterly, annual,
  earnings, news})` → `{verdict: {action, tier, composite, conviction,
  convictionLabel}, pillars: {technical, fundamental, sentiment}, agents[],
  generatedAt}`. Tiers: Strong Buy ≥78, Buy ≥64, Hold ≥45, Reduce ≥33, Sell
  <33. Every metric is optional (`Number.isFinite` guards); preserve that.
- **Storage**: Dexie (IndexedDB) in `client/src/db/`. Schema versions live in
  `client/src/db/database.js` as a `schemaVersions` array (currently version
  3); to add a store, append a new version entry with the FULL stores map.
  Stores: `stockData` (candles, `[symbol+shortenedDate]`), `quarterlyResult` /
  `annualResult` (`[symbol+date]`), `news` (`id, symbol, date`), `earnings`
  (`[symbol+date]`), `positions` (`symbol, quantity, averageCostBasis,
  importedAt, source`).
- **Committee data loading**: `client/src/utils/loadCommitteeData.js` loads
  everything for one symbol from Dexie. `client/src/hooks/usePortfolioCommittee.js`
  loops all tradeable positions, skips funds (`isFundSymbol`), runs the
  committee per symbol, caches results for the session.
- **UI**: `client/src/components/AnalystPanel/` (single-symbol tab, renders
  verdict banner + GamePlan box + agent cards),
  `client/src/components/PortfolioCommitteePanel/` (all-holdings review with
  Buy/Hold/Sell filters), `client/src/components/AiCommitteeHelp/` (docs
  modal), `client/src/components/PositionHolding/` (position card).
  `client/src/utils/computePositionMetrics.js` computes
  `currentValue`, `costBasisTotal`, gain/loss from a position + candles.
- **Positions**: read-only imports from Fidelity CSV; the app tracks, it does
  not execute trades. `usePositions()` returns `{positions, positionsBySymbol}`.
- **Server**: AWS Lambda (auto-deploys on push to `main` when `server/**`
  changes; see `DEPLOY.md`), handlers in `server/handlers/`, dispatched by
  `action` query param. Uses `yahoo-finance2`. Local: `node server/local-server.js`.
- **Environment gotchas**: `npm run build` fails on Node 20.11.1
  (`crypto.hash is not a function` — Vite 7 needs Node 20.19+; pre-existing,
  not your bug). Analyst imports are extensionless, so plain `node` can't run
  them — bundle first:
  `client/node_modules/.bin/esbuild in.js --bundle --format=esm --platform=node --outfile=out.mjs && node out.mjs`.
  Verify with `npx eslint <paths>` + simulation scripts, not the build.
- **No test framework exists.** Simulation scripts are the verification
  pattern (see Phase B and the financial-strength plan's Phase 4).

---

## Phase A — Verdict history & thesis tracking

**Idea:** a real PM tracks a thesis over time. Store one committee snapshot
per symbol per day; surface the trajectory and tier changes. "Score slid
71 → 64 → 52 over three months" and "Downgraded: Buy → Hold" are better
long-term signals than any point-in-time number.

### A1. New Dexie store

Append schema **version 4** in `client/src/db/database.js` (full stores map,
per the file's own instructions):

```
committeeHistory: "[symbol+day], symbol, day"
```

Row shape (non-indexed fields are schemaless):

```js
{
  symbol, day,            // day = "YYYY-MM-DD" local date
  composite, tier, action, conviction,
  technical, fundamental, sentiment,   // pillar scores (may be null)
  exitSignals,            // {triggered, total} from the bear agent
  generatedAt,            // Date.now()
}
```

New store module `client/src/db/stores/committeeHistory.js` following the
pattern of `stores/fundamentals.js`: `saveCommitteeSnapshot(row)` (a `put`,
so re-runs the same day overwrite — one row per symbol per day),
`getCommitteeHistory(symbol, limit = 400)` (sorted by day ascending),
`deleteCommitteeHistoryForSymbol(symbol)`. Export via `client/src/db/index.js`,
and wire `deleteCommitteeHistoryForSymbol` wherever other per-symbol deletes
happen (see `deleteFundamentalsForSymbol` call sites, e.g. watchlist removal).

### A2. Snapshot writes

Two write points, both idempotent per day:

1. **`usePortfolioCommittee.js`** — after each symbol's
   `runAnalystCommittee` succeeds in the run loop, `saveCommitteeSnapshot`
   (fire-and-forget `.catch(() => {})`; never block or fail the review).
2. **`AnalystPanel.jsx`** — the report is computed in a `useMemo`; do NOT
   write from the memo. Add a `useEffect` on `[report]` that writes a
   snapshot when `report` exists. The `[symbol+day]` put makes re-renders
   harmless.

Do not snapshot fund symbols (report is null there anyway).

### A3. Trajectory as a committee input (score momentum)

Optional but recommended. Pass recent history into the committee:
`loadCommitteeData` additionally loads `getCommitteeHistory(symbol)`;
`runAnalystCommittee` accepts `input.history`. New logic in the Portfolio
Manager (or a small pre-step in `index.js`):

- Compare the newest *stored* composite from ≥21 days ago (find the latest
  row whose `day` is at least 21 days old) with today's raw composite.
- If today's composite is ≥12 points **lower** → add a bear finding weight 1
  to the PM: "The committee's own score has been sliding — the picture is
  deteriorating, not stabilizing" and subtract up to 4 points from the
  composite (clamped; keep it a nudge, not a driver).
- If ≥12 points **higher** → bull finding, +up to 4.
- Guard: skip entirely when history has <2 rows or the engine version changed
  (see A5). Never let a missing history change today's score.

### A4. UI

- **AnalystPanel verdict banner**: a small "since last review" chip when the
  tier differs from the previous stored snapshot: e.g. `↓ was Buy (67) on
  Jun 12`. Color by direction (success/error/neutral tokens are in the CSS
  module already).
- **Score history sparkline**: a compact line of stored composites under the
  pillars. `client/src/utils/prepareSparklineData.js` and
  `components/SparklineChart/` already exist — reuse if the component is
  generic enough; otherwise a 60×16 inline SVG polyline is fine.
- **PortfolioCommitteePanel**: per-holding card shows the tier-change chip;
  add a summary filter "Changed" next to the existing Buy/Hold/Sell filters
  (`FILTERS` object + `getItemFilterKey` in `PortfolioCommitteePanel.jsx`)
  listing holdings whose tier differs from their previous snapshot.
- **Help modal**: one paragraph on thesis tracking.

### A5. Engine versioning

Add `export const COMMITTEE_ENGINE_VERSION = 2;` in
`client/src/utils/analyst/index.js` (bump on any future scoring change) and
stamp it into snapshots. Trajectory comparisons and "was Buy on Jun 12" chips
must only compare rows with the same engine version — otherwise every scoring
tweak manufactures fake downgrades.

### A6. Verification

- eslint the touched paths.
- esbuild+node sim: feed `runAnalystCommittee` a fabricated `history` array,
  assert the momentum nudge fires in both directions, is capped at ±4, and
  that empty/short/version-mismatched history is a no-op.
- Manual: open a symbol twice in one day → one row; change tier thresholds
  temporarily to force a downgrade chip → renders correctly.

---

## Phase B — Backtest harness

**Idea:** replay cached history through the committee walk-forward and
measure what the verdicts would have done. This converts thresholds
(78/64/45/33) and pillar weights (40/35/25) from folklore into measured
choices — and tells the owner what the system's rating actually *is*.

### B1. Where it runs

IndexedDB is browser-only, so the harness runs **in the browser** as a
dev-only utility. Recommended: `client/src/utils/backtest/runBacktest.js`
(pure logic) + a hidden route or a button in the AI Committee help modal
footer, dev-gated (`import.meta.env.DEV`) — plus
`window.__stockjsBacktest = runBacktest` exposure so it's runnable from the
console against the user's real cache. Results: `console.table` + a
JSON-download link. No server involvement.

### B2. Walk-forward loop (per symbol)

For each cached symbol with ≥ ~500 daily candles (2 years):

```
for step in weekly dates from (firstCandle + 250 trading days) to (lastCandle - 1):
  candles   = stockData rows with date <= step            (last 365 days)
  quarterly = quarterlyResult rows with date <= step - LAG (LAG = 45 days)
  annual    = annualResult rows with date <= step - LAG
  earnings  = earnings rows with reportedDate <= step (fall back to date)
  news      = []                                          (see B4)
  report    = runAnalystCommittee({chartData, quarterly, annual, earnings, news})
  record (symbol, step, tier, action, composite, pillars)
```

The 45-day `LAG` approximates real-world reporting delay so fundamentals are
point-in-time-ish. Earnings rows use `reportedDate` (already stored) which IS
point-in-time. State this limitation in the output header: fundamentals
history in Dexie is as-fetched, not a true point-in-time database — results
are indicative, not audit-grade.

### B3. Metrics to compute

For every recorded verdict, look ahead in the same candle series:

1. **Forward returns** by tier: mean/median 3-, 6-, 12-month return following
   each tier, and vs. SPY over the same windows if SPY candles are cached
   (guard: skip benchmark columns when absent).
2. **Sell avoidance**: for each Reduce/Sell verdict, max drawdown and total
   return over the following 6 months — did exiting help?
3. **Transition value**: returns following tier *downgrades* vs. tier
   *upgrades* (from Phase A's perspective, the most decision-relevant stat).
4. **Calibration table**: composite-score decile → forward 6-month return.
   Monotonic ⇒ the score means something; flat ⇒ it doesn't. This one table
   is the honest answer to "what would you rate this system."
5. **Threshold sweep** (stretch): re-map recorded composites against
   alternative cutoffs (e.g. Sell < 30/35/40) and report which cutoff
   maximized sell-avoidance without gutting buy returns. Sweeping *pillar
   weights* requires re-running the engine — keep out of scope for v1;
   recording `pillars` per step enables it later without re-walking.

### B4. Honesty constraints (put these in the output header too)

- News/sentiment pillar is **excluded** (no historical news cache) — the
  backtest measures the technical + fundamental engine only.
- Survivorship bias: the cache only contains symbols the user watches today.
- Small-N: with a handful of symbols this is a sanity check, not statistics —
  print N for every aggregate; suppress aggregates with N < 20 verdicts.
- Deterministic engine + frozen inputs ⇒ reproducible runs. Stamp
  `COMMITTEE_ENGINE_VERSION` (Phase A5) into the report.

### B5. Verification

- Synthetic self-test first (esbuild+node, no IndexedDB): generate 3 years of
  candles with a known regime flip (up 18 months, then down), plus quarterly
  rows that deteriorate in the down phase; assert the harness records
  downgrades after the flip and that Sell-tier forward returns < Buy-tier
  forward returns on this construction. This validates the harness plumbing,
  not the strategy.
- Then run in-browser on the real cache and eyeball the calibration table.

---

## Phase C — Portfolio-level intelligence

**Idea:** the committee rates stocks in isolation, but outcomes are decided
by the portfolio. Everything below is computable from data already cached —
no backend changes (except the optional sector item).

### C1. Data assembly

Extend `usePortfolioCommittee.js`: it already loads `chartData` per holding
and has `position` rows. Compute per holding via `computePositionMetrics`:
`currentValue`. Portfolio total = Σ currentValue (include fund holdings in
the total — they're part of allocation even though they skip the committee).

### C2. Portfolio Health card (new section at top of `PortfolioCommitteePanel`)

New component `PortfolioHealthCard.jsx` in the same folder. Contents, each
with a plain-English one-liner:

1. **Concentration**: each holding's weight %. Flag any single stock > 20%
   ("more than a fifth of your account rides on one company") and top-3
   weight > 60%. Funds get a softer threshold (> 50% in one fund is normal;
   don't flag index funds as concentration risk — `isFundSymbol` already
   identifies them).
2. **Correlation clusters**: pairwise Pearson correlation of daily returns
   over the last 90 shared trading days between non-fund holdings (guard:
   require ≥ 60 shared days). Flag pairs with r > 0.8: "X and Y move
   together — they're closer to one bet than two." Helper
   `correlation(closesA, closesB)` belongs in
   `client/src/utils/analyst/indicators.js` (pure math, tested via the sim
   pattern). O(n²) pairs is fine for retail position counts.
3. **Value-weighted committee score**: Σ(weightᵢ × compositeᵢ) over rated
   holdings → "Your portfolio overall scores 61/100 — Hold territory." Show
   the % of portfolio value sitting in Reduce/Sell-rated names; that single
   number ("18% of your money is in names the committee would sell") is the
   card's headline when nonzero.
4. **Risk-rule check**: the committee's GamePlan preaches ≤5% per position
   (3-5-7 rule) for *new* buys; at the portfolio level, flag rated-**Reduce/
   Sell** holdings that also exceed 10% of portfolio value as "large position
   + weak thesis" — the combination is the danger, not size alone (long-term
   winners legitimately grow past 5%).

### C3. Sector overlap (optional, needs backend)

Real sector data requires `quoteSummary` module `assetProfile` (`sector`,
`industry`). If implementing: new server action `profile` (batch symbols →
`{symbol, sector, industry}`), cache in a new Dexie store `profile:
"symbol"` with a 30-day staleness stamp, group holdings by sector in the
health card, flag > 40% in one sector. **Ship C1–C2 without this; add it with
Phase D's backend work** (both touch `quoteSummary`, do them together).

### C4. Verification

- Unit-style sim for `correlation()` (identical series → 1, inverted → −1,
  independent noise → ~0) and for the weighting math with hand-computed
  fixtures.
- Manual: import the Fidelity CSV, run a portfolio review, confirm the card
  renders and each flag fires against a constructed cache.

---

## Phase D — Forward-looking inputs (estimates, revisions, targets)

**Idea:** everything the committee reads is trailing. Analyst estimate
*revisions* are among the better-documented public signals, and forward P/E
values growers more fairly than trailing P/E.

### D1. Backend: new action `analysis`

New handler `server/handlers/analysis.js`, registered in the action dispatch
in `server/index.js` (follow `quote.js` as the template):

```js
yahooFinance.quoteSummary(symbol, {
  modules: ["earningsTrend", "financialData", "defaultKeyStatistics"],
}, { validateResult: false })
```

Return a **flattened, stable** shape (do not pass raw Yahoo through; their
nesting churns). Verify exact field names against a live response at
implementation time (yahoo-finance2 typings for `earningsTrend`:
`trend[]` entries keyed by `period` — `"0q"`, `"+1q"`, `"0y"`, `"+1y"` — each
with `epsTrend {current, 7daysAgo, 30daysAgo, 60daysAgo, 90daysAgo}` and
`epsRevisions {upLast7days, upLast30days, downLast30days}` and `growth`):

```js
{
  symbol, fetchedAt,
  forwardEps,           // trend["+1y"].epsTrend.current
  forwardEpsGrowth,     // trend["+1y"].growth (fraction)
  eps30dAgo,            // trend["+1y"].epsTrend["30daysAgo"]
  revisionsUp30d, revisionsDown30d,   // trend["+1y"].epsRevisions
  targetMeanPrice, recommendationMean, numberOfAnalysts,  // financialData
  forwardPE, pegRatio, beta,          // defaultKeyStatistics
}
```

### D2. Client plumbing

- `LambdaService.fetchAnalysis(symbol)` (copy the `fetchNews` pattern).
- Dexie schema **version 5** (or 4 if Phase A hasn't landed — coordinate; the
  `schemaVersions` array must stay monotonic): store `analysis: "symbol"`.
  One row per symbol, replaced on fetch, `fetchedAt` stamp; refetch when
  older than 24h. Wire into the daily refresh path (see
  `client/src/hooks/useRefreshData.js` / `utils/dailyRefresh.js`) alongside
  the fundamentals fetch, and into `loadCommitteeData` +
  `AnalystPanel`/`useSymbolData` so it reaches `runAnalystCommittee` as
  `input.analysis`.

### D3. Scoring (Data Scout, new "expectations" block)

All optional, `Number.isFinite`-guarded, pushed onto the fundamental
`components` and `metrics`:

1. **Estimate revisions momentum** — the strongest item. Direction:
   `revisionsUp30d` vs `revisionsDown30d`, plus drift
   `(forwardEps − eps30dAgo) / |eps30dAgo|`. Component: map net-revision
   share `(up − down) / max(up + down, 1)` through
   `scaleClamp(x, -1, 1, 15, 90)`. Findings: mostly-up → bull "Analysts have
   been raising their profit forecasts — expectations are improving"; drift
   < −5% → bear weight 2 "Analysts keep cutting their forecasts — a bad sign
   that tends to continue."
2. **Forward vs trailing P/E**: when `forwardPE` is meaningfully below
   trailing (`metrics.trailingPE`), neutral/bull finding "Priced more
   reasonably against next year's expected profits (forward P/E N)"; when
   forward > trailing (estimates imply *shrinking* earnings) → bear.
   Component: `scaleClamp(forwardPE, 50, 8, 20, 85)` — but only when the
   trailing-P/E component was skipped or EPS ≤ 0, to avoid double-counting
   valuation.
3. **Bear checklist** (`bear.js`): add — available when both revision counts
   are finite; hit when `revisionsDown30d > revisionsUp30d` two-to-one and
   total ≥ 3: "Wall Street is cutting its forecasts for this company."
4. **Explicitly do NOT score** `targetMeanPrice` into the composite (analyst
   targets are chronically optimistic); show it as a neutral informational
   finding only: "Analyst average target: $X (take with salt — targets skew
   optimistic)." `recommendationMean` likewise informational only.
5. Devil's Advocate: data-gap flag when analysis is entirely missing
   (`dataGap(..., 3)`), so thin coverage lowers confidence, not the score.

### D4. Help modal & weights

Document the new inputs in `AiCommitteeHelpModal.jsx`. Keep the three-pillar
structure and weights unchanged — revisions live inside "Company finances."

### D5. Verification

- Server: local-server against AAPL + one thinly-covered small cap (fields
  missing) + one fund symbol (module errors) — handler must degrade to
  partial/empty payloads, never 500 on missing modules.
- Sim: fixtures with revisions up / down / absent; assert component and
  findings fire, absent analysis is byte-identical to today's output.

---

## Phase E — Behavioral guardrails

**Idea:** the app doesn't execute trades, so guardrails are surfaced
warnings, not blocks. Cheap to build; disproportionate real-world value —
this is what earns the "improves your outcomes" rating.

### E1. Rules (v1)

Computed where position + report are both in hand (`AnalystPanel` via its
`position` prop, and per-holding in `PortfolioCommitteePanel`):

1. **Averaging-down watch**: position's `totalGainLossPct` < −15% AND tier is
   Reduce/Sell → "You're down N% and the committee rates this a
   {tier} — adding here would be averaging down into a broken thesis. The
   exit plan is in the Portfolio Manager card."
2. **Oversized weak position** (needs Phase C's weights): weight > 10% AND
   tier Reduce/Sell → "A large slice of your portfolio is in a name the
   committee would sell."
3. **Winner-selling nudge** (the inverse mistake): `totalGainLossPct` > 50%
   AND tier Buy/Strong Buy → "Up N% and still rated {tier} — long-term
   returns come from letting exactly these run. (Rebalancing for size is
   fine; selling because it's 'up a lot' is not a reason.)"
4. **Stale data warning**: newest cached candle > 7 days old, or newest
   quarterly row > 200 days old → "This verdict is based on stale data —
   refresh before acting." (Check in `runAnalystCommittee` itself as a
   Devil's Advocate `dataGap`, so it also reaches the portfolio review.)

### E2. Presentation

Rules 1–3 render as a single amber `GuardrailBanner` (new small component,
reuse AnalystPanel CSS tokens) between the verdict banner and the GamePlan
box — at most one banner; priority order 1 > 2 > 3. Rule 4 flows through the
existing Devil's Advocate findings. Beginner-friendly voice, no jargon, never
imperative ("consider", "worth knowing") — these are nudges, not commands,
and the disclaimer still applies.

### E3. Verification

Sim fixtures per rule boundary (−15%, 10%, +50%, 7d/200d) asserting
fire/no-fire on each side; eslint; manual render check of the banner in both
themes.

---

## Sequencing & expected rating impact

Recommended order: **A → B → C → E → D** (D last because it's the only one
needing new external data plumbing, and C3 can piggyback on it).

- Financial-strength plan (prereq): → ~6/10
- A (thesis tracking) + B (backtest): → ~7 — B may also *revise* the number
  honestly in either direction; that's the point
- C (portfolio) + E (guardrails): → the 8s, by attacking allocation and
  behavior — the actual drivers of long-term returns
- D (forward inputs): sharpens the signal within the ceiling

A 9 requires Phase B's calibration table coming back monotonic and the
threshold sweep confirming the cutoffs. That's earned, not built.

## Cross-cutting rules for every phase

- Preserve the committee's purity: no network or async inside
  `client/src/utils/analyst/` — new data arrives as inputs, pre-loaded by
  hooks/`loadCommitteeData`.
- Every new metric optional; missing data must never crash, NaN a score, or
  change behavior relative to today.
- Beginner-friendly finding text (plain English, explain the term inline).
- Bump `COMMITTEE_ENGINE_VERSION` on any scoring change (Phase A5).
- Verify with eslint + esbuild/node sims (build is broken on the local Node;
  see primer). Update `AiCommitteeHelpModal.jsx` whenever behavior changes.
- Dexie: new stores = append a full new `schemaVersions` entry; never edit a
  released entry (the file documents this).
