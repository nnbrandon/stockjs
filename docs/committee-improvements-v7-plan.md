# AI Committee improvements — implementation plan (v7 round)

Six improvements agreed with the user (a beginner, long-term position investor
— no day trading). This document is self-contained: it records the codebase
facts an implementer needs, then specs each item. Items 1–4 and 6 are small
and independent; item 5 is a larger project. Suggested order: 6 (tests first,
they protect the rest), 1, 2, 3, 4, then 5.

---

## Codebase facts you need (verified 2026-07-10)

**Layout.** Three packages:
- `packages/committee-engine` — the committee's brain. Pure, synchronous,
  dependency-free JS shared by browser and Lambda. **No network, no DOM, no
  AWS imports allowed in here.** Imports are extensionless (`from
  "../indicators"`), so plain `node` cannot run these files — they must be
  bundled (esbuild) first.
- `server` — Lambda (`type: module`). Bundles via `npm run bundle` (esbuild,
  aliases `@stockjs/committee-engine` → `../packages/committee-engine/src`).
  Verdicts are computed here daily and on demand; the client and daily email
  read the same stored results ("single source of truth").
- `client` — Vite + React 19 + MUI. **`vite build` fails on this machine
  (Node 20.11.1; Vite 7 wants 20.19+). Do not use it for verification.**

