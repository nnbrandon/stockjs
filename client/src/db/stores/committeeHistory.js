import { db } from "../database";

const STORE = "committeeHistory";

/** Keep roughly this many daily snapshots per symbol (~1.5 years). */
const MAX_ROWS_PER_SYMBOL = 400;

function todayKey(ts = Date.now()) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Store one committee snapshot per symbol per day (same-day re-runs
 * overwrite). Never throws to the caller — history is a nice-to-have and
 * must not break a committee run.
 */
export async function saveCommitteeSnapshot(symbol, report, engineVersion) {
  if (!symbol || !report?.verdict) return;
  const bearAgent = report.agents?.find((a) => a.key === "bear");
  const row = {
    symbol,
    day: todayKey(report.generatedAt),
    engineVersion,
    composite: report.verdict.composite,
    tier: report.verdict.tier,
    action: report.verdict.action,
    conviction: report.verdict.conviction,
    technical: report.pillars?.technical ?? null,
    fundamental: report.pillars?.fundamental ?? null,
    sentiment: report.pillars?.sentiment ?? null,
    exitSignals: bearAgent?.exitSignals ?? null,
    generatedAt: report.generatedAt,
  };

  try {
    await db[STORE].put(row);

    const count = await db[STORE].where("symbol").equals(symbol).count();
    if (count > MAX_ROWS_PER_SYMBOL) {
      const oldest = await db[STORE]
        .where("symbol")
        .equals(symbol)
        .sortBy("day");
      const excess = oldest.slice(0, count - MAX_ROWS_PER_SYMBOL);
      await db[STORE].bulkDelete(excess.map((r) => [r.symbol, r.day]));
    }
  } catch (err) {
    console.warn(`committeeHistory: failed to save ${symbol}`, err);
  }
}

/** Snapshots for a symbol, oldest → newest. */
export async function getCommitteeHistory(symbol, limit = MAX_ROWS_PER_SYMBOL) {
  if (!symbol) return [];
  try {
    const rows = await db[STORE].where("symbol").equals(symbol).sortBy("day");
    return rows.slice(-limit);
  } catch {
    return [];
  }
}

/** Latest snapshots for many symbols at once: {symbol: row[]}. */
export async function getCommitteeHistoryForSymbols(symbols, limit = 30) {
  const out = {};
  await Promise.all(
    (symbols || []).map(async (symbol) => {
      out[symbol] = await getCommitteeHistory(symbol, limit);
    }),
  );
  return out;
}

export function deleteCommitteeHistoryForSymbol(symbol) {
  return db[STORE].where("symbol").equals(symbol).delete();
}
