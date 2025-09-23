import Dexie from "dexie";

// Create a single database
export const db = new Dexie("StocksDB");

db.version(1).stores({
  stockData:
    "[symbol+shortenedDate], open, close, high, low, volume, adjClose, name",
  quarterlyResult: "[symbol+date], symbol, date", // compound key + indexes
  annualResult: "[symbol+date], symbol, date",
  news: "id,symbol,date", // primary key: id, indexes: symbol + date
});

// Add or update multiple stock records
export const addStockData = async (data) => {
  const dataWithShortenedDate = data.map((item) => ({
    ...item,
    shortenedDate: item.date.split("T")[0], // Extract YYYY-MM-DD
  }));

  // Bulk insert (Dexie automatically dedupes on [symbol+shortenedDate])
  await db.stockData.bulkPut(dataWithShortenedDate);

  console.log(`✅ Stored ${dataWithShortenedDate.length} closing prices`);
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

export const getStoredSymbolsWithNames = async () => {
  const symbols = await db.stockData.orderBy("symbol").uniqueKeys();
  // For each symbol, get the first record (which contains the name)
  const symbolNamePairs = await Promise.all(
    symbols.map(async (symbol) => {
      const record = await db.stockData.where("symbol").equals(symbol).first();
      return record ? { symbol, name: record.name } : { symbol, name: null };
    })
  );
  return symbolNamePairs;
};

export const deleteSymbolData = async (symbol) => {
  try {
    await Promise.allSettled([
      db.stockData.where("symbol").equals(symbol).delete(),
      db.quarterlyResult.where("symbol").equals(symbol).delete(),
      db.annualResult.where("symbol").equals(symbol).delete(),
    ]);
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

export const getAverageVolumePast30Days = async (symbol) => {
  const today = new Date();
  const past30Days = new Date();
  past30Days.setDate(today.getDate() - 30);
  const data = await db.stockData
    .where("symbol")
    .equals(symbol)
    .and((record) => new Date(record.date) >= past30Days)
    .sortBy("date");
  if (data.length === 0) return null;

  const totalVolume = data.reduce((sum, record) => sum + record.volume, 0);
  return totalVolume / data.length;
};

export async function saveFundamentals(symbol, data) {
  // Attach symbol to each item
  const quarterly =
    data.quarterlyResult?.map((item) => ({
      ...item,
      symbol,
      date: new Date(item.date).toISOString(),
    })) || [];

  const annual =
    data.annualResult?.map((item) => ({
      ...item,
      symbol,
      date: new Date(item.date).toISOString(),
    })) || [];

  await db.transaction("rw", db.quarterlyResult, db.annualResult, async () => {
    if (quarterly.length) await db.quarterlyResult.bulkPut(quarterly);
    if (annual.length) await db.annualResult.bulkPut(annual);
  });

  console.log(`✅ Saved financials for ${symbol}`);
}

// Get quarterly data
export async function getQuarterly(symbol, startDate, endDate) {
  return db.quarterlyResult
    .where("symbol")
    .equals(symbol)
    .and((item) => {
      const d = new Date(item.date);
      return d >= new Date(startDate) && d <= new Date(endDate);
    })
    .toArray();
}

// Get annual data
export async function getAnnual(symbol, startDate, endDate) {
  return db.annualResult
    .where("symbol")
    .equals(symbol)
    .and((item) => {
      const d = new Date(item.date);
      return d >= new Date(startDate) && d <= new Date(endDate);
    })
    .toArray();
}

export async function saveNewsArticles(symbol, articles) {
  // Attach symbol to each article
  const articlesWithSymbol = articles.map((item) => ({
    ...item,
    symbol,
    date: new Date(item.date).toISOString(),
  }));

  try {
    // Bulk put (insert or update)
    await db.news.bulkPut(articlesWithSymbol);
    console.log("News saved successfully");
  } catch (error) {
    console.error("Failed to save news", error);
  }
}

export async function getNewsBySymbol(symbol) {
  return await db.news
    .where("symbol")
    .equals(symbol)
    .reverse() // latest first
    .sortBy("date");
}