**Verification commands that work here:**
```sh
# Lint (engine and client each have eslint.config.js; server has NONE — skip it there)
cd packages/committee-engine && npx eslint src/...
cd client && npx eslint src/...

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

**Key data flow.**
- `server/lib/committeePipeline.js` → `analyzeSymbols()` fetches data, runs
  `runAnalystCommittee` per symbol, and appends one **verdict-history row per
  symbol per day** (see `row = {...}` around line 274). Rows already store:
  `day, engineVersion, composite, price, tier, action, conviction, technical,
  fundamental, sentiment, exitSignals, fireSale, generatedAt`.
- `computeUserView(holdings, resultBySymbol)` (same file, ~line 386) returns
  `{ results, health, trackRecord }`. `trackRecord` comes from
  `packages/committee-engine/src/trackRecord.js` (`computeTrackRecord`) and
  grades past verdicts (price-stamped in history) against current prices.
- `server/handlers/dailyReport.js` uses all three for the email.
  `server/handlers/committee.js` (the endpoint the client hits) currently
  destructures **only `{ health }`** from `computeUserView` — the client
  never receives `trackRecord` (item 1 fixes this).
- Client: `client/src/utils/committeeServerCache.js` caches the server
  response (`storeCommitteeResponse`); `client/src/hooks/usePortfolioCommittee.js`
  exposes it; `PortfolioCommitteePanel` renders the portfolio sidebar;
  `useServerCommittee(symbol)` + `AnalystPanel` render the per-stock tab.
  `committee.row.history` (per-symbol verdict history) **is already available
  in `AnalystPanel`** (used by `getScoreSeries`).
- `server/handlers/earningsHistory.js` already requests Yahoo modules
  `["earningsHistory", "earnings", "calendarEvents"]` and reads
  `res.calendarEvents.earnings.earningsCallDate` (item 3 extends this).

**Conventions (do not violate):**
- Beginner wording everywhere. Full sentences, no trader jargon ("calls",
  "alpha", "excess return"). Explain any comparison in plain words. Existing
  findings are the tone model, e.g. "Keeps 27 cents of every sales dollar as
  profit (healthy)".
- Findings are built with `bull/bear/neutral(text, weight)` from
  `packages/committee-engine/src/analyst/agents/helpers.js`.
- MUI `Button`/`IconButton` (styled via `sx`), never native `<button>`.
  CSS modules for layout; palette via `var(--palette-*)` custom properties.
- **Bump `COMMITTEE_ENGINE_VERSION`** in
  `packages/committee-engine/src/analyst/version.js` (with a dated changelog
  comment) whenever *scoring* changes — new scored components, weights,
  thresholds. Wording-only or display-only changes do NOT bump it. History
  comparisons only trust same-version rows.
- Server redeploy = `cd server && npm run bundle` + user's Lambda update.
  Mention in the summary when a change needs redeploy vs client-only.

---

## Item 6 (do first): engine unit tests

**Goal.** The engine (~4,500 lines of scoring logic) has zero tests. Lock in
current behavior before touching anything else.

**Approach.** Node's built-in `node:test` + `assert`, with an esbuild-bundle
step because the engine's extensionless imports can't run in plain node.

- Add `packages/committee-engine/test/` with test entries importing from
  `../src/...`.
- Add a runner script `packages/committee-engine/scripts/run-tests.mjs` that:
  bundles each `test/*.test.js` with esbuild (`--alias` not needed — tests
  import relatively; just `--bundle --platform=node --format=esm
  --target=node20`) into a temp dir, then spawns
  `node --test <bundled files>`. Wire `"test": "node scripts/run-tests.mjs"`
  into the package.json. esbuild is available via `npx --yes esbuild@0.24`.
- What to cover (highest value first):
  1. `runAnalystCommittee` end-to-end on a **fixture**: build synthetic
     candles (400 days trending up), quarterly rows (8 quarters, growing
     revenue/netIncome/freeCashFlow/totalDebt/stockholdersEquity/
     dilutedAverageShares/cashDividendsPaid), annual rows (4 years), and
     assert: verdict shape, tiers for a strong vs weak fixture, `answers`
     (ownIt/addNow) present with labels, pillar scores in expected bands.
  2. `analyzeLongTermLens` (agents/longTermLens.js): consistency counts,
     buyback vs dilution direction, dividend payout bands, silence when
     fields are missing (non-payers must produce NO dividend finding and no
     penalty).
  3. `historicalPESeries` / `valuationRead` / `discountCheck` /
     `fireSaleStreak` in portfolioManager (export-or-test-via-integration:
     they are not exported — test through `runPortfolioManager` with crafted
     inputs, or export them; exporting for tests is acceptable).
  4. `computeTrackRecord` (trackRecord.js) and `buildExamples` +
     `computeMetrics` (client/src/utils/backtest/walkForward.js — pure, can
     be tested the same way from a client-side test or moved... leave it in
     place; add a small `client/scripts/run-engine-tests` is NOT needed —
     testing walkForward from the engine test runner is fine since it only
     imports the engine).
- Deterministic: no network, no Date.now() dependence where avoidable (pass
  fixed dates in fixtures; `scoreMomentum` uses `Date.now()` — craft history
  rows relative to today).

**Verify:** `npm test` in the engine package passes; break something on
purpose once to confirm the runner actually fails.

---

## Item 1: committee report card in the app panel

**Goal.** The server already grades the committee's real, live verdicts
(`trackRecord`) and emails it; the app never shows it. Surface it in the
portfolio sidebar so trust builds automatically. This is REAL outcomes —
distinct from the backtest modal (a simulation).

**Server (needs redeploy):**
- `server/handlers/committee.js` (~line 131): destructure and return
  `trackRecord` alongside `health` in the response payload. Check
  `server/handlers/portfolioSync.js` / wherever the GET view is assembled —
  the response the client caches must carry it on both the "fresh run" and
  "read stored state" paths (search for where `health` is put on the
  response; add `trackRecord` next to it in every spot).

**Client:**
- `client/src/utils/committeeServerCache.js`: store/expose `trackRecord`
  exactly like `health` (add `getCommitteeTrackRecord`, update
  `storeCommitteeResponse`, reset).
- `client/src/hooks/usePortfolioCommittee.js`: state + expose it like
  `health`.
- New `TrackRecordCard.jsx` + module CSS in
  `client/src/components/PortfolioCommitteePanel/`, rendered in the "done"
  status right where `PortfolioHealthCard` used to sit (it was removed;
  git history has it as a layout reference).
- Shape of `trackRecord` (from `computeTrackRecord`): `{ horizons: [...] }`,
  each horizon has counts/means bucketed by action, plus a Spearman ρ
  (`rho`) when n ≥ 8. `server/lib/reportEmail.js` `trackRecordLines()`
  already converts this to plain English — **reuse its phrasing**, don't
  invent new terms. Lead with a headline like:
  "The committee's real report card so far: stocks it rated Buy a month ago
  are up X% on average (N verdicts); its Sells are down Y%."
- Render nothing (component returns null) until at least one horizon has
  data — `trackRecordLines` already encodes the min-sample rules; mirror
  them.
- Beginner framing: one short intro line — "Unlike the test-it button below,
  this is the committee grading its actual past verdicts on your stocks as
  time passes."

**Verify:** engine-side `computeTrackRecord` fixture test (item 6 covers);
client lint + esbuild compile; manually confirm payload passthrough by
grepping both handler paths.

---

## Item 2: explain *why* a verdict changed

**Goal.** Tier-change chips currently say "↓ was Buy (68) on Jul 2" with no
reason. The per-day history rows already store the three pillar scores —
compute which pillar moved and say it plainly.

**Engine (pure function, no version bump — display only):**
- Add `explainTierChange(history, currentReport)` to
  `packages/committee-engine/src/analyst/verdictHistory.js` (next to
  `getTierChange`, which finds the previous snapshot — reuse
  `getPreviousSnapshot`). Compare the previous same-engine-version row's
  `technical / fundamental / sentiment` against the current report's pillars.
  Rules:
  - Compute deltas for pillars finite on both sides. Biggest |delta| ≥ 6
    points = the driver; second pillar mentioned if its |delta| ≥ 6 too.
  - Output a short plain sentence, e.g.:
    - "Downgraded mainly because the news mood soured (62 → 41). The
      company's finances are unchanged."
    - "Upgraded mainly because the price trend improved (38 → 61)."
    - All pillars moved < 6: "No single big driver — several small shifts
      added up." (composite drift / devil's-advocate dampening).
  - Pillar names must match the UI: "the price trend", "the company's
    finances", "the news mood" (see `PILLAR_LABELS` in portfolioManager).
  - Return `null` when there's no tier change or no comparable row.
- Where it runs: **server**, in `committeePipeline.js` where `tierChange` is
  computed (`getTierChange(report, previousSnapshot)` ~line 270). Attach the
  sentence as `tierChange.reason`. This makes it flow everywhere for free
  (stored state → app panel, portfolio panel, email) with no client fetch
  changes. IMPORTANT: `getPreviousSnapshot` is read *before* today's row
  lands in history — the pillars for "before" come from `previousSnapshot`,
  which already carries `technical/fundamental/sentiment` (verified).

**Surfaces:**
- `AnalystPanel.jsx` tier-change chip: render `tierChange.reason` as a small
  line under the chip (only when present).
- `PortfolioCommitteePanel.jsx` (`PositionVerdictCard` / `describeTierChange`
  helper there): append the reason.
- `server/lib/reportEmail.js` `describeTierChange()`: append the reason to
  the existing "AAPL downgraded: Buy → Hold" line in the Tier changes
  section and the per-holding chip line.

**Verify:** unit test `explainTierChange` with crafted history rows (pillar
drop → correct driver named; version-mismatched rows ignored); email render
smoke (pattern exists in the repo's scratch tests: build fake results and
call `renderReportEmail`).

---

## Item 3: upcoming earnings-date heads-up

**Goal.** Warn before scheduled quarterly reports: "Heads up: an earnings
report is expected around Jul 24 — prices and verdicts often swing after
these. If you're planning to buy, know the date." Prevents buying blind into
a binary event.

**Server (needs redeploy):**
- `server/handlers/earningsHistory.js`: it already fetches `calendarEvents`.
  Extract the **next scheduled date**: `res.calendarEvents.earnings
  .earningsDate` is an array of upcoming timestamps (may contain a range of
  two dates; also check `earningsCallDate` entries in the future — current
  code only keeps ones `<= now`). Add `nextEarningsDate` (ISO string, or
  null) plus `nextEarningsDateIsEstimate = earningsDate.length > 1` (Yahoo
  gives a two-date window when unconfirmed) to the handler's return object
  `{ history, reportedDate }`.
- Thread it through `server/lib/marketData.js` → `committeePipeline.js`
  into the committee input.

**Engine:**
- `runAnalystCommittee` input gains optional `nextEarningsDate` /
  `nextEarningsDateIsEstimate`; pass into `runDataScout`; store on
  `metrics.nextEarningsDate` and push a **neutral, weight-1, non-scored**
  finding when the date is within the next 14 days:
  - Confirmed: "Earnings report expected {Mon DD} — prices often jump or
    drop on report day, and this verdict can change after it."
  - Estimate: same wording with "around {Mon DD}".
  No component (no score impact) → **no engine version bump**, but DO note
  it in version.js changelog as a comment-only addition if other items in
  this round already bump the version.
- Surface in `buildPlanFindings` for BUY: if `metrics.nextEarningsDate` is
  within 14 days, add a neutral line: "If buying: consider waiting until
  after the earnings report on {date} — or buy half now, half after."

**Client:** nothing new — findings render automatically in the committee
transcript. Optionally add a small line in `AnalystPanel`'s verdict banner
area when within 7 days (keep to one sentence).

**Email:** in `server/lib/reportEmail.js` per-holding block, add a labeled
line `Heads up:` when the report has `metrics.nextEarningsDate` within 7
days.

**Verify:** live smoke on a symbol with a scheduled report (bundle-and-run
pattern above; fetch a real symbol and print `metrics.nextEarningsDate` and
findings); email render smoke with a fixture date 5 days out and one 30 days
out (must not render).

---

## Item 4: ease-in buying (replace all-at-once framing)

**Goal.** The BUY "game plan" implies investing the whole position today.
Long-term beginners do better easing in. Reframe the entry plan as tranches.

**Engine (`packages/committee-engine/src/analyst/agents/portfolioManager.js`):**
- `buildEntryPlan` already computes `positionSizePct`. Add:
  `tranches: [{ pct: 50, when: "now" }, { pct: 25, when: "in about a month" },
  { pct: 25, when: "after the next earnings report" }]` — literal plan data,
  adjusted by conviction: High conviction → 50/25/25; Moderate → 40/30/30;
  Low → 25/25/50 (most held back). If `metrics.nextEarningsDate` (item 3) is
  within 21 days, make the middle tranche "after the earnings report on
  {date}".
- No score change → display-only; no version bump required by this item.
- Update `buildPlanFindings` BUY wording: replace the single position-size
  line with: "If buying: ease in rather than all at once — about
  {t0}% of your planned amount now, the rest in one or two steps
  ({t1}% {when1}, {t2}% {when2}). Keep the whole position under
  {positionSizePct}% of your portfolio."

**Client (`AnalystPanel.jsx` GamePlan entry branch):**
- Replace "Max position size" single stat with a small "How to ease in"
  row list rendering `plan.tranches` (plain sentences, one per line). Keep
  the existing buy-near / sell-if-falls-to / reassess-near grid.
- Keep the existing long-term note about the sell level being a thesis line.

**Email:** `whatToDo` lives in
`packages/committee-engine/src/actionAdvice.js` — update the BUY branch to
mention easing in ("Consider buying — ease in over a few steps rather than
all at once.").

**Verify:** engine fixture test asserting tranche math per conviction band;
client lint + compile; email smoke shows new wording.

---

## Item 5: peer / sector comparison (bigger project — do last)

**Goal.** "Cheap vs its own past" exists; "cheap vs similar companies"
doesn't. Add sector context so a P/E of 30 can be judged.

**Data (server, needs redeploy):**
- New fetch in `server/lib/marketData.js`: `yahooFinance.quoteSummary(symbol,
  { modules: ["assetProfile", "summaryDetail"] })` → `{ sector, industry }`.
  Cache in the symbol's stored state (it changes ~never; refetch only when
  missing or > 90 days old). Resolve failures to null — foreign
  listings/ADRs often lack it.
- Peer baseline: **static reference table** in the engine —
  `packages/committee-engine/src/sectorBenchmarks.js`, a hand-maintained map
  of the 11 GICS sectors → { typicalPE: [low, high], typicalNetMargin,
  typicalRevGrowth } with a `asOf` date and a comment on sourcing
  (approximate long-run sector medians; conservative wide bands). This keeps
  the engine pure/offline. Comparing against the user's own tracked stocks
  was considered and rejected: a personal portfolio is too small and skewed
  to define "peers".
- The engine input gains `sector` (string|null).

**Engine (SCORING CHANGE → bump `COMMITTEE_ENGINE_VERSION` to 7):**
- In dataScout's valuation section: when `sector` is known and trailing P/E
  exists, add one scored component: P/E scaled within the sector's typical
  band (inside band → neutral 45–60; far below → up to ~80; far above → down
  to ~25). Weight it like the existing P/E component (they should share —
  average the two rather than double-count valuation).
- Findings, beginner-toned:
  - "Cheap for its industry — priced at $18 per $1 of profit while
    {sector} companies typically run $25–35."
  - "Expensive even for {sector} — $45 per $1 of profit vs a typical
    $15–25. It needs to keep growing fast to justify that."
  - Unknown sector → silence (no penalty).
- Fold the sector read into `valuationRead` for the fire-sale gate: a stock
  "rich" vs both its own history AND its sector strengthens the rich verdict;
  keep own-history as primary.

**Client:** findings render automatically. Optional: show sector under the
symbol header in `AnalystPanel` if trivially available on the report.

**Verify:** unit tests for the benchmark scaling; live smoke on 2–3 symbols
in different sectors (tech, staples, energy) checking the finding wording and
that unknown-sector symbols stay silent; walk-forward backtest still runs
(sector is null in the replay — must be a no-op there).

---

## Cross-cutting notes for the implementer

- After ALL engine scoring changes in this round, bump the version ONCE (to
  7) with a single changelog comment listing what changed — not one bump per
  item.
- Update `AiCommitteeHelpModal.jsx` (client) if pillar weights or new scored
  inputs change what the help text claims.
- The user's daily email is the second UI: when a feature adds user-visible
  value, ask whether it belongs there too — but keep the email SHORT; the
  panel is for depth. (User previously chose: two-answers line yes, verbose
  detail no, portfolio-health section removed, funds filtered out.)
- Report in the final summary which changes need a server redeploy vs
  client-only, in plain words. The user runs `npm run bundle` + Lambda
  update themselves.
- Never claim something is verified unless a command actually ran it. The
  smoke-test pattern (esbuild bundle + node, live Yahoo fetch) is the
  strongest available check; the user may interrupt long live fetches —
  prefer one or two symbols, not a sweep.
