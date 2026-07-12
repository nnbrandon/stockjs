# AI Committee "think like an analyst" round — implementation plan (v8)

Five improvements agreed with the user (a beginner, long-term position
investor — no day trading). Theme: move the committee from "screener that
scores today's snapshot" toward "analyst with a thesis, a memory, and
self-audit habits."

This document is self-contained: it records the codebase facts an implementer
needs (verified 2026-07-10 against the working tree), then specs each item.

**The five items:**
1. Persistent thesis with kill criteria ("why you own it", checked every run)
2. Expected-return estimate (plain-English 5-year return decomposition)
3. Quality-of-earnings red flags (receivables, stock-based comp, inventory) — **the only scoring change**
4. Post-earnings review ("what we expected vs. what happened")
5. Portfolio-level risk: sector concentration + correlation clusters

**Suggested order:** 3 (small, scored, sets the v8 version bump) → 2 → 4 →
5 → 1 (largest). Items are independent; nothing blocks on another item.

---

## Codebase facts you need (verified 2026-07-10)

**Layout.** Three packages:
- `packages/committee-engine` — the committee's brain. Pure, synchronous,
  dependency-free JS shared by browser and Lambda. **No network, no DOM, no
  AWS imports allowed in here.** Imports are extensionless (`from
  "../indicators"`), so plain `node` cannot run these files — they must be
  bundled (esbuild) first. Has a working test suite:
  `packages/committee-engine/test/*.test.js` + `npm test` (a script that
  esbuild-bundles each test then runs `node --test`). Fixtures live in
  `test/fixtures.js`.
- `server` — Lambda (`type: module`). Bundles via `npm run bundle` (esbuild,
  aliases `@stockjs/committee-engine` → `../packages/committee-engine/src`).
  Verdicts are computed here daily and on demand; the client and daily email
  read the same stored results ("single source of truth"). Server has **no
  eslint config** — don't lint it.
- `client` — Vite + React 19 + MUI. **`vite build` fails on this machine
  (Node 20.11.1; Vite 7 wants 20.19+). Do not use it for verification.**

**Verification commands that work here:**
```sh
# Engine tests
cd packages/committee-engine && npm test

# Lint (engine and client each have eslint.config.js)
cd packages/committee-engine && npx eslint src test
cd client && npx eslint src

# Client compile check (instead of vite build):
cd client && npx --yes esbuild@0.24 src/main.jsx --bundle --format=esm \
  --outfile=/dev/null --loader:.js=jsx --loader:.png=dataurl \
  --loader:.svg=dataurl --loader:.css=empty \
  --alias:@stockjs/committee-engine=$(pwd)/../packages/committee-engine/src

# Run engine/server code in node (bundle first; same pattern as server's npm run bundle):
npx --yes esbuild@0.24 <entry.js> --bundle --format=esm --platform=node \
  --target=node20 --outfile=<out.mjs> \
  --alias:@stockjs/committee-engine=<abs>/packages/committee-engine/src \
  --banner:js="import { createRequire as __cjsRequire } from 'node:module'; import { fileURLToPath as __fileURLToPath } from 'node:url'; import { dirname as __pathDirname } from 'node:path'; var require = __cjsRequire(import.meta.url); var __filename = __fileURLToPath(import.meta.url); var __dirname = __pathDirname(__filename);"
node <out.mjs>
```

**Engine flow.** `runAnalystCommittee(input)`
(`packages/committee-engine/src/analyst/index.js`) runs `runDataScout` →
`runSentimentAnalyst` → `runBear` → `runDevilsAdvocate` →
`runPortfolioManager` and returns `{ verdict, pillars, risk, metrics,
agents[], generatedAt }`. Pillar weights: fundamental 0.45 / technical 0.35 /
sentiment 0.20 (`portfolioManager.js` ~line 1077). Findings are
`{ text, polarity: "bull"|"bear"|"neutral", weight }` built with
`bull/bear/neutral(text, weight)` from `analyst/agents/helpers.js`. **Only
`components.push(score)` entries affect the pillar score; findings are
display-only.** That's the version-bump rule: new/changed `components` = bump,
findings/metrics alone = no bump.

