// Receives the browser's imported portfolio and persists it to S3 so the
// daily email report tracks what the UI shows (instead of a hand-maintained
// REPORT_SYMBOLS env var).
//
// The user's email address is the identity: each portfolio lands at
// portfolios/<email>.json and the daily report emails each portfolio's owner.
// New addresses get an SES verification email on first sync — in the SES
// sandbox nothing can be sent to them until they click the link.
//
// Reachable through the public Function URL (the client has no other path),
// so it authenticates with a shared secret: the SYNC_TOKEN env var, generated
// by setup-daily-report.sh and pasted once into the app. Worst case if the
// token leaks: someone can overwrite which symbols a report covers — no
// reads, no money, no PII beyond holdings.

import { timingSafeEqual, createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { errorResponse, jsonResponse } from "../lib/response.js";

export const PORTFOLIO_PREFIX = "portfolios/";
// Per-email sync tokens (sha256 hashes only), written by action=requestToken.
export const TOKEN_PREFIX = "tokens/";
// Pre-multi-user location, read as a fallback for REPORT_EMAIL's portfolio.
export const LEGACY_PORTFOLIO_KEY = "portfolio.json";
const MAX_POSITIONS = 200;

const s3 = new S3Client({});

// Good enough to key S3 objects and hand to SES — real validation is the
// verification link the user has to click.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw) {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) return null;
  return email;
}

export function portfolioKeyForEmail(email) {
  return `${PORTFOLIO_PREFIX}${encodeURIComponent(email)}.json`;
}

export function tokenKeyForEmail(email) {
  return `${TOKEN_PREFIX}${encodeURIComponent(email)}.json`;
}

export const sha256Hex = (s) => createHash("sha256").update(s).digest("hex");

// Hash both sides so timingSafeEqual gets equal-length buffers regardless of
// what the caller sent.
function tokenMatches(provided, expected) {
  if (typeof provided !== "string" || !provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Compare a provided token against a stored sha256-hex hash. */
function tokenMatchesHash(provided, expectedHex) {
  if (typeof provided !== "string" || !provided || !expectedHex) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = Buffer.from(expectedHex, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The per-email token hash written by action=requestToken, or null. */
async function loadTokenHash(bucket, email) {
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: tokenKeyForEmail(email) }),
    );
    const data = JSON.parse(await res.Body.transformToString());
    return typeof data?.tokenHash === "string" ? data.tokenHash : null;
  } catch (err) {
    if (!(err instanceof NoSuchKey || err.name === "NoSuchKey")) {
      console.error("portfolioSync: failed to read token hash:", err);
    }
    return null;
  }
}

/**
 * Shared credential check for every token-authenticated action (sync,
 * remove, committee reads/runs): a valid email plus either that email's own
 * token (from action=requestToken) or the master SYNC_TOKEN.
 * Returns { email } on success or { error: [status, message] }.
 */
export async function authenticateSync(body, bucket) {
  const email = normalizeEmail(body?.email);
  if (!email) return { error: [400, "A valid email address is required"] };

  const perEmailHash = await loadTokenHash(bucket, email);
  const authorized =
    tokenMatchesHash(body?.token, perEmailHash) ||
    tokenMatches(body?.token, process.env.SYNC_TOKEN || "");
  if (!authorized) return { error: [403, "Invalid sync token"] };

  return { email };
}

const finiteOrNull = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** Keep only the fields the report needs; drop anything malformed. */
function sanitizePositions(raw) {
  if (!Array.isArray(raw)) return null;
  const positions = [];
  for (const p of raw.slice(0, MAX_POSITIONS)) {
    const symbol =
      typeof p?.symbol === "string" ? p.symbol.trim().toUpperCase() : "";
    if (!symbol || !/^[A-Z0-9.\-]{1,12}$/.test(symbol)) continue;
    positions.push({
      symbol,
      quantity: finiteOrNull(p.quantity),
      averageCostBasis: finiteOrNull(p.averageCostBasis),
    });
  }
  return positions;
}

