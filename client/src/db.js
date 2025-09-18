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

export const deleteSymbolData = async (symbol) => {
  try {
    await db.stockData.where("symbol").equals(symbol).delete();
    console.log(`All data for ${symbol} has been deleted.`);
  } catch (err) {
    console.error("Error deleting symbol data:", err);
  }
};

export const get52WeekStats = async (symbol) => {
  const today = new Date();
  const lastYear = new Date();
  lastYear.setFullYear(today.getFullYear() - 1);

  const data = await db.stockData
    .where("symbol")
    .equals(symbol)
    .and((record) => new Date(record.date) >= lastYear)
    .sortBy("date");

  if (data.length === 0) return null;

  const lows = data.map((d) => d.low);
  const highs = data.map((d) => d.high);

  return {
    low52: Math.min(...lows),
    high52: Math.max(...highs),
    current: data[data.length - 1].close, // latest close
  };
};
