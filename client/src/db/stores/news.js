import { db } from "../database";
import { toIsoDate, withLog } from "../utils";

const STORE = "news";

export async function saveNewsArticles(symbol, articles) {
  if (!articles?.length) return 0;

  const enriched = articles.map((item) => ({
    ...item,
    symbol,
    date: toIsoDate(item.date),
  }));

  return withLog(`news: saved ${enriched.length} articles for ${symbol}`, () =>
    db[STORE].bulkPut(enriched),
  );
}

// Patch already-stored articles with crawled body text. Each update is keyed
// by the article's primary key (id); fields are merged, not replaced.
export async function saveNewsBodies(updates = []) {
  const valid = updates.filter((u) => u && u.id != null && u.body);
  console.log("[db] saveNewsBodies called", {
    received: updates.length,
    valid: valid.length,
    ids: valid.map((u) => u.id),
  });
  if (!valid.length) return 0;

  await withLog(`news: enriched ${valid.length} article bodies`, () =>
    db.transaction("rw", db[STORE], async () => {
      for (const u of valid) {
        const updated = await db[STORE].update(u.id, {
          body: u.body,
          ...(u.excerpt ? { excerpt: u.excerpt } : {}),
          enrichedAt: u.fetchedAt || new Date().toISOString(),
        });
        console.log("[db] update result for", u.id, {
          rowsModified: updated, // 0 means the id didn't match an existing row
          bodyLength: u.body?.length ?? 0,
        });
      }
    }),
  );

  // Read back to prove the text is actually stored.
  const stored = await db[STORE].bulkGet(valid.map((u) => u.id));
  console.log(
    "[db] read-back after save",
    stored.map((row) => ({
      id: row?.id,
      hasBody: Boolean(row?.body),
      bodyLength: row?.body?.length ?? 0,
    })),
  );

  return valid.length;
}

// Cache FinBERT scores onto the news rows so we never re-score an article we've
// already analyzed. `model` = { sentiment, confidence, label }; analyzeNews-
// Sentiment reads it back via `item.model`.
const MODEL_VERSION = "finbert-prosus-v1";

export async function saveNewsSentiment(updates = []) {
  const valid = updates.filter(
    (u) => u && u.id != null && u.model && Number.isFinite(u.model.sentiment),
  );
  if (!valid.length) return 0;

  await withLog(`news: cached ${valid.length} FinBERT scores`, () =>
    db.transaction("rw", db[STORE], async () => {
      for (const u of valid) {
        await db[STORE].update(u.id, {
          model: u.model,
          modelVersion: MODEL_VERSION,
          scoredAt: new Date().toISOString(),
        });
      }
    }),
  );
  return valid.length;
}

export function getNewsBySymbol(symbol) {
  return db[STORE].where("symbol").equals(symbol).reverse().sortBy("date");
}

export function deleteNewsForSymbol(symbol) {
  return db[STORE].where("symbol").equals(symbol).delete();
}
