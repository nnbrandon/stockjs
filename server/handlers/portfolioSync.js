// Receives the browser's imported portfolio and persists it to S3 so the
// daily email report tracks what the UI shows (instead of a hand-maintained
// REPORT_SYMBOLS env var).
//
// Reachable through the public Function URL (the client has no other path),
// so it authenticates with a shared secret: the SYNC_TOKEN env var, generated
// by setup-daily-report.sh and pasted once into the app. Worst case if the
// token leaks: someone can overwrite which symbols the report covers — no
// reads, no money, no PII beyond holdings.

import { timingSafeEqual, createHash } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { errorResponse, jsonResponse } from "../lib/response.js";

export const PORTFOLIO_KEY = "portfolio.json";
const MAX_POSITIONS = 200;

const s3 = new S3Client({});

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

  const positions = sanitizePositions(body?.positions);
  if (!positions || !positions.length) {
    return errorResponse(400, "No valid positions in request", corsOrigin);
  }

  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: "client",
    positions,
  };

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: PORTFOLIO_KEY,
        Body: JSON.stringify(payload),
        ContentType: "application/json",
      }),
    );
  } catch (err) {
    console.error("portfolioSync: S3 write failed:", err);
    return errorResponse(502, "Failed to persist portfolio", corsOrigin);
  }

  console.log(`portfolioSync: stored ${positions.length} positions`);
  return jsonResponse(
    200,
    { ok: true, count: positions.length, updatedAt: payload.updatedAt },
    corsOrigin,
  );
}