/**
 * Make sure SES knows this address, kicking off verification for brand-new
 * ones (that sends the "Amazon SES verification" email). Returns true when
 * verified, false when pending/just started, null when SES was unreachable —
 * best-effort, a sync must never fail over this.
 *
 * `resend: true` re-sends even for Pending addresses — right for explicit
 * user requests (the "Email me a sync token" button), where the previous
 * link may be lost or expired (SES links last 24h). The default skips
 * Pending so automatic paths (every portfolio sync) can't spam.
 *
 * SES is imported lazily so ordinary API requests don't pay for the client.
 */
export async function ensureEmailVerification(email, { resend = false } = {}) {
  try {
    const {
      SESClient,
      GetIdentityVerificationAttributesCommand,
      VerifyEmailIdentityCommand,
    } = await import("@aws-sdk/client-ses");
    const ses = new SESClient({});
    const res = await ses.send(
      new GetIdentityVerificationAttributesCommand({ Identities: [email] }),
    );
    const status = res.VerificationAttributes?.[email]?.VerificationStatus;
    if (status === "Success") return true;
    if (resend || !status || status === "NotStarted" || status === "Failed") {
      await ses.send(new VerifyEmailIdentityCommand({ EmailAddress: email }));
      console.log(`portfolioSync: sent SES verification email to ${email}`);
    }
    return false;
  } catch (err) {
    console.error("portfolioSync: SES verification check failed:", err);
    return null;
  }
}

export async function syncPortfolio(body, corsOrigin) {
  const bucket = process.env.REPORT_STATE_BUCKET || "";
  if (!bucket) {
    return errorResponse(
      503,
      "Portfolio sync is not configured on the server",
      corsOrigin,
    );
  }

  const auth = await authenticateSync(body, bucket);
  if (auth.error) return errorResponse(...auth.error, corsOrigin);
  const { email } = auth;

  const positions = sanitizePositions(body?.positions);
  if (!positions || !positions.length) {
    return errorResponse(400, "No valid positions in request", corsOrigin);
  }

  const payload = {
    version: 2,
    email,
    updatedAt: new Date().toISOString(),
    source: "client",
    positions,
  };

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: portfolioKeyForEmail(email),
        Body: JSON.stringify(payload),
        ContentType: "application/json",
      }),
    );
  } catch (err) {
    console.error("portfolioSync: S3 write failed:", err);
    return errorResponse(502, "Failed to persist portfolio", corsOrigin);
  }

  const emailVerified = await ensureEmailVerification(email);

  console.log(
    `portfolioSync: stored ${positions.length} positions for ${email}`,
  );
  return jsonResponse(
    200,
    {
      ok: true,
      count: positions.length,
      updatedAt: payload.updatedAt,
      emailVerified,
    },
    corsOrigin,
  );
}

/**
 * The unsubscribe (action=removePortfolio): deletes the email's portfolio so
 * the daily report stops covering it. Same credentials as syncPortfolio.
 * Re-syncing later turns the report back on.
 */
export async function removePortfolio(body, corsOrigin) {
  const bucket = process.env.REPORT_STATE_BUCKET || "";
  if (!bucket) {
    return errorResponse(
      503,
      "Portfolio sync is not configured on the server",
      corsOrigin,
    );
  }

  const auth = await authenticateSync(body, bucket);
  if (auth.error) return errorResponse(...auth.error, corsOrigin);
  const { email } = auth;

  const keys = [portfolioKeyForEmail(email)];
  // The report falls back to the legacy single-user portfolio.json for
  // REPORT_EMAIL — for that address it must be deleted too, or the report
  // would quietly keep sending from the stale snapshot.
  if (email === normalizeEmail(process.env.REPORT_EMAIL)) {
    keys.push(LEGACY_PORTFOLIO_KEY);
  }

  try {
    for (const key of keys) {
      // DeleteObject succeeds even when the key doesn't exist.
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
  } catch (err) {
    console.error("portfolioSync: S3 delete failed:", err);
    return errorResponse(502, "Failed to remove portfolio", corsOrigin);
  }

  console.log(`portfolioSync: removed portfolio for ${email}`);
  return jsonResponse(200, { ok: true, removed: true }, corsOrigin);
}