**Server pipeline** (`server/lib/committeePipeline.js`):
- `analyzeSymbols(uniqueHoldings, state)` fetches per symbol (candles 420d,
  fundamentals via `fetchFundamentalsData`, analyst estimates via
  `fetchAnalysisData`, news), runs FinBERT on unseen articles, then per
  symbol: merges earnings into quarterly, calls `runAnalystCommittee`,
  computes `previousSnapshot`/`tierChange` (with `.reason` via
  `explainTierChange`), and appends one **verdict-history row per symbol per
  day** (`row = {...}` ~line 285): `{ symbol, day, engineVersion, composite,
  price, tier, action, conviction, technical, fundamental, sentiment,
  exitSignals, fireSale, generatedAt }`. History capped at
  `MAX_HISTORY_ROWS = 60`, oldest → newest, keyed `day = pacificDay()`.
- Per-symbol persisted state (S3, `committee-state.json`, see
  `server/lib/reportState.js` `loadState`/`saveState`): `state.symbols[SYM] =
  { articles, history, latest }` where `latest = toLatestBlock(r,
  generatedAt)` = `{ report, previousSnapshot, tierChange, newsMood,
  topPositive, topNegative, isFund, error, generatedAt, engineVersion }`
  (~line 361). **Anything added to a symbol result must be threaded through
  `toLatestBlock` and `nextSymbolStateEntries` to persist and reach the UI.**
- `computeUserView(holdings, resultBySymbol)` (~line 396) joins holdings onto
  symbol results and returns `{ results, health, trackRecord }`. `health`
  comes from `analyzePortfolioHealth(items)` where each item is `{ symbol,
  isFund, currentValue, lastDate, closes, tier, action, composite }` — note
  **no `sector` today** (item 5 adds it; it's available as
  `r.report?.metrics?.sector`, set in dataScout when the analysis payload
  carries `assetProfile.sector`).
- The committee endpoint (`server/handlers/committee.js`) and the daily email
  (`server/handlers/dailyReport.js`) both consume `computeUserView`.

**Engine inputs already available per symbol** (all flow into
`runAnalystCommittee` today — see the call in `committeePipeline.js` ~line 256):
- `chartData` (candles), `quarterly` (merged income+cash-flow+balance-sheet
  rows per reporting date), `annual` (same, annual), `earnings` (analyst
  EPS estimate-vs-actual rows), `news`, `history` (verdict rows), `analysis`
  (flattened estimates: `forwardEps, eps30dAgo, eps90dAgo, forwardEpsGrowth,
  revisionsUp30d, revisionsDown30d, analystCount, targetMeanPrice,
  recommendationMean, forwardPE, pegRatio, beta, sector, industry`),
  `benchmarkCandles` (SPY), `nextEarningsDate`, `nextEarningsDateIsEstimate`,
  `sector`.
- Earnings rows (`fetchEarningsHistory` in `server/handlers/earningsHistory.js`)
  have: `{ date, epsActual, epsEstimate, epsDifference, surprisePercent,
  reportedDate, revenueActual, netIncomeActual, profitMargin }`, newest
  first, plus top-level `nextEarningsDate` / `nextEarningsDateIsEstimate`.
- Quarterly/annual statement rows come from Yahoo `fundamentalsTimeSeries`
  modules `financials`, `cash-flow`, `balance-sheet`, merged by date
  (`server/lib/marketData.js` `fetchFundamentalsData`). Field names are
  lowerCamelCase. **Verified available in the yahoo-finance2 key list**
  (`server/node_modules/yahoo-finance2/esm/src/lib/timeseries.js`):
  `netIncome`, `totalRevenue`, `freeCashFlow`, `operatingCashFlow`,
  `accountsReceivable`, `receivables`, `grossAccountsReceivable`,
  `stockBasedCompensation`, `inventory`, `totalDebt`, `stockholdersEquity`,
  `dilutedAverageShares`, `basicAverageShares`, `cashDividendsPaid`,
  `capitalExpenditure`. All three modules are already fetched — **no new
  network calls are needed anywhere in this round.** (Fields are simply
  absent on rows when a company doesn't report them — always check
  `Number.isFinite` and stay silent when missing.)

**Metrics already computed** (names verified):
- dataScout (`analyst/agents/dataScout.js`): `metrics.price`,
  `revenueGrowthYoY` (line ~339), `netMargin`, `netMarginChange`, `fcfTTM`,
  `fcfMargin`, `debtToEquity`, `netCash`, `roe`, `ttmEps`, `trailingPE`,
  `sector`, `sectorValuationVerdict`, `rsi14`, `nextEarningsDate`,
  `forwardPE`, `forwardEpsDrift`, `revisionsUp30d/Down30d`. Helpers in scope
  inside the fundamentals section: `ttmSum(field)`, `ttmPaired(fieldA,
  fieldB)` (both require 4 quarters), `findYearAgoRow(rows, latest)` (from
  helpers.js), `q` = quarterly rows sorted newest-first, `latestIncome`,
  `incomeYearAgo`. An FCF-vs-net-income earnings-quality check **already
  exists** (~lines 477–505) — item 3 adds the checks it doesn't cover; don't
  duplicate it.
