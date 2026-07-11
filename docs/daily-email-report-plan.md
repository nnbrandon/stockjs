# Plan: Daily AI Committee email report (9:00 AM Pacific, on Lambda)

**Status: implemented (all phases, 2026-07-07).** Code is done and verified
locally (bundle builds, handlers unregressed, dry run clean, sentiment
parity). Remaining manual steps: run
`REPORT_SYMBOLS="..." ./server/scripts/setup-daily-report.sh` once with AWS
credentials, click the SES verification link it emails, deploy (push to
main), then test with a manual `aws lambda invoke` (see Verification 5–6).

Self-contained handoff doc — implementable cold by
any model/session with no conversation context. Written 2026-07-07, revised
same day to add: a shared engine package (single source of truth for client
and server), news sentiment in v1, and a free-tier cost budget.

## Goal

Once a day at 9:00 AM Pacific, the existing `stockjs-api` Lambda fetches
fresh market data AND news for the user's holdings, runs the same AI
Committee engine the UI uses, compares against yesterday's verdicts, and
emails a plain-English digest to **herosekai@gmail.com**: per-holding tier +
score, tier changes ("MSFT downgraded: Buy → Hold"), the news mood with the
key positive/negative headline per symbol, why-sell reasons for Sell/Reduce
names, and a portfolio health summary.

## Architecture in one paragraph

The committee engine (`client/src/utils/analyst/`) is pure, synchronous JS —
proven to run under Node via esbuild throughout its development. Phase 1
moves it (plus its pure-JS companions) into a **shared package** consumed by
both the client and the server, so any change to the committee automatically
ships to both — there is no second implementation to drift. Server-side
inputs come straight from Yahoo via fetch logic the handlers already contain;
news sentiment runs on the Lambda with the exact same `Xenova/finbert` model
and score-mapping code the browser worker uses. Verdict history (tier-change
detection + the score-momentum nudge) persists as one JSON object in S3.
Email goes out via SES. An EventBridge Scheduler cron triggers the Lambda
directly (never via the public Function URL) at 9 AM `America/Los_Angeles`.

## Prior art to read first

- `docs/committee-roadmap-plan.md` — engine architecture primer, input
  shapes, honesty rules (every metric optional; missing data never crashes).
- `client/src/utils/analyst/index.js` — `runAnalystCommittee({chartData,
  quarterly, annual, earnings, news, history, analysis})`;
  `COMMITTEE_ENGINE_VERSION` in `version.js`.
- `client/src/workers/finbert.worker.js` — `MODEL_ID = "Xenova/finbert"`,
  `pipeline("text-classification", ...)`, and the label→`{sentiment,
  confidence, label}` mapping that `sentiment.js` expects on `article.model`.
- `client/src/utils/analyst/sentiment.js` — the aggregator; its result
  exposes `topPositive` / `topNegative` (title + link) — the email's "key
  news" comes from there for free.
- `server/handlers/` — `prices.js`, `fundamentals.js`, `analysis.js`,
  `news.js`: the fetch logic to reuse.
- `.github/workflows/deploy-server.yml` — deploy zips
  `index.js package.json handlers lib node_modules` from `server/`.
- `server/scripts/bootstrap-lambda.sh` — `TIMEOUT` / `MEMORY` knobs exist.

## Key decisions (made — don't relitigate without reason)

1. **Shared engine package, no npm workspaces.** A plain folder
   `packages/committee-engine/` imported by both sides (details in Phase 1).
   Workspaces were considered and rejected: hoisting moves dependencies to a
   root `node_modules`, which breaks the zip-from-`server/` deploy. A plain
   folder + a Vite alias + an esbuild bundle step gets the same single-source
   guarantee with none of that.
2. **Same Lambda, new internal action.** The scheduler invokes with payload
   `{"action": "dailyReport"}` and the handler branches on **top-level
   `event.action`** — Function URL events carry `queryStringParameters`/
   `body`, so the public URL can never trigger an email send.
