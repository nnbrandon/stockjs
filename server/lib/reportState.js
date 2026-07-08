// Light S3 accessors for the committee state + synced portfolios. Kept free
// of engine/FinBERT imports so read-only handlers (action=committeeResults)
// can load them without dragging the analysis stack into cold start.

import {
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export const STATE_KEY = "committee-state.json";

const s3 = new S3Client({});

/** GET + parse a JSON object, or null when the key doesn't exist. */
export async function getJson(bucket, key) {
  try {
    const res = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    return JSON.parse(await res.Body.transformToString());
  } catch (err) {
    if (err instanceof NoSuchKey || err.name === "NoSuchKey") return null;
    throw err;
  }
}

export async function loadState(bucket) {
  if (!bucket) return {};
  return (await getJson(bucket, STATE_KEY)) ?? {};
}

export function saveState(bucket, state) {
  return s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: STATE_KEY,
      Body: JSON.stringify(state),
      ContentType: "application/json",
    }),
  );
}

/** Synced positions → report holdings, or null when there's nothing usable. */
export function toHoldings(data) {
  const holdings = (data?.positions ?? [])
    .filter((p) => typeof p?.symbol === "string" && p.symbol)
    .map((p) => ({
      symbol: p.symbol.toUpperCase(),
      quantity: Number.isFinite(p.quantity) ? p.quantity : null,
      avgCostBasis: Number.isFinite(p.averageCostBasis)
        ? p.averageCostBasis
        : null,
    }));
  return holdings.length ? holdings : null;
}
