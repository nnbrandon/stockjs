# AI Committee v9 round — implementation plan

Three improvements agreed with the user (a beginner, long-term position
investor — no day trading): fix the verdict-history cap that starves the
90-day track record, make advice aware of the user's actual position
(cost basis / unrealized gain), and add insider buying/selling as a signal.

This document is self-contained: it records the codebase facts an
implementer needs (verified 2026-07-10 against the working tree), then specs
each item. **Prerequisite:** the v8 round (`docs/committee-analyst-v8-plan.md`)
is implemented first and its suite is green — v9 builds on the v8 code state
(engine version 8, thesis/earnings-review wiring in the pipeline).

**Suggested order:** 1 (two-line fix) → 3 (scoring change, sets the v9
version bump) → 2 (display-only, most surfaces).

---

## Codebase facts you need (verified 2026-07-10)

**Layout.** Three packages:
- `packages/committee-engine` — pure, synchronous, dependency-free JS shared
  by browser and Lambda. **No network, no DOM, no AWS imports in here.**
  Extensionless imports — files must be esbuild-bundled to run; `npm test`
  in the package does that (Node `node:test` suite in `test/`).
- `server` — Lambda (`type: module`), bundles via `npm run bundle` (aliases
  `@stockjs/committee-engine` → `../packages/committee-engine/src`). No
  eslint config — don't lint it.
- `client` — Vite + React 19 + MUI. **`vite build` fails on this machine
  (Node 20.11.1; Vite 7 wants 20.19+). Do not use it for verification.**

**Verification commands that work here:**
```sh
# Engine tests + lint
cd packages/committee-engine && npm test && npx eslint src test

# Client lint + compile check (instead of vite build):
cd client && npx eslint src
cd client && npx --yes esbuild@0.24 src/main.jsx --bundle --format=esm \
  --outfile=/dev/null --loader:.js=jsx --loader:.png=dataurl \
  --loader:.svg=dataurl --loader:.css=empty \
  --alias:@stockjs/committee-engine=$(pwd)/../packages/committee-engine/src

# Run engine/server code in node (bundle first):
npx --yes esbuild@0.24 <entry.js> --bundle --format=esm --platform=node \
  --target=node20 --outfile=<out.mjs> \
  --alias:@stockjs/committee-engine=<abs>/packages/committee-engine/src \
  --banner:js="import { createRequire as __cjsRequire } from 'node:module'; import { fileURLToPath as __fileURLToPath } from 'node:url'; import { dirname as __pathDirname } from 'node:path'; var require = __cjsRequire(import.meta.url); var __filename = __fileURLToPath(import.meta.url); var __dirname = __pathDirname(__filename);"
node <out.mjs>
```

**Data flow facts this round depends on:**
- `server/lib/committeePipeline.js`: `MAX_HISTORY_ROWS = 60` (line ~41) caps
  the per-symbol verdict history; `.slice(-MAX_HISTORY_ROWS)` (~line 312) is
  the only other reference repo-wide. `computeUserView(holdings,
  resultBySymbol)` (~line 396) overlays `quantity` and `avgCostBasis` from
  the user's holdings onto each per-symbol result.
- Track record: `packages/committee-engine/src/trackRecord.js`
  `computeTrackRecord` grades horizons `[30, 90]` days with a ±40% age
  window — the 90-day horizon accepts verdict rows **54–126 days old**.
- `server/lib/marketData.js` `fetchAnalysisData(symbol)` makes ONE
  quoteSummary call with modules `["earningsTrend", "financialData",
  "defaultKeyStatistics", "assetProfile"]` and flattens via a local
  `num()` helper (accepts raw numbers or `{raw}` wrappers).
  `yahoo-finance2`'s `NetSharePurchaseActivity` shape (verified in
  `server/node_modules/yahoo-finance2/esm/src/modules/quoteSummary-iface.d.ts:600`):
  `{ period, buyInfoCount, buyInfoShares, sellInfoCount, sellInfoShares,
  netInfoCount, netInfoShares, netPercentInsiderShares?, totalInsiderShares,
  … }`. The module is often missing (funds, foreign listings) — everything
  must resolve to null and stay silent.
