// The UI's window onto the server-side committee (single source of truth):
//
//   action=committeeResults — pure read of the last stored run: per-holding
//     `latest` blocks + the user's portfolio health. Fast (two S3 GETs);
//     imports nothing heavy.
//
//   action=runCommittee — run the pipeline NOW for the user's synced
//     portfolio (plus optional extra symbols the UI is looking at). Persists
//     the run so the next read — and the next daily email — shows the same
//     verdicts. The pipeline is lazy-imported: it drags FinBERT + the
//     committee engine, which reads must never pay for.
//
// Both are authenticated exactly like portfolioSync (per-email token or the
// master SYNC_TOKEN).

import { errorResponse, jsonResponse } from "../lib/response.js";
import { getJson, loadState, saveState, toHoldings } from "../lib/reportState.js";
import {
  authenticateSync,
  portfolioKeyForEmail,
} from "./portfolioSync.js";

const SYMBOL_RE = /^[A-Z0-9.\-]{1,12}$/;
const MAX_EXTRA_SYMBOLS = 5;
const TOP_ARTICLES = 3;

/** The response rows both actions return: latest block + display articles. */
function buildResults(holdings, symbolsState) {
  return holdings.map((h) => {
    const entry = symbolsState[h.symbol];
    return {
      symbol: h.symbol,
      quantity: h.quantity,
      avgCostBasis: h.avgCostBasis,
      latest: entry?.latest ?? null,
      history: entry?.history ?? [],
      articles: (entry?.articles ?? []).slice(0, TOP_ARTICLES),
    };
  });
}

export async function getCommitteeResults(body, corsOrigin) {
  const bucket = process.env.REPORT_STATE_BUCKET || "";
  if (!bucket) {
    return errorResponse(
      503,
      "Committee results are not configured on the server",
      corsOrigin,
    );
  }

  const auth = await authenticateSync(body, bucket);
  if (auth.error) return errorResponse(...auth.error, corsOrigin);
  const { email } = auth;

  const portfolio = await getJson(bucket, portfolioKeyForEmail(email));
  const holdings = toHoldings(portfolio);
  if (!holdings) {
    return errorResponse(
      404,
      "No synced portfolio for this email — sync your holdings first",
      corsOrigin,
    );
  }

  const state = await loadState(bucket);
  const user = state.users?.[email];

  return jsonResponse(
    200,
    {
      ok: true,
      generatedAt: state.updatedAt ?? null,
      results: buildResults(holdings, state.symbols ?? {}),
      health: user?.health ?? null,
      healthGeneratedAt: user?.healthGeneratedAt ?? null,
    },
    corsOrigin,
  );
}

export async function runCommittee(body, corsOrigin) {
  const bucket = process.env.REPORT_STATE_BUCKET || "";
  if (!bucket) {
    return errorResponse(
      503,
      "Committee runs are not configured on the server",
      corsOrigin,
    );
  }

  const auth = await authenticateSync(body, bucket);
  if (auth.error) return errorResponse(...auth.error, corsOrigin);
  const { email } = auth;

  const portfolio = await getJson(bucket, portfolioKeyForEmail(email));
  const holdings = toHoldings(portfolio) ?? [];

  // Extra symbols (AnalystPanel looking at a non-held ticker): analyzed and
  // returned, but persisted only when some portfolio holds them — browsing a
  // ticker must not grow the shared state forever.
  const extras = (Array.isArray(body?.symbols) ? body.symbols : [])
    .map((s) => (typeof s === "string" ? s.trim().toUpperCase() : ""))
    .filter((s) => SYMBOL_RE.test(s))
    .slice(0, MAX_EXTRA_SYMBOLS);

  const heldSymbols = new Set(holdings.map((h) => h.symbol));
  const runHoldings = [
    ...holdings,
    ...extras
      .filter((s) => !heldSymbols.has(s))
      .map((s) => ({ symbol: s, quantity: null, avgCostBasis: null })),
  ];
  if (!runHoldings.length) {
    return errorResponse(
      400,
      "Nothing to analyze — sync a portfolio or pass symbols",
      corsOrigin,
    );
  }

  const {
    analyzeSymbols,
    collectSyncedEvidence,
    computeUserView,
    nextSymbolStateEntries,
  } = await import("../lib/committeePipeline.js");

  const state = await loadState(bucket);
  const evidence = collectSyncedEvidence([
    { symbols: portfolio?.symbols ?? null },
  ]);

  const { symbolResults, articlesScored, generatedAt } = await analyzeSymbols(
    runHoldings,
    state,
    evidence,
  );
  const resultBySymbol = new Map(symbolResults.map((r) => [r.symbol, r]));
  const { health } = computeUserView(holdings, resultBySymbol);

  // Persist held symbols only; leave email bookkeeping (lastSendDay,
  // lastHealthFlags) untouched so on-demand runs never suppress the daily
  // email's "new since yesterday" detection.
  const persistedResults = symbolResults.filter((r) => heldSymbols.has(r.symbol));
  const nextState = {
    ...state,
    version: 3,
    updatedAt: generatedAt,
    users: {
      ...(state.users || {}),
      ...(holdings.length
        ? {
            [email]: {
              ...(state.users?.[email] || {}),
              health,
              healthGeneratedAt: generatedAt,
            },
          }
        : {}),
    },
    symbols: {
      ...(state.symbols || {}),
      ...nextSymbolStateEntries(persistedResults, generatedAt),
    },
  };
  await saveState(bucket, nextState);

  // Response includes extras (from the in-memory run) even though only held
  // symbols were persisted.
  const allSymbolsState = {
    ...nextState.symbols,
    ...nextSymbolStateEntries(symbolResults, generatedAt),
  };
  console.log(
    `runCommittee: ${email} — ${runHoldings.length} symbols, ${articlesScored} articles scored`,
  );
  return jsonResponse(
    200,
    {
      ok: true,
      generatedAt,
      results: buildResults(runHoldings, allSymbolsState),
      health,
      healthGeneratedAt: generatedAt,
    },
    corsOrigin,
  );
}
