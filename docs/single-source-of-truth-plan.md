# Plan: Single source of truth — committee runs server-side only

**Status: implemented 2026-07-07 (all three phases).** Phase 1: server
pipeline + `committeeResults`/`runCommittee` endpoints. Phase 2: portfolio
panel server-backed. Phase 3: AnalystPanel reads the symbol's stored `latest`
via `useServerCommittee` (held symbols come from the last stored run;
browsed symbols get an on-demand `runCommittee(symbols:[symbol])` with a
"Run committee on server" button); the browser scoring stack is deleted
(`useFinbert`, `finbert.worker.js`, `useNewsIntelligence`, `scoreSymbolNews`,
`scorePortfolioNews`, `loadCommitteeData`, `newsAgent`). Kept local: candle
loads for position P/L + the fund fast-path, `getGuardrail` on the server
report, and the dev-only backtest harness (which still uses the engine
in-browser by design). Dexie's `news`/`committeeHistory` stores remain but
nothing writes committee data to them anymore.

## Why

The browser and the Lambda each accumulated their own news archive and ran the
committee independently, so verdicts drifted (META: Buy in the UI, Hold in the
email, same day). The evidence-sync patch (2026-07-07) bridges the gap but
consistency still depends on how recently a browser synced. The professional
pattern — and the end state here — is one centralized pipeline: data ingested,
scored, and judged **once, server-side**, with every surface (UI, email) a
view of the same stored result.

## Target architecture

```
EventBridge (9 AM) ──► Lambda: committee pipeline ──► S3 committee-state.json
UI "Re-run"        ──► action=runCommittee        ──►      (same state)
UI open/panel      ──► action=committeeResults    ◄──      (pure read)
Daily email        ──► renders from the same run  ◄──      (same state)
```

- The Lambda is the only place FinBERT runs and the only place
  `runAnalystCommittee` runs for product surfaces. (Exception: the dev-only
  backtest harness `window.__stockjsBacktest` keeps using the engine locally.)
- IndexedDB is demoted to a cache: candles/fundamentals for charts stay local,
  but committee verdicts, news sentiment, and history come from the server.
- Consistency is by construction: the email renders whatever the last stored
  run concluded; the UI displays the same rows.

## State layout (S3, committee-state.json → version 3)

```
symbols[SYM]: {
  articles: [...scored rolling archive (unchanged)...],
  history:  [...daily verdict rows (unchanged)...],
  latest: {                      ← NEW: what the UI renders
    report,                      ← full committee report (verdict, agents, pillars)
    previousSnapshot, tierChange,
    newsMood, topPositive, topNegative,
    isFund, error,
    generatedAt, engineVersion,
  },
}
users[email]: {
  lastSendDay, lastHealthFlags,  (unchanged)
  health,                        ← NEW: latest full portfolio-health report
  healthGeneratedAt,
}
```

## Server changes (Phase 1)

1. **Extract `server/lib/committeePipeline.js`** from dailyReport.js:
   `analyzeSymbols(uniqueHoldings, state, syncedEvidence)` — fetch market
   data, merge archives, FinBERT-score, run committee, produce per-symbol
   results including the `latest` block. dailyReport keeps: users, send
   decision, email render, per-user state. Re-export moved helpers from
   dailyReport so scripts/tests keep working.
2. **Persist `latest` per symbol and `health` per user** on every run
   (scheduled or on-demand).
3. **New handler `server/handlers/committee.js`:**
   - `action=committeeResults` (POST {token, email}) — auth identical to
     portfolioSync (per-email token or master). Reads the user's portfolio +
     state, returns `{ generatedAt, results, health }` where results carry
     each holding's `latest` + top-3 archive articles. Pure read, fast.
   - `action=runCommittee` (POST {token, email, symbols?}) — runs the
     pipeline now. Default scope: the user's synced portfolio. `symbols` may
     add extra symbols (AnalystPanel viewing a non-held ticker): extras are
     analyzed and returned but persisted only if some portfolio holds them
     (keeps state from bloating with every browsed ticker). Persists state,
     returns the same shape as committeeResults. Runs within the 300s
     function budget; the first hit on a cold container pays the FinBERT
     model download (~1 min).
4. Email path unchanged in behavior — it now renders from pipeline output and
   stores what it rendered.

## Client changes (Phase 2)

1. `LambdaService.fetchCommitteeResults()` / `runCommitteeServer(symbols?)`
   using the stored sync credentials (email + token, localStorage).
2. **usePortfolioCommittee** becomes server-backed:
   - Mount/idle: `fetchCommitteeResults` → map into the existing result shape
     (`{symbol, position, report, previousSnapshot, news, newsMood, isFund,
     error}` + `health`) so panels render unchanged.
   - `run()` → `runCommitteeServer()` (both former quick/deep buttons collapse
     into one "Re-run on server"; progress is indeterminate).
   - Requires report sync to be configured; the panel prompts to set it up
     otherwise (committee is now a synced-account feature — accepted
     trade-off of centralizing).
3. **AnalystPanel**: committee section renders the symbol's server `latest`
   (via committeeResults, or `runCommittee(symbols:[symbol])` for a fresh
   look at a non-held ticker). News-intelligence stats come from the server's
   scored archive.
4. **Retire** browser scoring: `useFinbert`, `finbert.worker.js`,
   `scoreSymbolNews`, `scorePortfolioNews`, `useNewsIntelligence`, committee
   writes to Dexie `committeeHistory` (history is server-owned now; the store
   stays read-only for the sparkline until fully migrated).

## Known deltas / accepted trade-offs

- **Article scoring text (updated 2026-07-07):** the server pipeline crawls
  full article bodies and scores `title + body` (via the shared
  `composeArticleText`), degrading to `title + summary` on paywalled/failed
  crawls. The browser scorers use the identical composition until Phase 3
  retires them, so scores stay byte-compatible across surfaces.
- Committee features need sync configured (email + token) — they now key off
  server state.
- On-demand runs cost seconds-to-a-minute (server round trip + possible cold
  model) vs instant cached local runs. Scheduled 9 AM runs keep results warm
  so the common case is a fast read.
- The evidence sync (portfolioSync `symbols` payload) becomes a one-time
  seeding mechanism; harmless to keep, removable once state is warm.

## Verification

- Server: `npm run bundle`; local dry-run `node scripts/dry-run-report.mjs`
  (must still send/skip as before AND write `latest` blocks);
  esbuild-harness unit tests for pipeline helpers.
- Client: eslint; manual flow — open portfolio panel (reads stored results),
  Re-run (server), AnalystPanel on a held + a non-held symbol.
- End-to-end: `action=runCommittee` via curl with sync token, then
  `action=committeeResults`, then invoke dailyReport and confirm the email's
  tiers match the UI rows byte-for-byte from the same state.