- **Cost-basis field names differ by side:** client-local IndexedDB holdings
  are `{ symbol, quantity, averageCostBasis, importedAt, source }`
  (`client/src/db/database.js:55`); server holdings/results use
  `avgCostBasis`. Any shared engine helper must take plain numbers so it
  never touches either field name.
- Client P/L already exists: `client/src/utils/computePositionMetrics.js`
  returns `{ lastPrice, costBasisTotal, currentValue, totalGainLoss,
  totalGainLossPct, … }` from `(position, candles)`.
  `client/src/components/AnalystPanel/AnalystPanel.jsx` computes it (~line
  504) from its `position` prop (passed from `App.jsx` via
  `StockTabs.jsx:100` / `StockContextPanel.jsx:149`); its `GamePlan`
  component's sell branch already uses `position.quantity` +
  `positionMetrics.lastPrice` for "sell ~N shares (≈$X)" sizing.
- `client/src/components/PortfolioCommitteePanel/PortfolioCommitteePanel.jsx`
  `PositionVerdictCard` (~line 258) has `item.position` (the client-local
  holding: `quantity` used for SELL sizing ~lines 313–332;
  `averageCostBasis` currently unused) and `item.report`.
- Daily email `server/lib/reportEmail.js`: per-holding `r` objects come
  straight from `computeUserView` results, so **`r.quantity` and
  `r.avgCostBasis` are already present** (currently unused). Conditional
  per-holding lines follow the `earningsHeadsUp` pattern: build a string or
  null, then `if (x) cells.push(labeled("Label", escapeHtml(x)))` in
  `holdingHtml` (~line 257) and `if (x) lines.push(\`  Label: ${x}\`)` in
  `holdingText` (~line 307). **HTML and text renderers must be updated in
  lockstep.**
- Engine sentence builders shared by app + email live engine-side (the
  `describeTrackRecord` pattern in `trackRecord.js`) so all surfaces read
  identically.

**Conventions (do not violate):**
- Beginner wording: full sentences, no jargon ("capital-gains tax" is fine
  if the sentence explains the consequence plainly; "tax-loss harvesting" is
  not — describe it instead).
- Silence over speculation: missing field → no finding, no penalty.
- **Version bump policy:** only scored `components` changes bump
  `COMMITTEE_ENGINE_VERSION` (`packages/committee-engine/src/analyst/version.js`).
  Item 3 is this round's only scoring change → bump **8 → 9** once, dated
  changelog comment.
- Server redeploy = `cd server && npm run bundle` + the user updates the
  Lambda themselves. Say in the final summary what needs redeploy vs
  client-only.
- Never claim something is verified unless a command actually ran it.

---

## Item 1 (do first): raise the verdict-history cap

**Goal.** The 90-day track-record horizon grades verdict rows 54–126 days
old, but history keeps only ~60 daily rows — so only rows 54–60 days old
ever qualify and the 90-day report card stays nearly empty forever.

**Change.** `server/lib/committeePipeline.js` line ~41:
`MAX_HISTORY_ROWS` 60 → **150**, and replace/extend the constant's comment
to say why: "150 daily rows ≈ 5 months — the 90-day track-record horizon
(±40% window in computeTrackRecord) needs rows up to 126 days old."
The only other reference is the `.slice(-MAX_HISTORY_ROWS)` in the same
file — no other change needed (verified repo-wide).

Rows are ~16 scalar fields; per-symbol state growth is negligible. Existing
histories simply grow forward — no migration.

**Verify:** `cd server && npm run bundle` succeeds; grep confirms exactly
two references, both using the constant.

**Needs server redeploy.** No version bump.

---

## Item 3 (the scoring change): insider buying/selling signal

