import Dexie from "dexie";

/**
 * Centralized schema registry.
 *
 * Each entry describes one Dexie version:
 *   - `version`: integer, must increase monotonically
 *   - `stores`:  full Dexie schema for that version. Dexie diffs against the
 *                previous version automatically. Set a store's value to `null`
 *                to drop it.
 *   - `upgrade?`: optional async (tx) => void run when migrating from a lower
 *                 version. Use this to backfill / transform existing rows.
 *
 * Adding a new schema version
 * ---------------------------
 * 1. Append a new object to `schemaVersions` with the next integer.
 * 2. Provide the FULL `stores` map (Dexie wants every store you want to keep,
 *    not just the ones you changed).
 * 3. If existing rows need to change shape, supply an `upgrade` function.
 *
 * IMPORTANT: never edit a previously-released entry in place. Browsers in the
 * wild have already applied the old schema, and Dexie's migrations are linear.
 */
const schemaVersions = [
  {
    version: 1,
    stores: {
      stockData:
        "[symbol+shortenedDate], open, close, high, low, volume, adjClose, name",
      quarterlyResult: "[symbol+date], symbol, date",
      annualResult: "[symbol+date], symbol, date",
      news: "id, symbol, date",
    },
  },
  {
    version: 2,
    stores: {
      stockData:
        "[symbol+shortenedDate], open, close, high, low, volume, adjClose, name",
      quarterlyResult: "[symbol+date], symbol, date",
      annualResult: "[symbol+date], symbol, date",
      news: "id, symbol, date",
      earnings: "[symbol+date], symbol, date",
    },
  },
];

export const db = new Dexie("StocksDB");

for (const { version, stores, upgrade } of schemaVersions) {
  const v = db.version(version).stores(stores);
  if (upgrade) v.upgrade(upgrade);
}

export const CURRENT_DB_VERSION = schemaVersions.at(-1).version;

export const STORE_NAMES = Object.freeze(
  Object.keys(schemaVersions.at(-1).stores),
);
