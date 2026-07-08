import { getAllPositions } from "../db";
import LambdaService from "../LambdaService";

const TOKEN_KEY = "stockjsReportSyncToken";
const EMAIL_KEY = "stockjsReportSyncEmail";
const LAST_SYNC_KEY = "stockjsReportSyncAt";

// Dev-only credentials from client/.env.local (gitignored) so local dev
// works without pasting credentials into every browser profile. They take
// precedence over localStorage in dev — the env file is explicit config,
// while localStorage may hold a stale token from an earlier session. The
// server still validates the token on every call; production builds never
// set these vars, so this whole block is inert there.
const DEV_TOKEN = import.meta.env.DEV
  ? import.meta.env.VITE_REPORT_SYNC_TOKEN || ""
  : "";
const DEV_EMAIL = import.meta.env.DEV
  ? import.meta.env.VITE_REPORT_SYNC_EMAIL || ""
  : "";

export function getReportSyncToken() {
  return DEV_TOKEN || localStorage.getItem(TOKEN_KEY) || "";
}

export function setReportSyncToken(token) {
  const trimmed = (token || "").trim();
  if (trimmed) localStorage.setItem(TOKEN_KEY, trimmed);
  else localStorage.removeItem(TOKEN_KEY);
}

// The email is the identity on the server: the portfolio is stored under it
// and the daily report is sent to it.
export function getReportSyncEmail() {
  return DEV_EMAIL || localStorage.getItem(EMAIL_KEY) || "";
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

  const result = await LambdaService.syncPortfolio(token, email, payload);
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