**Goal.** Executives buying their own stock with their own money is one of
the better-documented signals; heavy selling is a much weaker one (insiders
sell for taxes and diversification). Add it asymmetrically: buying scores up
meaningfully, only heavy selling scores down mildly.

**Server (`server/lib/marketData.js` `fetchAnalysisData`) — needs redeploy:**
- Add `"netSharePurchaseActivity"` to the existing `modules` array (rides
  along on the same request — no new network call).
- Flatten onto the returned analysis object with the local `num()` helper:
  - `insiderPeriod`: `result.netSharePurchaseActivity?.period ?? null`
    (string, e.g. `"6m"`)
  - `insiderBuyCount` ← `buyInfoCount`
  - `insiderSellCount` ← `sellInfoCount`
  - `insiderNetShares` ← `netInfoShares`
  - `insiderNetPct` ← `netPercentInsiderShares` **normalized to percent**
    (see scale check below)
  - `insiderTotalShares` ← `totalInsiderShares`
- Missing module → all null. This object is cached/stored — keep the keys
  stable.

**Scale check (do BEFORE picking the engine thresholds).** Yahoo is
inconsistent about fractions vs percents across fields. Bundle-and-run a
tiny script (pattern above) that calls `fetchAnalysisData` for 2–3 real
symbols with known insider activity (e.g. one mega-cap, one mid-cap) and
prints the raw `netSharePurchaseActivity` object. Confirm whether
`netPercentInsiderShares` comes back as `0.012` (fraction) or `1.2`
(percent); normalize in the flattening so `insiderNetPct` is always in
percent units. Record what you observed in a code comment.

**Engine (`packages/committee-engine/src/analyst/agents/dataScout.js`,
in the expectations section where the estimate-revision components live):**
- Qualify only when `analysis.insiderNetPct` is finite AND
  `(analysis.insiderBuyCount ?? 0) + (analysis.insiderSellCount ?? 0) >= 3`
  (fewer transactions is noise — stay silent).
