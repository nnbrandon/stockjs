import { addStockData, getStoredSymbols } from "./db";

class TickerService {
  API_URL =
    "https://fwedwy4in5lnbkpm5yuczew6gm0vnfmj.lambda-url.us-east-1.on.aws/";

  async fetchHistoricalData(symbol, start, end) {
    let data = [];

    try {
      const response = await fetch(
        `${this.API_URL}?symbol=${symbol}&start=${start}&end=${end}`
      );
      data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Error fetching stock data");
      }
    } catch (error) {
      console.error("Error fetching stock data:", error);
      throw error;
    }

    return data.map((item) => ({
      symbol: symbol,
      ...item,
    }));
  }

  async addToDB(chartData) {
    try {
      await addStockData(chartData);
    } catch (error) {
      console.error("Error adding stock data to DB:", error);
      throw error;
    }
  }
}

export default new TickerService();