3. **Symbols via env var** for v1:
   `REPORT_SYMBOLS="AAPL:100:150.25,MSFT:50:300,VTI:20:220"` —
   `SYMBOL[:quantity:avgCostBasis]`, quantity/cost optional (they enable the
   portfolio-health weights). Cloud-syncing the Fidelity import is a
   follow-up, not v1.
4. **News sentiment IS in v1**, with the same model as the browser
   (`Xenova/finbert` via `@huggingface/transformers`, which runs natively in
   Node). Article selection is NOT "latest N" and NOT a hard 2-week cut —
   it reuses the client's own `selectNewsForAnalysis` (30-day window, cap
   20–60) over a **rolling article archive kept in the S3 state**, because
   Yahoo's news endpoint only returns the last handful of days and the
   Lambda has no IndexedDB. The engine's 10-day recency half-life
   (`sentiment.js` `recencyWeight`) already makes old articles fade, so the
   window supplies stability while recency weighting supplies freshness.
   Only never-seen article ids get scored each day (incremental — the same
   thing the browser's score cache achieves). Full article text: the Lambda
   IS the extraction service (`handlers/article.js`), so new articles get
   their text crawled with a small concurrency + per-article timeout,
   falling back to headline+summary on paywalls/failures.
5. **S3 for state**, one JSON object, read+write once per day.
6. **SES sandbox is sufficient**: verify `herosekai@gmail.com` once and use
   it as both sender and recipient (sandbox allows verified→verified).
7. **Timezone**: `cron(0 9 ? * MON-FRI *)` with `America/Los_Angeles` (tracks
   PST/PDT; weekdays only). If fixed-UTC-offset is truly wanted,
   `cron(0 17 ? * MON-FRI *)` UTC.

## Phase 1 — Shared engine package (the sync guarantee)

Create `packages/committee-engine/` at the repo root and **move** (not copy)
the pure-JS committee modules into it:

```
packages/committee-engine/
  package.json        { "name": "@stockjs/committee-engine", "type": "module",
                        "private": true, "exports": { ".": "./src/index.js",
                        "./*": "./src/*" } }
  src/
    analyst/          ← everything from client/src/utils/analyst/ (index.js,
                        version.js, indicators.js, sentiment.js, newsAgent.js,
                        verdictContext.js, verdictHistory.js, agents/*)
    mergeEarningsIntoQuarterly.js
    portfolioHealth.js
    isFundSymbol.js
    guardrails.js
    finbertScore.js   ← NEW: extract the label→{sentiment, confidence, label}
                        mapping + text-prep from finbert.worker.js so the
                        browser worker and the Lambda share ONE scoring
                        function (the worker keeps only worker plumbing).
    selectNewsForAnalysis.js  ← moved from client/src/utils/ — the server
                        must pick articles with the same 30-day-window/cap
                        rules as the UI or email verdicts drift from UI
                        verdicts.
    dateUtils.js      ← copy toIsoDate out of client/src/db/utils.js
                        (mergeEarningsIntoQuarterly imports it; db/utils
                        stays client-side because the rest of it is
                        Dexie-adjacent). Client's db/utils re-exports from
                        here to avoid two definitions.
```

Wiring:

- **Client**: add to `vite.config.js`:
  `resolve.alias["@stockjs/committee-engine"] = path to ../packages/committee-engine/src`
  plus `server.fs.allow` including the repo root (Vite dev needs it for
  files outside `client/`). Update every import that referenced the moved
  files (`grep -rn "utils/analyst\|portfolioHealth\|mergeEarningsIntoQuarterly\|isFundSymbol\|guardrails"
  client/src` — expect ~15 files: AnalystPanel, PortfolioCommitteePanel,
  hooks, backtest, workers). The backtest util (`client/src/utils/backtest/`)
  stays client-side (it reads IndexedDB) but imports the engine package.
- **Server**: handlers import `@stockjs/committee-engine` too. Since the zip
  has no workspace resolution, the deploy workflow gains a bundle step
  (after `npm ci`, before `Package function`):
  ```bash
  npx --yes esbuild@0.24 index.js --bundle --format=esm --platform=node \
    --outfile=dist/index.mjs \
    --alias:@stockjs/committee-engine=../packages/committee-engine/src/index.js \
    --external:@huggingface/transformers
  ```
  and the zip becomes `zip -r ../function.zip dist package.json node_modules`
  with the Lambda handler set to `dist/index.mjs` (update
  `bootstrap-lambda.sh`'s `--handler` and the workflow). Everything pure-JS
  (engine, yahoo-finance2, AWS SDK v3) bundles; only
  `@huggingface/transformers` stays external because it drags native
  binaries (`onnxruntime-node`) that cannot be bundled — it ships via
  `node_modules` from `npm ci --omit=dev` in `server/`.
- **Why this guarantees sync**: both consumers import the same files at the
  same commit; the server bundle is regenerated on every deploy. There is no
  copy to forget. `COMMITTEE_ENGINE_VERSION` already stamps history rows and
  backtest reports on both sides.
- **Verify before proceeding**: client dev server renders the AI Committee
  tab; the four scratchpad-style esbuild sims still pass when pointed at the
  new package path; `npx eslint` clean.

## Phase 2 — Refactor server fetch logic for internal reuse

Extract handler cores (keep public handler behavior identical):

- `server/lib/marketData.js`:
  - `fetchDailyCandles(symbol, days≈420)` — from `prices.js` logic, mapping
    to `{date, open, high, low, close, volume}` exactly as the client stores.
  - `fetchFundamentalsData(symbol)` — the `Promise.all` + `mergeRowsByDate`
    body of `fundamentals.js` → `{quarterlyResult, annualResult, earningsResult}`.
  - `fetchAnalysisData(symbol)` — from `analysis.js`.
  - `fetchNewsData(symbol)` — from `news.js` (id, title, link, date,
    summary/description fields — mirror what the client saves).
- Handlers become thin wrappers (params → lib → `jsonResponse`).

## Phase 3 — Server-side sentiment (FinBERT on Lambda)

- Add `@huggingface/transformers` to `server/package.json` dependencies
  (same major version as the client uses).
- `server/lib/sentiment.js`: lazy-init
  `pipeline("text-classification", "Xenova/finbert")` once per container;
  set `env.cacheDir = "/tmp/hf-cache"` (Lambda's writable dir) so the
  quantized model downloads once per cold start (~tens of MB per the
  worker's own comment; scheduled daily = roughly one cold start per day).
- **Rolling article archive** (solves "Yahoo only returns recent items"):
  the S3 state stores, per symbol, every article seen in the last 30 days —
  `{id, date, title, link, summary, model}` — deduped by id. Each run:
  fetch today's news, add unseen articles to the archive, drop rows older
  than 30 days, and feed `selectNewsForAnalysis(archive)` to the committee.
  Day one the archive equals whatever Yahoo returns (a few days' worth) and
  the window fills out over the first month — say "news history still
  warming up (N days)" in the email footer until the archive spans ≥14 days.
- **Incremental scoring**: only articles without a stored `model` score go
  through FinBERT — typically 3–10 per symbol per day after day one. Cap
  first-run backlogs at 25 scored per symbol.
- **Full text for new articles**: reuse the extraction logic behind
  `handlers/article.js` (the Lambda hosts it already) with concurrency ≤ 4
  and a ~5s per-article timeout; on failure/paywall, score
  `title + ". " + summary` instead. Truncate text to FinBERT's input limit
  the same way the worker does (share that in `finbertScore.js`).
- Attach scores via the shared `finbertScore.js` mapping so
  `article.model = {sentiment, confidence, label}` is byte-compatible with
  what the browser worker produces. The sentiment agent's
  `raw.topPositive` / `raw.topNegative` then give the email its key-news
  links.
- Degrade honestly: if the model download or scoring throws, log it, run the
  committee with the already-scored archive (or `news: []` if empty), and
  say "news mood partial/unavailable today" in the email — never fail the
  whole report over sentiment.
- Lambda sizing this requires: **memory 2048MB, timeout 300s** (Phase 6
  config step). Budget check: ~10 symbols × ~5 new articles = ~50 crawls
  (~60s at concurrency 4) + ~50 FinBERT passes (~10–20s) + model cold-start
  download — fits with headroom. Model download is inbound traffic (free).

## Phase 4 — The report handler

`server/handlers/dailyReport.js`:

```
parse REPORT_SYMBOLS → [{symbol, quantity?, avgCostBasis?}]
state = S3 GET s3://$REPORT_STATE_BUCKET/committee-state.json (missing → {})
warm sentiment pipeline once
for each symbol (concurrency ≤ 3 — be polite to Yahoo):
    candles   = fetchDailyCandles(symbol)
    {quarterlyResult, annualResult, earningsResult} = fetchFundamentalsData(symbol)
    fund?     = isFundSymbol(candles) OR (no quarterly rows AND no analysis) → skip committee, note in email
    analysis  = fetchAnalysisData(symbol)
    archive   = state[symbol]?.articles ?? []
    news      = update archive with fetchNewsData(symbol); crawl+score only
                unseen ids (Phase 3); prune > 30 days;
                selectNewsForAnalysis(archive)
    quarterly = mergeEarningsIntoQuarterly(quarterlyResult, earningsResult)
    history   = state[symbol]?.history ?? []   // same row shape as the client's committeeHistory
    report    = runAnalystCommittee({chartData: candles, quarterly,
                  annual: annualResult, earnings: earningsResult,
                  news, history, analysis})
    tierChange = report.verdict.tier vs last history row (same engineVersion only)
    append {day, composite, tier, action, engineVersion} to history, trim 60
health = analyzePortfolioHealth(items)   // when quantities provided; currentValue = qty × last close
decide whether to send (exception-based — see below)
if sending: send email (Phase 5); S3 PUT state ONLY after a successful send
if skipping: S3 PUT state anyway (history must still accrue on quiet days)
return {statusCode: 200, body: "sent"|"skipped: all Hold"} for CloudWatch
```

**Exception-based sending — SUPERSEDED 2026-07-08: the user now wants the
digest every day**, with tier changes and health flags highlighted inside it
rather than gating delivery (the listing also sorts actionable verdicts
first, Hold last). The original design, kept for the record — send when ANY
of:

1. Any holding's tier is not "Hold" (Strong Buy, Buy, Reduce, or Sell);
2. Any holding's tier changed vs. its last snapshot (same engineVersion) —
   including changes *into* Hold ("MSFT downgraded: Buy → Hold" is exactly
   the kind of news a holder wants even though the new tier is Hold);
3. Any portfolio-health flag of severity "warn" is new since the last run
   (compare flag kind+symbols against the state's stored flags);
4. Heartbeat: it's the 1st of the month (Pacific) — send the digest even if
   all-Hold, titled "Monthly check-in — all quiet", so silence can always be
   trusted to mean "nothing actionable" rather than "the pipeline died".

Otherwise log `skipped: all Hold, no changes` and exit. Env override
`REPORT_ALWAYS_SEND=1` for debugging. Note the state-write asymmetry above:
skipped days still persist state (article archive + history), but a send
failure must NOT persist, so tomorrow's run re-detects the same changes and
retries the email.

- Per-symbol try/catch; failures become an "N symbols failed" email line,
  never a dead report.
- `day` = `YYYY-MM-DD` in **America/Los_Angeles** via `Intl.DateTimeFormat`
  (the Lambda clock is UTC); same-day re-runs overwrite, like the client.
- Env vars: `REPORT_SYMBOLS`, `REPORT_EMAIL` (default herosekai@gmail.com),
  `REPORT_STATE_BUCKET`, `REPORT_DRY_RUN=1` → log HTML instead of sending.

## Phase 5 — Email rendering + SES

- `server/lib/reportEmail.js`: pure `(results, health, meta) → {subject,
  html, text}`. Subject:
  `Portfolio committee — 2 Buy · 3 Hold · 1 Sell (1 change) — Jul 7`.
  Body order:
  1. **Tier changes** — the news, first.
  2. **Portfolio health** headline (% of value in Sell-rated names,
     concentration/correlation flags).
  3. **Per-holding rows**: symbol, tier badge, score, one-line thesis
     (`portfolioManager.summary`), news mood line with the top positive and
     top negative headline as links (from the sentiment agent's raw result),
     and for SELL verdicts the why-sell reasons + suggested trim % from
     `plan`.
  4. Footer: engine version, data-as-of time, articles scored count,
     "automated summary, not investment advice."
  Inline CSS, table layout (email clients), no external assets; plain-text
  alternative built alongside.
- Send with `@aws-sdk/client-ses` `SendEmailCommand`; add
  `@aws-sdk/client-ses` + `@aws-sdk/client-s3` to server dependencies.

## Phase 6 — AWS one-time setup (script it: `server/scripts/setup-daily-report.sh`)

1. **SES**: `aws ses verify-email-identity --email-address herosekai@gmail.com`
   → the user must click the confirmation link SES sends. Nothing sends
   until then — say so loudly.
2. **S3**: create private bucket `stockjs-report-state-<account-id>`.
3. **IAM** on `stockjs-lambda-role`: `ses:SendEmail` (identity ARN),
   `s3:GetObject`+`s3:PutObject` on `.../committee-state.json`.
4. **Lambda config**: timeout 300s, memory 2048MB, env vars from Phase 4,
   handler updated to `dist/index.mjs` (Phase 1).
5. **EventBridge Scheduler**: role trusted by `scheduler.amazonaws.com` with
   `lambda:InvokeFunction`, then:
   ```
   aws scheduler create-schedule --name stockjs-daily-report \
     --schedule-expression "cron(0 9 ? * MON-FRI *)" \
     --schedule-expression-timezone "America/Los_Angeles" \
     --flexible-time-window Mode=OFF \
     --target '{"Arn":"<lambda-arn>","RoleArn":"<role-arn>","Input":"{\"action\":\"dailyReport\"}"}'
   ```
6. **Cost guardrail** (see budget section): a $1/month AWS Budget with email
   alert to herosekai@gmail.com:
   ```
   aws budgets create-budget --account-id <id> --budget '{"BudgetName":"stockjs-monthly","BudgetLimit":{"Amount":"1","Unit":"USD"},"TimeUnit":"MONTHLY","BudgetType":"COST"}' \
     --notifications-with-subscribers '[{"Notification":{"NotificationType":"ACTUAL","ComparisonOperator":"GREATER_THAN","Threshold":50},"Subscribers":[{"SubscriptionType":"EMAIL","Address":"herosekai@gmail.com"}]}]'
   ```
   (Alerts at 50% of $1 — i.e., the moment this costs more than ~50¢/month,
   the user hears about it. AWS Budgets' first two budgets are free.)

## Free-tier budget (the numbers)

Monthly usage this feature adds, ~10 holdings assumed:

| Service | Usage/month | Free tier | Verdict |
|---|---|---|---|
| Lambda requests | ~31 report runs (+ existing API traffic) | 1M req/mo, **always free** | free |
| Lambda compute | 2GB × ~120–300s × 31 ≈ 8–19k GB-s | 400k GB-s/mo, **always free** | free (≈2–5% of tier) |
| EventBridge Scheduler | 31 invocations | 14M/mo free | free |
| SES | ~31 emails | 3k/mo free for 12 mo; then $0.10/1k | free → ~$0.003/mo after year 1 |
| S3 | 1 object (<100KB), ~62 requests | 12-mo free tier; after: pennies | free → ~$0.01/mo after year 1 |
| CloudWatch Logs | a few MB | 5GB ingest, always free | free |
| Data transfer | model download is inbound (free); email + tiny responses | 100GB out/mo free | free |

**Bottom line: comfortably inside the free tier. Worst case after the
12-month S3/SES free tiers lapse: on the order of $0.01–0.05/month.** The
only realistic way this ever costs real money is a runaway loop invoking the
Lambda repeatedly — which is exactly what the $1 budget alert (step 6)
catches. The FinBERT model itself is hosted free on Hugging Face; the daily
cold-start download is inbound and unbilled.

## Verification (do not skip)

1. **Engine sync check**: after Phase 1, run the four existing scratchpad
   sim suites against `packages/committee-engine/src/analyst/index.js` — all
   assertions green — and load the client UI (AI Committee tab renders,
   verdicts unchanged for cached symbols).
2. **Handlers unregressed**: direct-invoke `fundamentals`/`prices`/
   `analysis`/`news` for AAPL, compare row counts + key fields pre/post
   Phase 2 refactor.
3. **Local dry run**: `REPORT_DRY_RUN=1 REPORT_SYMBOLS="AAPL:10:150" node
   --input-type=module -e "…invoke handler with {action:'dailyReport'}…"` —
   assert the HTML mentions AAPL's tier, contains a news headline link, and
   contains no `NaN`/`undefined` substrings. (Local Node is 20.11 and
   yahoo-finance2 warns wanting ≥22 — warning only; the Lambda runs Node 22.)
4. **Sentiment parity**: score 3 fixture headlines via the shared
   `finbertScore.js` in Node and confirm shape equals what the browser
   worker attaches (`{sentiment, confidence, label}`).
5. **End-to-end**: manual `aws lambda invoke` with the payload; email
   arrives; S3 state exists; second same-day invoke does not duplicate the
   day's history row.
6. **Schedule test**: set the schedule a few minutes ahead once, watch
   CloudWatch, restore to 9:00.

## Explicit non-goals / follow-ups

- Portfolio auto-sync from the browser's Fidelity import (client → S3 via an
  authenticated endpoint) — **done**: sidebar → Sync email report; auto-syncs
  on each Fidelity import when a token is saved. `REPORT_SYMBOLS` remains a
  fallback when nothing has been synced yet.
- Multi-user by email — **done**: the email address entered in the sync modal
  is the identity. Each sync writes `portfolios/<email>.json`; the daily run
  fetches/scores each unique symbol once, then emails every synced address its
  own digest (sent from the verified `REPORT_EMAIL` identity). First-time
  addresses get an SES verification email on sync; in the SES sandbox nothing
  is delivered to an address until its owner clicks that link. Per-user send
  bookkeeping lives under `users` in `committee-state.json`; the legacy
  single-user `portfolio.json` is still read for `REPORT_EMAIL` until that
  address re-syncs. Tokens are self-service: `action=requestToken` emails a
  fresh per-email token (sha256 hash stored at `tokens/<email>.json`) to a
  verified address; `portfolioSync` accepts either that per-email token or
  the global `SYNC_TOKEN` (admin fallback).
- Full-article crawling for sentiment (browser deep-review parity) — the
  extraction path is heavier; headlines+summaries are v1.
- Baking the FinBERT model into the deploy artifact or a Lambda layer to
  kill the cold-start download (zip limit 250MB unzipped — it likely fits;
  do it only if the daily download proves flaky).
- Intra-day alerts ("position crossed its stop") — same skeleton, different
  schedule.

## Context for the implementer

The user is a long-term position investor (not a day trader) who wants
beginner-friendly plain English — the email should read like the committee
UI (tiers, "why", "what would change our mind"), not a data dump. Engine
semantics, tier thresholds, and history rules live in
`docs/committee-roadmap-plan.md`. Respect `COMMITTEE_ENGINE_VERSION` in all
history comparisons, and keep the engine pure — no network or AWS calls
inside `packages/committee-engine/`.
