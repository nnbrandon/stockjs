import Dexie from "dexie";

// Create a single database
export const db = new Dexie("StocksDB");

// Table for all stock data
db.version(1).stores({
  stockData: "[symbol+date], open, close, high, low, volume, adjClose",
  // compound primary key [symbol+date] prevents duplicates
});

// Add or update multiple stock records
export const addStockData = async (data) => {
  try {
    await db.stockData.bulkPut(data); // insert new or update existing
  } catch (err) {
    console.error("Error adding stock data:", err);
  }
};

// Get stock data for a symbol
export const getStockDataBySymbol = async (symbol) => {
  return db.stockData.where("symbol").equals(symbol).sortBy("date");
};

// Get stock data by symbol + date range
export const getStockDataByDateRange = async (symbol, startDate, endDate) => {
  return db.stockData
    .where("symbol")
    .equals(symbol)
    .and((record) => record.date >= startDate && record.date <= endDate)
    .sortBy("date");
};

export const getStoredSymbols = async () => {
  return await db.stockData.orderBy("symbol").uniqueKeys();
};