- longTermLens (`analyst/agents/longTermLens.js`, merged into the
  fundamental score): `consistencyYears`, `revenueUpYears`,
  `profitableYears`, `marginDriftYears`, `shareCountChangePerYearPct`
  (negative = buybacks), `dividendsPaidTTM`, `dividendYieldPct`,
  `dividendPayoutOfCashPct`, `dividendGrowthYoY`.
- earnings agent (`analyst/agents/earningsHistory.js`): `earningsBeatRate`,
  `earningsBeatStreak`, `lastEpsSurprise`, `earningsRevenueGrowthYoY`,
  `daysSinceLastEarnings`.
- Sector bands: `packages/committee-engine/src/sectorBenchmarks.js` —
  `SECTOR_BENCHMARKS[sector].typicalPE = [low, high]` for the 11 Yahoo sector
  strings, and `sectorValuationRead(pe, sector)`.
- `historicalPESeries(candles, quarterly)` is exported from
  `analyst/agents/portfolioManager.js` (own-history P/E series).

**Client surfaces:**
- `client/src/components/AnalystPanel/AnalystPanel.jsx` (769 lines) — the
  per-stock committee tab. Renders (top to bottom): verdict banner
  (tier/score/conviction, fire-sale + tier-change chips, `tierChange.reason`
  line), `TwoAnswers` (ownIt / addNow), `GamePlan` (entry/exit/watch plan,
  tranches), then `AgentCard` per agent (the findings transcript). Data comes
  from the server-stored `latest` block via `useServerCommittee(symbol)`;
  `committee.row.history` is available in the panel.
- `client/src/components/PortfolioCommitteePanel/PortfolioCommitteePanel.jsx`
  — the portfolio sidebar; renders per-position verdict cards +
  `TrackRecordCard`. The old PortfolioHealthCard was **removed** — `health`
  is still delivered to the client (`usePortfolioCommittee` exposes it,
  `committeeServerCache` stores it) but **nothing renders it today**. Item 5
  gives its flags a new, compact home.
- `client/src/components/RecentEarningsBanner/` exists (shows recent
  earnings on the stock page) — item 4's panel card must check it for
  overlap and complement, not duplicate.
- Findings render automatically in the transcript — engine-side findings
  need zero client work.
- CSS modules for layout; palette via `var(--palette-*)` custom properties;
  MUI `Button`/`IconButton` styled via `sx`, never native `<button>`.

**Daily email** (`server/lib/reportEmail.js`): `renderReportEmail(results,
health, meta)` builds subject + sections (tier changes first, then holdings
sorted by `listingRank`). Per-holding blocks are `holdingHtml(r, appUrl)` and
`holdingText(r, appUrl)` (**both must be updated in lockstep** — every email
feature has an HTML and a plain-text twin). Labeled rows use the local
`labeled(label, value)` pattern; `earningsHeadsUp(report)` (~line 77) is the
model for a conditional per-holding line. `describeTrackRecord` is imported
from the engine — shared phrasing lives engine-side so app and email read
identically; follow that pattern for any new shared wording. The
portfolio-health section was deliberately removed from the email — do not
re-add it; the email must stay SHORT.

**Conventions (do not violate):**
- Beginner wording everywhere. Full sentences, no trader jargon ("alpha",
  "accruals", "multiple re-rating", "CAGR"). Explain comparisons in plain
  words. Tone model: "Keeps 27 cents of every sales dollar as profit
  (healthy)".
- Silence over speculation: when a field is missing, produce NO finding and
  no penalty (see longTermLens dividends comment — never claim "pays no
  dividend" on a missing field).
- **Bump `COMMITTEE_ENGINE_VERSION`** in
  `packages/committee-engine/src/analyst/version.js` **once, to 8**, with a
  dated changelog comment listing this round (item 3 is the scoring change;
  note items 1/2/4/5 as display-only in the same comment). Verdict-history
  comparisons only trust same-version rows.
- Server redeploy = `cd server && npm run bundle` + the user updates the
  Lambda themselves. Say in the final summary which changes need redeploy vs
  client-only.
- Never claim something is verified unless a command actually ran it.

---

## Item 3 (do first — the scoring change): quality-of-earnings red flags

**Goal.** A good analyst smells bad earnings before they break. The engine
already checks FCF vs. net income; add the three classic forensic checks it's
missing. All data is already on the quarterly rows.

**Where:** dataScout's financial-strength section (after the existing
FCF-vs-income block, ~line 505), using the in-scope helpers `ttmPaired`,
`findYearAgoRow`, `q`.

