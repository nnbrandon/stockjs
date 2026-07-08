import {
  getAllPositions,
  getCommitteeHistory,
  getNewsBySymbol,
} from "../db";
import LambdaService from "../LambdaService";

// How much per-symbol evidence rides along with a sync. The email report
// runs the same committee engine as the browser — syncing the browser's
// scored article archive and verdict history is what keeps the two verdicts
// consistent (a fresh Lambda archive has ~10 articles and no history, which
// reads as weak evidence and drags scores toward Hold).
const SYNC_ARTICLES_PER_SYMBOL = 100;
const SYNC_WINDOW_DAYS = 30;
const SYNC_HISTORY_ROWS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Compact, score-preserving evidence for one symbol (no article bodies). */
async function collectSymbolEvidence(symbol) {
  const cutoff = Date.now() - SYNC_WINDOW_DAYS * DAY_MS;
  const [news, history] = await Promise.all([
    getNewsBySymbol(symbol),
    getCommitteeHistory(symbol, SYNC_HISTORY_ROWS),
  ]);

  // getNewsBySymbol returns newest-first, so the cap keeps recent articles.
  const articles = (news || [])
    .filter((a) => {
      const t = new Date(a?.date).getTime();
      return a?.id != null && Number.isFinite(t) && t >= cutoff;
    })
    .slice(0, SYNC_ARTICLES_PER_SYMBOL)
    .map((a) => ({
      id: a.id,
      title: a.title,
      publisher: a.publisher,
      link: a.link,
      date: a.date,
      ...(a.summary ? { summary: a.summary } : {}),
      // FinBERT scores the browser already computed — the Lambda reuses
      // them instead of re-scoring (and judging from thinner data).
      ...(a.model ? { model: a.model, modelVersion: a.modelVersion } : {}),
    }));

  const rows = (history || []).map((r) => ({
    symbol: r.symbol,
    day: r.day,
    engineVersion: r.engineVersion,
    composite: r.composite,
    tier: r.tier,
    action: r.action,
    conviction: r.conviction,
    technical: r.technical ?? null,
    fundamental: r.fundamental ?? null,
    sentiment: r.sentiment ?? null,
    exitSignals: r.exitSignals ?? null,
    generatedAt: r.generatedAt,
  }));

  return { articles, history: rows };
}

const TOKEN_KEY = "stockjsReportSyncToken";
const EMAIL_KEY = "stockjsReportSyncEmail";
const LAST_SYNC_KEY = "stockjsReportSyncAt";

export function getReportSyncToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setReportSyncToken(token) {
  const trimmed = (token || "").trim();
  if (trimmed) localStorage.setItem(TOKEN_KEY, trimmed);
  else localStorage.removeItem(TOKEN_KEY);
}

// The email is the identity on the server: the portfolio is stored under it
// and the daily report is sent to it.
export function getReportSyncEmail() {
  return localStorage.getItem(EMAIL_KEY) || "";
}

export function setReportSyncEmail(email) {
  const trimmed = (email || "").trim().toLowerCase();
  if (trimmed) localStorage.setItem(EMAIL_KEY, trimmed);
  else localStorage.removeItem(EMAIL_KEY);
}

export function isReportSyncConfigured() {
  return Boolean(getReportSyncToken() && getReportSyncEmail());
}

export function getLastReportSyncAt() {
  return localStorage.getItem(LAST_SYNC_KEY);
}

/**
 * Push current holdings to S3 for the daily email report. Requires a sync
 * token from setup-daily-report.sh. Best-effort on import/delete — callers
 * decide whether to surface errors.
 */
export async function syncReportPortfolio(positions) {
  const token = getReportSyncToken();
  const email = getReportSyncEmail();
  if (!token || !email) return { ok: false, reason: "not-configured" };

  const rows = positions ?? (await getAllPositions());
  if (!rows.length) return { ok: false, reason: "no-positions" };

  const payload = rows.map(({ symbol, quantity, averageCostBasis }) => ({
    symbol,
    quantity,
    averageCostBasis,
  }));

  // Evidence is best-effort per symbol — a failed read must not block the
  // holdings sync itself.
  const symbols = {};
  for (const { symbol } of payload) {
    try {
      const evidence = await collectSymbolEvidence(symbol);
      if (evidence.articles.length || evidence.history.length) {
        symbols[symbol] = evidence;
      }
    } catch {
      // holdings still sync; the server just fetches fresh news for this one
    }
  }

  const result = await LambdaService.syncPortfolio(token, email, payload, symbols);
  if (result.ok) {
    localStorage.setItem(
      LAST_SYNC_KEY,
      result.updatedAt || new Date().toISOString(),
    );
  }
  return result;
}

/**
 * Stop the daily report: delete this email's portfolio from the server.
 * Local settings are kept so Save & sync can turn it back on later.
 */
export async function removeReportPortfolio() {
  const token = getReportSyncToken();
  const email = getReportSyncEmail();
  if (!token || !email) return { ok: false, reason: "not-configured" };

  const result = await LambdaService.removePortfolio(token, email);
  if (result.ok) localStorage.removeItem(LAST_SYNC_KEY);
  return result;
}
