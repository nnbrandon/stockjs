# Plan: Financial Strength data for the AI Committee (cash flow + balance sheet)

**Status: IMPLEMENTED (2026-07-06).** Kept as design documentation. All four
phases landed: merged cash-flow + balance-sheet modules in
`server/handlers/fundamentals.js` (field names verified live: `freeCashFlow`,
`operatingCashFlow`, `totalDebt`, `stockholdersEquity`,
`cashAndCashEquivalents`), FCF-margin / earnings-quality / debt / ROE scoring
in `dataScout.js` (including a P/FCF valuation fallback via
`dilutedAverageShares`, and ROE skipped when debt-to-equity > 2 since leverage
manufactures ROE), two new Bear exit-checklist items, and the help-modal
update. Verified via live handler calls (AAPL full merge, VTI graceful
degrade) and esbuild sims (cash burner −11.6 pts, fortress +17 pts, stale
cache byte-identical).

## Goal

The AI Committee (`client/src/utils/analyst/`) currently judges "Company
finances" from the **income statement only** (revenue, net income, EPS) plus
earnings beat history. That leaves it blind to the two things a long-term
investor cares most about:

- **Cash generation** — net income can be massaged; free cash flow can't. A
  company with rising "profits" but collapsing FCF is a classic trap.
- **Balance-sheet strength** — debt load, net cash, and return on equity.
  Today a debt-drowning company and a cash-rich one score identically.

This plan adds both via the Yahoo Finance API the backend already uses, then
scores them inside the existing "Company finances" pillar. **Keep the three
pillars as-is** (Price trend / Company finances / News mood) — the new metrics
become additional components of the fundamental score, so no UI or
Portfolio-Manager weight changes are needed.

## Current architecture (read this first)

Data flow for the committee:

1. **Server** (`server/handlers/fundamentals.js`): `fetchFundamentals` calls
   `yahooFinance.fundamentalsTimeSeries(symbol, { period1, period2, type:
   "quarterly"|"annual", module: "financials" }, { validateResult: false })`
   and returns `{ quarterlyResult, annualResult, earningsResult }`. The server
   deploys automatically to AWS Lambda on push to `main` (see `DEPLOY.md`);
   `server/local-server.js` runs it locally.
2. **Client fetch** (`client/src/LambdaService.js` → `fetchFundamentals`) —
   passes the JSON through untouched.
3. **Storage** (`client/src/db/stores/fundamentals.js` → `saveFundamentals`):
   rows go into Dexie (IndexedDB) tables `quarterlyResult` / `annualResult`,
   keyed `[symbol+date]`. Dexie stores non-indexed fields schemalessly —
   **adding fields to rows requires NO schema version bump** in
   `client/src/db/database.js`.
4. **Committee input** (`client/src/utils/loadCommitteeData.js` and
   `client/src/hooks/useSymbolData.js`): loads cached rows, merges the
   earnings feed into quarterly rows (`mergeEarningsIntoQuarterly.js`), and
   calls `runAnalystCommittee` (`client/src/utils/analyst/index.js`).
5. **Scoring** (`client/src/utils/analyst/agents/dataScout.js`): builds
   `fundamentalScore` as the average of `components`, each a 0–100 number from
   `scaleClamp`. The Bear (`agents/bear.js`) runs an exit-signal checklist off
   `dataScout.metrics`. The Portfolio Manager (`agents/portfolioManager.js`)
   maps the weighted composite to Strong Buy / Buy / Hold / Reduce / Sell.

All committee code is pure, synchronous JS with `Number.isFinite` guards
everywhere — missing fields must simply cause a component to be skipped, never
a crash. Preserve that property.

## Phase 1 — Server: fetch cash-flow and balance-sheet modules

**File: `server/handlers/fundamentals.js`**

`fundamentalsTimeSeries` accepts `module: "financials" | "balance-sheet" |
"cash-flow" | "all"`. Extend the existing `Promise.all` with four more calls
(quarterly + annual for each new module), keeping `{ validateResult: false }`.

