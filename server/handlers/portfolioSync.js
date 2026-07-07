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
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { errorResponse, jsonResponse } from "../lib/response.js";

export const PORTFOLIO_PREFIX = "portfolios/";
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

// Hash both sides so timingSafeEqual gets equal-length buffers regardless of
// what the caller sent.
function tokenMatches(provided, expected) {
  if (typeof provided !== "string" || !provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const finiteOrNull = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** Keep only the fields the report needs; drop anything malformed. */
function sanitizePositions(raw) {
  if (!Array.isArray(raw)) return null;
  const positions = [];
  for (const p of raw.slice(0, MAX_POSITIONS)) {
    const symbol = typeof p?.symbol === "string" ? p.symbol.trim().toUpperCase() : "";
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
 * SES is imported lazily so ordinary API requests don't pay for the client.
 */
async function ensureEmailVerification(email) {
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
    // Only kick off verification for addresses SES has never seen — pending
    // ones already got the email, and re-sending on every sync would spam.
    if (!status || status === "NotStarted" || status === "Failed") {
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
  const expected = process.env.SYNC_TOKEN || "";
  const bucket = process.env.REPORT_STATE_BUCKET || "";
  if (!expected || !bucket) {
    return errorResponse(
      503,
      "Portfolio sync is not configured on the server",
      corsOrigin,
    );
  }

  if (!tokenMatches(body?.token, expected)) {
    return errorResponse(403, "Invalid sync token", corsOrigin);
  }

  const email = normalizeEmail(body?.email);
  if (!email) {
    return errorResponse(400, "A valid email address is required", corsOrigin);
  }

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
