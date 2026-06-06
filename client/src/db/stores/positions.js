import { db } from "../database";
import { withLog } from "../utils";

const STORE = "positions";

export function getAllPositions() {
  return db[STORE].toArray();
}

export function getPosition(symbol) {
  return db[STORE].get(symbol);
}

export async function upsertPosition(position) {
  return withLog(`positions: upsert ${position.symbol}`, () =>
    db[STORE].put(position),
  );
}

export async function upsertPositions(positions) {
  if (!positions.length) return 0;
  return withLog(`positions: upsert ${positions.length} rows`, () =>
    db[STORE].bulkPut(positions),
  );
}

export function deletePositionForSymbol(symbol) {
  return db[STORE].delete(symbol);
}
