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
  if (!valid.length) return 0;

  await withLog(`news: enriched ${valid.length} article bodies`, () =>
    db.transaction("rw", db[STORE], async () => {
      for (const u of valid) {
        await db[STORE].update(u.id, {
          body: u.body,
          ...(u.excerpt ? { excerpt: u.excerpt } : {}),
          enrichedAt: u.fetchedAt || new Date().toISOString(),
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