- Store `metrics.insiderNetPct` and `metrics.insiderPeriod` when qualified.
- Scored component + finding (period wording: use `insiderPeriod` if it maps
  to something readable — `"6m"` → "the last six months" — else "recent
  months"):
  - `insiderNetPct >= 2`: `components.push(72)`; bull, weight 2:
    "Company insiders bought more of their own stock than they sold over
    {period} — the people with the best view of the business are putting
    their own money in."
  - `0.5 <= insiderNetPct < 2`: `components.push(62)`; bull, weight 1:
    "Company insiders have been modest net buyers of their own stock over
    {period} — a quietly encouraging sign."
  - `insiderNetPct <= -10` AND `insiderSellCount >= 5`:
    `components.push(42)`; bear, weight 1: "Company insiders sold a
    meaningful chunk of their own stock over {period}. Insiders sell for
    many reasons (taxes, diversification), but this much selling is worth
    knowing about."
  - Otherwise: **no component, no finding** — routine churn says nothing.

**Version bump:** `COMMITTEE_ENGINE_VERSION` 8 → **9** in
`packages/committee-engine/src/analyst/version.js`, dated changelog comment:
insider net-purchase component, asymmetric by design. (v8 rows are hours old
— comparability cost is nil.)

**Client:** none — findings render automatically in the committee
transcript. If `client/src/components/AiCommitteeHelp/` enumerates the
committee's inputs, add one sentence about insider activity.

**Tests** (`packages/committee-engine/test/`): fixture `analysis` objects
across the matrix — strong buying (finding + higher fundamental score vs a
no-insider fixture), modest buying, heavy selling (mild), routine churn
(−3% with 4 sells → silence), too few transactions (silence), missing module
(silence + score identical to the no-insider fixture).

---

## Item 2: position-aware advice (display-only)

**Goal.** The committee's advice is identical whether the user is up 80% or
down 40%. A real analyst managing your book factors that in — mostly around
selling, where taxes and loss-capture change how you'd execute. All the
inputs already flow to every surface; nothing new is fetched or stored.

**Engine:** new pure file `packages/committee-engine/src/positionRead.js`,
exported from the barrel (`src/index.js`):

```js
buildPositionRead({ gainPct, action })  // → { line: string } | null
```

Rules (beginner voice; always hedged with "in a taxable account"; never
specific tax advice — no rates, no wash-sale mechanics):
- `action === "SELL"` and `gainPct >= 20`:
  "You're up about {g}% on this position. Selling means paying capital-gains
  tax on that profit in a taxable account — trimming in stages spreads that
  out."
- `action === "SELL"` and `gainPct <= -10`:
  "You're down about {g}% on this position. One silver lining: selling locks
  in a tax loss you can use against other gains in a taxable account."
- `action === "SELL"` and `-10 < gainPct < 20`:
  "Your position is roughly flat to modestly moved, so selling has little
  tax impact either way."
- `action !== "SELL"` and `gainPct >= 100`:
  "This position has doubled for you — nothing to do today, just remember a
  big winner also means a bigger tax bill whenever you eventually sell from
  a taxable account."
- Anything else, or non-finite `gainPct` → `null`.
Round `{g}` to whole percents; use `Math.abs` for the "down" wording.

The helper takes plain numbers — callers compute `gainPct` themselves, which
sidesteps the `averageCostBasis` (client) vs `avgCostBasis` (server) naming
mismatch.

**Client surface 1 — `AnalystPanel.jsx`:** in `GamePlan`'s sell branch
(`hasPosition` true), it already has `positionMetrics.totalGainLossPct`.
Call `buildPositionRead({ gainPct: positionMetrics.totalGainLossPct,
action: "SELL" })` and render the line under the existing
"Sell ~N shares (≈$X)" sizing row (plain paragraph, existing muted style).
Also render the doubled-winner line for non-SELL verdicts when
`totalGainLossPct >= 100` — put it at the bottom of the GamePlan card.
Render nothing on null.

**Client surface 2 — `PortfolioCommitteePanel.jsx` `PositionVerdictCard`:**
compute `gainPct` from `item.position?.averageCostBasis` and
`item.report?.metrics?.price` (`(price / averageCostBasis − 1) * 100`, guard
both finite and > 0), call the same builder with the verdict's action, and
render in the SELL sizing area. Render nothing on null.

**Email (`server/lib/reportEmail.js`):** in `holdingHtml` AND `holdingText`,
compute `gainPct` from `r.avgCostBasis` and a current price
(`r.report?.metrics?.price`, falling back to the last candle close), call
`buildPositionRead` with the verdict's action, and when non-null emit
`labeled("Your position", …)` / `  Your position: …`. Because the builder
only speaks on SELL verdicts or doubled winners, the email stays short by
construction.

**Tests:** rule matrix for `buildPositionRead` — each branch's wording
prefix, boundary values (20, −10, 100), null on HOLD with modest gain, null
on non-finite input.

Display-only → no additional version bump beyond item 3's.

---

## Cross-cutting notes for the implementer

- One version bump for the round: **9** (item 3). Items 1 and 2 are
  cap/display changes.
- Run the FULL engine suite (v8's tests included) — item 3 adds a component
  to the fundamental score, and any v8 fixture with insider fields could
  shift; fix fixtures, not thresholds.
- After engine work: `cd packages/committee-engine && npm test && npx eslint
  src test`. After client work: `cd client && npx eslint src` + the esbuild
  compile check. After server work: `cd server && npm run bundle`.
- Live smoke (required, item 3): the scale-check script doubles as the
  smoke test — keep it in the scratchpad, not the repo.
- Final summary must state in plain words: items 1 and 3 need a server
  redeploy; item 2 needs a server redeploy (email line) AND a client build
  (the two panel surfaces). The user runs `npm run bundle` + Lambda update
  and the client deploy themselves.
- Keep the email SHORT. When in doubt, panel yes, email no.