Then **merge the three quarterly result arrays into one row per date** (and
the same for annual) so the response shape stays exactly
`{ quarterlyResult, annualResult, earningsResult }` and steps 2–4 of the data
flow need zero changes. Merge keyed on the row's `date` (same reporting period
ends give identical dates across modules; if a row's date has no exact match,
match within ±10 days, else keep the row with whatever fields it has).

Fields to carry through (verify exact names against a real response at
implementation time — log one `AAPL` response; yahoo-finance2 camelCases the
Yahoo keys):

- cash-flow: `freeCashFlow`, `operatingCashFlow`, `capitalExpenditure`
- balance-sheet: `totalDebt`, `stockholdersEquity`,
  `cashAndCashEquivalents` (or `cashCashEquivalentsAndShortTermInvestments`),
  `currentAssets`, `currentLiabilities`

Simplest merge implementation: a helper
`mergeRowsByDate(...rowArrays)` in the handler that indexes by `date` and
`Object.assign`s. Don't rename existing fields — the client depends on
`totalRevenue`, `netIncome`, `dilutedEPS` as-is.

**Local verification:** run `node server/local-server.js`, hit
`http://localhost:<port>/?action=fundamentals&symbol=AAPL&start=<5y-ago-iso>&end=<today-iso>`,
confirm quarterly rows contain both `totalRevenue` and `freeCashFlow` /
`totalDebt` on the same row.

**Failure tolerance:** if the cash-flow or balance-sheet call throws (some
tickers lack them), catch per-call and proceed with whatever succeeded —
income-statement data must never be lost because a new module failed.

## Phase 2 — Client: nothing structural, one behavioral note

- `saveFundamentals` / Dexie: no changes (schemaless extra fields,
  `bulkPut` replaces whole rows so refreshed rows pick up new fields).
- `loadCommitteeData.js` / `useSymbolData.js`: no changes.
- **Stale-cache reality:** already-cached rows won't have the new fields until
  the user refreshes a symbol (daily refresh or re-add). The scoring code must
  therefore treat the fields as optional (it will, if the `Number.isFinite`
  guard pattern is followed). Optionally: when `dataScout` sees revenue but no
  cash-flow fields at all, emit a neutral finding like "Refresh this symbol to
  pull cash-flow and debt data" so users know why the new checks are silent.

## Phase 3 — Data Scout: score the new metrics

**File: `client/src/utils/analyst/agents/dataScout.js`**, inside the existing
fundamentals section (after the margin-trend block, before the annual block).
All of these push onto the existing `components` array and write to `metrics`
so the Bear can read them. Follow the existing beginner-friendly finding tone
(plain English, no unexplained jargon).

Use the already-sorted `q` (quarterly desc). Define TTM sums over the latest 4
quarters that have the field (require all 4, like `ttmEps` does):

1. **Free-cash-flow margin.** `fcfTTM / revenueTTM * 100` →
   `metrics.fcfMargin`; component `scaleClamp(fcfMargin, -5, 20, 5, 90)`.
   Findings: `> 15` → bull "Turns N cents of every sales dollar into spendable
   cash (excellent)"; `< 0` → bear weight 2 "Burning cash — spends more than
   the business brings in".
2. **Earnings quality (accruals).** If `netIncomeTTM > 0` and
   `fcfTTM < 0.5 * netIncomeTTM`: component `25`, bear weight 2 "Reported
   profits aren't turning into real cash — a classic warning sign". If
   `fcfTTM > netIncomeTTM * 1.1`: bull weight 1 "Generates more cash than its
   reported profit — high-quality earnings" (no component; quality bonus only
   when negative, to stay conservative).
3. **Debt load.** From the latest quarterly row with balance-sheet data:
   `debtToEquity = totalDebt / stockholdersEquity` → `metrics.debtToEquity`.
   Guard: if `stockholdersEquity <= 0` → component `15`, bear weight 2 "Owes
   more than the whole company is worth on paper (negative equity)". Else
   component `scaleClamp(debtToEquity, 2.5, 0, 10, 85)` (lower debt → higher
   score). If `cashAndCashEquivalents > totalDebt` → bull "Has more cash than
   debt — a fortress balance sheet" and `metrics.netCash = true`.
