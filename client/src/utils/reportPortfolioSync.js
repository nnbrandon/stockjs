import { getAllPositions } from "../db";
import LambdaService from "../LambdaService";

const TOKEN_KEY = "stockjsReportSyncToken";
const LAST_SYNC_KEY = "stockjsReportSyncAt";

export function getReportSyncToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setReportSyncToken(token) {
  const trimmed = (token || "").trim();
  if (trimmed) localStorage.setItem(TOKEN_KEY, trimmed);
  else localStorage.removeItem(TOKEN_KEY);
}

export function isReportSyncConfigured() {
  return Boolean(getReportSyncToken());
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
  if (!token) return { ok: false, reason: "no-token" };

  const rows = positions ?? (await getAllPositions());
  if (!rows.length) return { ok: false, reason: "no-positions" };

  const payload = rows.map(({ symbol, quantity, averageCostBasis }) => ({
    symbol,
    quantity,
    averageCostBasis,
  }));

  const result = await LambdaService.syncPortfolio(token, payload);
  if (result.ok) {
    localStorage.setItem(
      LAST_SYNC_KEY,
      result.updatedAt || new Date().toISOString(),
    );
  }
  return result;
}
