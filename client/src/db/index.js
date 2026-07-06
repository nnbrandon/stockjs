/**
 * Public DB surface. All app code imports from here (`from "../db"`).
 *
 * Internal layout:
 *   - database.js          Dexie instance + versioned schema registry
 *   - utils.js             logging, date coercion, range filter helpers
 *   - stores/stockData.js  CRUD for the `stockData` store
 *   - stores/fundamentals  CRUD for `quarterlyResult` + `annualResult`
 *   - stores/news.js       CRUD for the `news` store
 *
 * To add a new store: declare it in database.js (bumping the schema version),
 * add a new file under stores/ with its CRUD, and re-export it below. To wire
 * it into the global "remove a ticker" flow, also add its delete*ForSymbol
 * call to `deleteSymbolData` below.
 */

import { withLog } from "./utils";
import { deleteStockDataForSymbol } from "./stores/stockData";
import { deleteFundamentalsForSymbol } from "./stores/fundamentals";
import { deleteNewsForSymbol } from "./stores/news";
import { deleteEarningsForSymbol } from "./stores/earnings";
import { deletePositionForSymbol } from "./stores/positions";
import { deleteCommitteeHistoryForSymbol } from "./stores/committeeHistory";
import { deleteAnalysisForSymbol } from "./stores/analysis";

export { db, CURRENT_DB_VERSION, STORE_NAMES } from "./database";

export {
  addStockData,
  getStockDataBySymbol,
  getStockDataByDateRange,
  getStoredSymbols,
  getStoredSymbolsWithNames,
  get52WeekStats,
  getAverageVolumePast30Days,
  getLatestCandles,
} from "./stores/stockData";

export {
  saveFundamentals,
  getQuarterly,
  getAnnual,
} from "./stores/fundamentals";

export {
  saveNewsArticles,
  saveNewsBodies,
  saveNewsSentiment,
  getNewsBySymbol,
} from "./stores/news";

export { saveEarnings, getEarnings } from "./stores/earnings";

export {
  saveCommitteeSnapshot,
  getCommitteeHistory,
  getCommitteeHistoryForSymbols,
  deleteCommitteeHistoryForSymbol,
} from "./stores/committeeHistory";

export {
  saveAnalysis,
  getAnalysis,
  isAnalysisStale,
  deleteAnalysisForSymbol,
} from "./stores/analysis";

export {
  getAllPositions,
  getPosition,
  upsertPosition,
  upsertPositions,
  deletePositionForSymbol,
} from "./stores/positions";

/**
 * Remove every trace of a symbol across every store. Add new stores' delete
 * helpers to this list as the schema grows.
 */
export async function deleteSymbolData(symbol) {
  return withLog(`deleted all data for ${symbol}`, () =>
    Promise.allSettled([
      deleteStockDataForSymbol(symbol),
      deleteFundamentalsForSymbol(symbol),
      deleteNewsForSymbol(symbol),
      deleteEarningsForSymbol(symbol),
      deletePositionForSymbol(symbol),
      deleteCommitteeHistoryForSymbol(symbol),
      deleteAnalysisForSymbol(symbol),
    ]),
  );
}