4. **Return on equity.** `roeTTM = netIncomeTTM / stockholdersEquity * 100`
   (skip if equity ≤ 0) → `metrics.roe`; component
   `scaleClamp(roe, 0, 25, 15, 90)`. `> 20` → bull "Earns N¢ per year on every
   dollar shareholders have in the business — a sign of a high-quality
   company"; `0 < roe < 5` → bear weight 1.
5. **P/FCF valuation fallback.** In the existing valuation block, when
   `eps <= 0` (currently pushes a flat `25`): if `fcfTTM > 0` and shares can
   be derived, prefer price-to-FCF; otherwise keep the flat 25. (Optional —
   skip if share count isn't derivable from cached data.)

**File: `client/src/utils/analyst/agents/bear.js`** — extend
`buildExitChecklist` with two checks (same `add(available, hit, text)`
pattern):

- available: `Number.isFinite(m.fcfMargin)`; hit: `m.fcfMargin < 0` — "The
  company is burning cash rather than generating it"
- available: `Number.isFinite(m.debtToEquity)`; hit: `m.debtToEquity > 2` —
  "Carrying a heavy debt load relative to what shareholders own"

**File: `client/src/components/AiCommitteeHelp/AiCommitteeHelpModal.jsx`** —
in the pillars section, extend the "Company finances" description to mention
free cash flow, debt, and return on equity.

## Phase 4 — Verification (do not skip)

There is no test framework in this repo. Two known environment gotchas:

- `npm run build` in `client/` **fails on Node 20.11.1** with
  `crypto.hash is not a function` (Vite 7 needs Node 20.19+). This is
  pre-existing and NOT caused by your changes. Verify with eslint + the sim
  below instead (or upgrade Node).
- Analyst imports are extensionless, so plain `node` can't run them — bundle
  with the repo's esbuild first.

Steps:

1. `cd client && npx eslint src/utils/analyst src/components/AiCommitteeHelp`
2. Simulation harness: write a script that imports `runAnalystCommittee` with
   synthetic candles + quarterly rows (a prior session's pattern: generate
   ~300 daily candles with a drift, 8 quarterly rows with revenue/margin
   drift). Add the new fields (`freeCashFlow`, `totalDebt`,
   `stockholdersEquity`, `cashAndCashEquivalents`) to the synthetic rows.
   Bundle and run:
   `client/node_modules/.bin/esbuild sim.js --bundle --format=esm --platform=node --outfile=sim.mjs && node sim.mjs`
   Assert:
   - Cash-burner with heavy debt → fundamental score drops materially vs. the
     same inputs without the new fields; Bear reports the new sell signals.
   - Cash-rich high-ROE grower → fundamental score rises; "fortress balance
     sheet" finding appears.
   - Rows **without** any new fields (stale cache) → identical behavior to
     today, no crash, no NaN in any score.
3. Server: run `local-server.js` against a real symbol as described in
   Phase 1.
4. Manual end-to-end (if Node allows `npm run dev`): refresh a real symbol,
   open the AI Committee tab, confirm new findings render and the verdict
   banner still shows a tier (Strong Buy / Buy / Hold / Reduce / Sell).

## Explicit non-goals (follow-ups, separate plans)

- **Forward estimates** (`yahooFinance.quoteSummary` modules `earningsTrend`,
  `financialData`, `defaultKeyStatistics`): forward P/E and estimate
  revisions. Needs a new backend action + a new Dexie store — bigger change.
- **Relative strength vs. SPY**: client-only, compare 3/6-month momentum to a
  cached benchmark; needs SPY candles to be cached for everyone first.
- **Backtesting the thresholds**: the tier cutoffs (78/64/45/33 in
  `portfolioManager.js`) are hand-tuned heuristics, not validated.
- Changing pillar weights or adding a fourth pillar.

## Context on the committee's design intent

The user is a **long-term position investor (explicitly not a day trader)**
and wants beginner-friendly output. The committee was recently reworked to
think that way: regime-aware RSI (oversold in a downtrend is a warning, not a
bargain), margin-erosion detection, an exit-signal checklist in the Bear, a
Reduce tier, and a Portfolio Manager that explains why to sell and what to do
with the proceeds. Keep new findings in that same plain-English voice, and
keep every metric optional so partial data degrades gracefully.