**3a. Receivables running ahead of sales.** Companies can inflate revenue by
booking sales customers haven't paid for; receivables growing much faster
than revenue is the tell.
- Latest quarterly row with a finite `accountsReceivable ?? receivables`
  (call it `recNow`, from row `rNow` — the newest row carrying the field) and
  its year-ago counterpart via `findYearAgoRow(rowsWithField, rNow)`
  (`recThen`). Require the same two rows to carry finite `totalRevenue > 0`
  (use `rNow.totalRevenue` / year-ago row's `totalRevenue`); balance-sheet
  and income fields are merged onto the same dated rows, so pairing is
  natural — but guard every field.
- `recGrowth = (recNow/recThen − 1) * 100`, `revGrowth` same for revenue.
- Flag when `recGrowth − revGrowth > 25` **and** `recGrowth > 15`:
  `components.push(25)`; bear, weight 2: "Customers owe it a lot more than a
  year ago (+{recGrowth}%) while sales grew {revGrowth}% — sales booked
  before the cash arrives can be a sign of forced growth". Set
  `metrics.receivablesVsRevenueGapPp`.
- Mild version (`gap > 15`): no component, bear weight 1, softer wording.
- Silence when either field is missing anywhere (banks/insurers report
  oddly; foreign listings often lack the field).

**3b. Stock-based compensation load.** Paying staff in shares is a real cost
that never touches "profit" but lands on shareholders as dilution.
- `sbcVsRev = ttmPaired("stockBasedCompensation", "totalRevenue")`; when
  present and revenue > 0: `sbcPct = sbc/revenue * 100`,
  `metrics.sbcPctOfRevenue = sbcPct`.
- `sbcPct > 20`: `components.push(22)`; bear weight 2: "Pays out
  {sbcPct}% of its sales in new stock to employees — a real cost that
  doesn't show in profit, and it waters down each share you own".
- `10 < sbcPct ≤ 20`: `components.push(35)`; bear weight 1, softer.
- `sbcPct ≤ 10` or field missing: silence (most non-tech companies don't
  report it — never reward its absence).
- Note: longTermLens already flags share-count growth; that measures the
  *outcome* (dilution), this measures the *expense*. Both can fire — the
  wording above is different enough not to read as a duplicate.

**3c. Inventory building faster than sales.** Unsold goods piling up often
precede discounts and margin hits.
- Same year-ago pairing as 3a on `inventory`. Flag when
  `invGrowth − revGrowth > 30` and `invGrowth > 20`: `components.push(30)`;
  bear weight 1: "Unsold goods are piling up — inventory grew {invGrowth}%
  while sales grew {revGrowth}%. Stockpiles like that often get cleared with
  price cuts, which hurts profit". `metrics.inventoryVsRevenueGapPp`.
- Silence when `inventory` missing (services/software) — this is the common
  case and must stay a true no-op.

**Version bump:** these add scored components → bump
`COMMITTEE_ENGINE_VERSION` to 8 (the single bump for the whole round).

**Tests** (`packages/committee-engine/test/`, extend fixtures): a fixture
with receivables growing 50% on 5% revenue growth trips 3a (assert the bear
finding + a lower fundamental score than the clean fixture); SBC at 25% of
revenue trips 3b; inventory checks trip 3c; a fixture with the fields absent
produces none of the three findings and an unchanged score vs. before this
item (lock that in by asserting no finding text matches /owe it|new stock|
piling up/). Run the full suite — existing tests assert current scores and
some may legitimately change if their fixtures accidentally trip a new check;
fix fixtures, not thresholds.

---

## Item 2: expected-return estimate (display-only)

**Goal.** Analysts don't stop at "cheap/expensive" — they estimate what
you'd earn owning it. Decompose a rough 5-year annual return: business
growth + cash returned to shareholders + valuation drifting back to normal.
Beginner-worded, honest about uncertainty, and **never scored** (its inputs —
growth, yield, valuation — are already scored individually; scoring the
combination would double-count).

**Engine:** new pure file `packages/committee-engine/src/expectedReturn.js`,
exported from the barrel (`src/index.js`):

```js
estimateExpectedReturn({ metrics = {}, analysis = null, annual = [] })
// → { totalPct, lowPct, highPct, growthPct, yieldPct, driftPct,
//     basis: { peNow, peMid, sector } } | null
```

- **Eligibility:** require `Number.isFinite(metrics.trailingPE) &&
  metrics.trailingPE > 0` and `Number.isFinite(metrics.price)` — no estimate
  for unprofitable companies (a loss-maker's return hinges on a turnaround
  no formula should promise). Funds never reach the engine.
- **growthPct** — how fast the business is growing: average of (a) analyst
  forward EPS growth `analysis.forwardEpsGrowth * 100` when finite, and (b)
  realized annual revenue growth over up to 5 annual rows (oldest vs newest
  finite `totalRevenue`, annualized: `((newest/oldest)^(1/years) − 1) * 100`,
  require ≥ 3 rows). Use whichever is available; null if neither. Clamp to
  [−5, 18] — analysts' forward numbers skew optimistic and no 5-year
  assumption should exceed ~18%/yr.
- **yieldPct** — cash handed back: `(metrics.dividendYieldPct ?? 0) +
  max(0, −(metrics.shareCountChangePerYearPct ?? 0))` (buybacks shrink the
  share count; that per-year shrink rate is effectively a yield). Clamp to
  [0, 6].
- **driftPct** — valuation drifting toward normal over 5 years: with
  `pe = metrics.trailingPE` and the sector band from
  `SECTOR_BENCHMARKS[sector].typicalPE`, `peMid = (low + high) / 2`,
  `driftPct = ((peMid / pe) ** (1/5) − 1) * 100`, clamp to [−6, +6]. When
  the sector is unknown, fall back to the midpoint of the stock's own
  3-year P/E history via `historicalPESeries(candles, quarterly)` **only if
  candles/quarterly are passed in** — simpler: accept `peMid` resolution
  from sector only in this round and set `driftPct = 0` (and omit the drift
  sentence) when sector is unknown. Keep it simple; note the own-history
  fallback as a future step.
- **totalPct** = growthPct + yieldPct + driftPct (treat null growth as
  ineligible → return null; null pieces of yield/drift as 0). `lowPct/highPct`
  = totalPct ∓ 3 (an honesty band, not statistics).
- Guardrail: if totalPct is absurd (> 25 or < −10) return the object with a
  `capped: true` marker and clamp total to that range — the UI wording
  hedges harder when capped.

**Wiring:** call it inside dataScout after the valuation section (it has
`metrics`, `analysis`, and `annual` in scope — check `runDataScout`'s
signature; `annual` is already a parameter). Store the result as
`metrics.expectedReturn`. Add ONE neutral finding (weight 1) when non-null,
e.g.: "Rough 5-year math: if profits grow ~{growthPct}% a year and the
valuation settles toward normal, this could return roughly
{lowPct}–{highPct}% a year including dividends and buybacks. A sketch, not a
promise." Round everything to whole percents. No components — display-only,
no extra version bump beyond item 3's.

**Client (`AnalystPanel.jsx`):** a small card between `TwoAnswers` and
`GamePlan` titled "What could it return?" showing the headline range and the
three pieces as one plain sentence each ("Business growth ~{g}%/yr · cash
returned to you ~{y}%/yr · valuation drift {d>=0 ? "+" : ""}{d}%/yr"). One
fixed caveat line: "Rough math from today's numbers — real results will
differ." Render nothing when `metrics.expectedReturn` is missing. CSS module
alongside.

**Email:** skip — the email stays short; the finding line rides along in no
email surface today and that's fine.

**Tests:** fixture with PE 20 in Technology (band [20,35] → mid 27.5 →
positive drift), 10% revenue growth, 1% dividend + 2%/yr buyback → assert
each piece and the clamps; unprofitable fixture → null; unknown sector →
driftPct 0; absurd growth clamps to 18 and `capped` when total > 25.

---

## Item 4: post-earnings review (display-only)

**Goal.** Analysts review every earnings report: what we expected, what
happened, did our view change. The data all exists (estimate vs. actual,
verdict history, candles) — synthesize it for ~10 days after each report.

**Engine:** new pure file `packages/committee-engine/src/earningsReview.js`,
exported from the barrel:

```js
buildEarningsReview({ earnings = [], history = [], candles = [],
                      report = null, windowDays = 10, nowMs = Date.now() })
// → { reportedDate, epsActual, epsEstimate, surprisePercent,
//     revenueGrowthYoY, priceReactionPct, verdictBefore, tierNow,
//     lines: string[] } | null
```

- Find the newest earnings row whose `reportedDate` is within `windowDays`
  of `nowMs` (and not in the future). Null if none — the common case.
- **priceReactionPct:** last close strictly before `reportedDate` vs. the
  first close on/after it +1 trading day settled — concretely: `before` =
  last candle with date < reportedDate, `after` = last candle overall if it
  is ≥ reportedDate, else null. `(after/before − 1) * 100`. Null-safe.
- **verdictBefore:** newest history row with `day <` the reportedDate's
  YYYY-MM-DD → `{ tier, composite, day }` (any engine version — this is
  display, and a tier label is comparable across versions). `tierNow` from
  `report?.verdict?.tier`.
- **lines** (beginner voice, each a full sentence, skip any with missing
  data):
  1. Expectation vs. outcome: "Before the report, analysts expected profits
     of ${epsEstimate} per share; the company delivered ${epsActual} —
     {beat it by X% | fell Y% short | right in line}."
  2. Revenue context when `revenueGrowthYoY` finite (reuse the same YoY
     match as the earnings agent — pass it in or recompute with
     `findYearAgoRow`): "Sales {grew|shrank} {x}% vs. the same quarter last
     year."
  3. Market reaction when priceReactionPct finite: "The stock has moved
     {up|down} {x}% since the report."
  4. Committee stance: "The committee rated it {verdictBefore.tier} going
     in{, and it's {tierNow} now | — unchanged after the report}."
- Keep the numbers rounded; never invent a causal claim ("because").

**Server:** in `committeePipeline.js` after `runAnalystCommittee` returns,
call `buildEarningsReview({ earnings, history, candles: f.candles, report })`
(use the pre-update `history` — today's row not yet appended is fine; the
review only reads rows before the report date). Attach as `earningsReview`
on the symbol result and thread through `toLatestBlock` so it persists and
reaches the client. **Needs redeploy.**

**Client (`AnalystPanel.jsx`):** compact card "Earnings review" rendering
`latest.earningsReview.lines` (one per line), placed near the verdict banner.
First check `RecentEarningsBanner` (client component) for overlap: if it
already announces "reported N days ago", keep the banner as the attention
hook and make this card the substance — do not render the same sentence
twice.

**Email (`reportEmail.js`):** in `holdingHtml` AND `holdingText`, when
`r.latest?.earningsReview` exists (check actual shape: per-holding `r` in the
email is the user-view result — verify how `report`/`tierChange` are read
there and mirror it), add a labeled block "Earnings review" with `lines`
joined. Follows the `earningsHeadsUp` pattern (~line 77). Keep it to the
lines array — no new prose.

**Tests:** fixture earnings row reported 3 days ago + crafted candles/history
→ assert all four lines and the numbers; report 30 days ago → null; missing
epsEstimate → line 1 skipped but review still renders others; future
reportedDate → null.

---

## Item 5: portfolio-level risk — sector concentration + clusters (display-only)

**Goal.** "Four of your holdings are really the same bet." Pairwise
correlation already exists (`portfolioHealth.js`, returns-based over 90
days, flags pairs with r > 0.8) — upgrade it with sector grouping and
cluster detection, and give the flags a UI home again (the old health card
was removed; `health` currently renders nowhere).

**Server (`committeePipeline.js` `computeUserView`):** add
`sector: r.report?.metrics?.sector ?? null` to the items passed to
`analyzePortfolioHealth`. **Needs redeploy.**

**Engine (`packages/committee-engine/src/portfolioHealth.js`):**
- **Sector concentration:** among non-fund stocks with a known sector, sum
  `weightPct` per sector. When one sector holds > 40% of total portfolio
  value across ≥ 2 stocks, push a flag `{ kind: "sector", severity: pct > 60
  ? "warn" : "info", symbols: [...], text: "{pct}% of your portfolio is in
  one industry — {sector} ({SYM1, SYM2, …}). One bad year for that industry
  would hit most of your account at once." }`. Unknown sectors are skipped
  silently (never counted as a sector of their own).
- **Correlation clusters:** group the existing `correlatedPairs` into
  connected components (a tiny union-find over symbols). For components of
  ≥ 3 symbols, emit ONE flag: `{ kind: "correlation", severity: "info",
  symbols, text: "{SYM1}, {SYM2} and {SYM3} have been moving almost in
  lockstep — closer to one bet than three." }` and **suppress the individual
  pair flags for pairs inside that component** (pairs not in any ≥3
  component keep today's pair wording). Keep `correlatedPairs` in the
  returned object unchanged (API stability); add `clusters:
  [{ symbols: [...] }]`.
- Pure display logic — no version bump (portfolio health isn't part of the
  per-symbol verdict/history at all).

**Client:** new compact `PortfolioRisksCard.jsx` + module CSS in
`client/src/components/PortfolioCommitteePanel/`, rendered under
`TrackRecordCard`: title "Worth knowing", then just the flags (severity dot:
warn = `var(--palette-*)` warning color, info = muted; one plain sentence
each), max ~5, nothing when no flags. `usePortfolioCommittee` already
exposes `health` — no data plumbing needed client-side beyond reading it.
Deliberately smaller than the removed PortfolioHealthCard: no score, no
weights table — the user chose to remove the verbose version; this is a
short risk list, not a dashboard.

**Email:** none (health section was deliberately removed from the email).

**Tests:** extend `portfolioHealth` coverage (`test/` has
portfolioManager/trackRecord tests to model on): three tech stocks at 20%
each → sector flag with the right pct and symbols; sectors null → no sector
flag; four symbols where A-B, B-C, C-D correlate → one cluster flag listing
all four, no pair flags; a lone correlated pair still gets the pair flag.

---

## Item 1 (largest): persistent thesis with kill criteria

**Goal.** Verdicts are recomputed from scratch daily; nothing remembers WHY
the committee liked a stock. Store the thesis when a BUY is made — the 2–3
strongest business reasons, as *metric-based legs*, not prose — then check
every leg on every subsequent run: intact, weakening, or broken. "The reason
you bought is gone" is the best sell signal a long-term investor has.

**Design principle:** legs are defined by a fixed catalog keyed off
`report.metrics` (stable, numeric), NOT by matching finding text (which
changes wording). Each leg captures the metric value at thesis time; its
check re-reads the same metric later. Everything is pure engine code; the
*persistence* lives in the server pipeline's symbol state.

**Engine:** new pure file `packages/committee-engine/src/thesis.js`,
exported from the barrel. Two functions + the catalog:

```js
buildThesisSnapshot(report)  // → { legs: [...], } | null
checkThesis(snapshot, report) // → { status, legs: [...], line } | null
```

**Leg catalog** (id → qualify / capture / check; all read `report.metrics`,
`m` below). A leg qualifies at build time only when its metric is finite and
strong; it breaks later on an absolute floor OR a big slide from the captured
value. Every leg has a beginner `label` and plain-English `okLine` /
`brokenLine` templates:

| id | qualifies when | broken when | weakening when |
|---|---|---|---|
| `margins` | `m.netMargin >= 12` | `netMargin < 0` or `< captured − 6` | `< captured − 3` |
| `growth` | `m.revenueGrowthYoY >= 8` | `revenueGrowthYoY < 0` | `< captured / 2` |
| `cash` | `m.fcfMargin >= 10` | `fcfMargin < 0` | `< captured − 5` |
| `quality` | `m.roe >= 15` | `roe < 5` | `< captured − 7` |
| `buybacks` | `m.shareCountChangePerYearPct <= -0.75` | `>= +1` (now diluting) | `> 0` |
| `dividend` | `m.dividendPayoutOfCashPct <= 60` (and `m.dividendYieldPct` finite) | `> 100` or `dividendGrowthYoY <= -4` | `> 85` |
| `fortress` | `m.netCash === true` or `m.debtToEquity < 0.5` | `debtToEquity > 1.5` | `debtToEquity > captured * 2` (only when captured finite) |

- **buildThesisSnapshot:** only for `report.verdict.action === "BUY"`.
  Evaluate every catalog leg; rank qualifying legs by a simple strength
  ordering (distance above the qualify threshold, normalized per leg is
  overkill — a fixed catalog priority order `margins, cash, growth, quality,
  fortress, buybacks, dividend` then take the first 3 is fine and
  deterministic). Require ≥ 2 legs, else return null (a BUY with no strong
  business legs is a chart-driven buy — the pipeline stores no thesis and
  the UI card simply doesn't render). Each leg stores `{ id, label,
  capturedValue }`.
- **checkThesis:** re-evaluate each stored leg against current metrics:
  `intact` / `weakening` / `broken` / `nodata` (metric now missing → nodata,
  reported as "can't check this one right now", never broken). Overall
  `status`: `broken` when ≥ half the checkable legs are broken; `watch` when
  any leg is broken or ≥ 2 weakening; else `intact`. `line` = one sentence
  for compact surfaces: "The reasons you'd own it: {n} of {total} still
  hold." / "…{leg label} has broken down since the thesis was set." Legs
  carry per-leg plain lines with the numbers ("Profit margins have held up —
  22 cents per sales dollar vs. 24 when the thesis was set").
- Version-safety: the snapshot records `engineVersion` (caller passes it or
  import `COMMITTEE_ENGINE_VERSION` engine-side); metric definitions are
  stable across display-only bumps, so checks stay valid — but record it
  anyway for debugging.

**Server (`committeePipeline.js`) — persistence rules.** Symbol state gains
`thesis`: `symbols[SYM].thesis = { createdDay, engineVersion, price, tier,
legs }`.
- After computing `report` for a non-fund symbol:
  - If no stored thesis and `report.verdict.action === "BUY"`: build one
    (`buildThesisSnapshot`); if non-null, stamp `createdDay = day`,
    `price = report.metrics?.price`, `tier`.
  - If a stored thesis exists: `thesisCheck = checkThesis(thesis, report)`.
    Rebuild (replace) only when the stored thesis is `broken` AND today's
    action is `BUY` again — a genuine re-buy on a new thesis. Otherwise keep
    the original (the whole point is a stable anchor; do NOT refresh it on
    every BUY day).
  - Thread both through: symbol result gains `thesis` + `thesisCheck`;
    `toLatestBlock` gains `thesis` and `thesisCheck`;
    `nextSymbolStateEntries` persists `thesis` (alongside articles/history/
    latest). **Needs redeploy.**
- Add `statusChanged` on `thesisCheck` by comparing to `thesis.lastStatus`
  (store the previous run's overall status on the thesis object each run) —
  the email uses it to speak only when something changed.

**PM finding (display-only):** in the pipeline it's too late to inject a
finding into the report cleanly — instead the **client card and email own
the surfacing** (below). Do not alter `runPortfolioManager`'s scoring or
findings for this; the metrics that broke are already dragging the
fundamental score (scoring it again would double-count).

**Client (`AnalystPanel.jsx`):** card "Why you'd own it" between the verdict
banner and `TwoAnswers`. Content: header line "Thesis set {createdDay} at
{price}" then each leg as a row — ✓ (ok), ⚠ (weakening), ✗ (broken), ○
(can't check) + the leg's plain line. Overall-status footer only when not
intact: watch → "One of the reasons to own this is wobbling — worth
watching."; broken → "The original reasons to own this have broken down.
When the why is gone, long-term investors usually move on — see the
committee's current verdict above." Render nothing when no thesis.

**Email:** in the per-holding block, ONE conditional line (HTML + text
twins), only when `thesisCheck.statusChanged` and new status ≠ intact:
"Thesis check: {line}". Never a recurring section — only on change days.

**Tests** (this item needs the most): buildThesisSnapshot picks the top 3 by
priority and requires 2+ legs; HOLD/SELL verdicts → null; checkThesis
per-leg transitions (craft metric drifts across each threshold in the
table); nodata path (metric disappears → nodata, not broken); overall status
math; rebuild-on-rebuy rule (pipeline-level logic — test the pure parts in
the engine suite, and keep the pipeline rules simple enough to review by
eye).

---

## Cross-cutting notes for the implementer

- **One version bump for the whole round:** `COMMITTEE_ENGINE_VERSION` → 8,
  dated changelog comment naming item 3 as the scoring change and items
  1/2/4/5 as display-only additions (thesis tracking, expected return,
  earnings review, portfolio sector/cluster flags).
- Update `client/src/components/AiCommitteeHelp/` (help modal) if its text
  enumerates what the committee checks — quality-of-earnings and the thesis
  card are worth a sentence each there.
- Storage growth: the thesis object is tiny; `earningsReview` on `latest` is
  small and transient. Nothing here grows unbounded (history stays capped at
  60 rows).
- Wherever wording is shared between app and email, put the sentence
  builders engine-side (the `describeTrackRecord` pattern) rather than
  duplicating strings.
- After engine work: `cd packages/committee-engine && npm test && npx eslint
  src test`. After client work: eslint + the esbuild compile check. After
  server work: `cd server && npm run bundle` must succeed. For at least one
  item, do a live smoke: bundle a small entry that fetches one real symbol
  through `fetchSymbolData`-equivalent paths and prints the new fields
  (pattern in the "run engine/server code in node" snippet above).
- Final summary must state: what needs a server redeploy (items 1, 4, 5 and
  the engine bump all ship inside the Lambda bundle; item 2 and 3 are
  engine-only but reach production through BOTH the Lambda bundle and any
  client bundle) vs. what is client-only. The user runs `npm run bundle` +
  Lambda update and the client deploy themselves.
- Keep the email SHORT. When in doubt, panel yes, email no.
